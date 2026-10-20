import { Worker } from "node:worker_threads";
import {
  rasterizerWasm,
  japaneseFont,
  rasterizerWorker,
} from "./generated/rasterizer";
import { displaySizeLimit, type GraphicImage } from "../shared/media";
/**
 * Messages of renderer/rasterize-worker.ts. `reject` keeps math within its
 * display limits; `shrink` lowers the pixel density of large SVG images
 * instead of failing.
 */
export type RasterJob = {
  id: number;
  svg: string;
  background?: string;
  oversize: "reject" | "shrink";
};
export type RasterReply =
  | { id: number; uri: string; width: number; height: number }
  | { id: number; error: string };
let assets: { wasm: Uint8Array; font: Uint8Array } | undefined;
/**
 * Runs resvg on a worker thread so that a slow SVG cannot stall the plugin
 * process. A timed-out or crashed worker is terminated and replaced on demand.
 */
export class Rasterizer {
  private worker?: Worker;
  private closed = false;
  private next = 0;
  private jobs = new Map<
    number,
    { resolve: (image: GraphicImage) => void; reject: (error: Error) => void }
  >();
  constructor(private timeout = 10_000) {}
  render(
    svg: string,
    options: Omit<RasterJob, "id" | "svg">,
  ): Promise<GraphicImage> {
    if (this.closed)
      return Promise.reject(new Error("The rendering service has shut down"));
    const worker = (this.worker ??= this.spawn());
    const id = this.next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.fail(worker, new Error("Rendering took too long")),
        this.timeout,
      );
      const settle =
        <T>(callback: (value: T) => void) =>
        (value: T) => {
          clearTimeout(timer);
          callback(value);
        };
      this.jobs.set(id, { resolve: settle(resolve), reject: settle(reject) });
      worker.postMessage({ id, svg, ...options } satisfies RasterJob);
    });
  }
  async close() {
    this.closed = true;
    const worker = this.worker;
    if (!worker) return;
    this.fail(worker, new Error("The rendering service has shut down"));
    await worker.terminate();
  }
  private spawn() {
    assets ??= {
      wasm: Buffer.from(rasterizerWasm, "base64"),
      font: Buffer.from(japaneseFont, "base64"),
    };
    const worker = new Worker(rasterizerWorker, {
      eval: true,
      workerData: assets,
    });
    // Pending jobs keep the process alive through their timers.
    worker.unref();
    worker.on("message", ({ id, ...result }: RasterReply) => {
      const job = this.jobs.get(id);
      if (!job) return;
      this.jobs.delete(id);
      if ("error" in result) {
        job.reject(new Error(result.error));
        return;
      }
      // Keeps the aspect ratio of very large SVGs within the display contract.
      const fit = Math.min(
        1,
        displaySizeLimit / Math.max(result.width, result.height),
      );
      job.resolve({
        uri: result.uri,
        width: result.width * fit,
        height: result.height * fit,
      });
    });
    worker.on("error", (error) => this.fail(worker, error));
    worker.on("exit", () =>
      this.fail(worker, new Error("The renderer stopped unexpectedly")),
    );
    return worker;
  }
  private fail(worker: Worker, error: Error) {
    if (this.worker !== worker) return;
    this.worker = undefined;
    void worker.terminate();
    for (const job of this.jobs.values()) job.reject(error);
    this.jobs.clear();
  }
}
