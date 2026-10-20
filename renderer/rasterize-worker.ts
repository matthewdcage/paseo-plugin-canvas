import { parentPort, workerData } from "node:worker_threads";
import { Resvg, initWasm, type ResvgRenderOptions } from "@resvg/resvg-wasm";
import type { RasterJob, RasterReply } from "../server/rasterize";

const { wasm, font } = workerData as { wasm: Uint8Array; font: Uint8Array };
const ready = initWasm(wasm);
const family = "Noto Sans JP";
const fonts = {
  fontBuffers: [font],
  defaultFontFamily: family,
  sansSerifFamily: family,
  serifFamily: family,
  monospaceFamily: family,
  cursiveFamily: family,
  fantasyFamily: family,
};

function zoom(job: RasterJob, width: number, height: number) {
  if (!(width > 0 && height > 0 && Number.isFinite(width * height)))
    throw new Error("The SVG has no displayable size");
  if (job.oversize === "reject") {
    if (width > 8192 || height > 8192 || width * height > 16_000_000)
      throw new Error("The expression exceeds the maximum display size");
    return 2;
  }
  return Math.min(
    2,
    4096 / width,
    8192 / height,
    Math.sqrt(16_000_000 / (width * height)),
  );
}

function draw(job: RasterJob) {
  const options = (value: number): ResvgRenderOptions => ({
    background: job.background,
    fitTo: { mode: "zoom", value },
    font: fonts,
  });
  let renderer = new Resvg(job.svg, options(2));
  try {
    // width and height are the SVG's own size, before zooming.
    const scale = zoom(job, renderer.width, renderer.height);
    if (scale !== 2) {
      const measured = renderer;
      renderer = new Resvg(job.svg, options(scale));
      measured.free();
    }
    const image = renderer.render();
    try {
      const uri = `data:image/png;base64,${Buffer.from(image.asPng()).toString("base64")}`;
      return { uri, width: image.width / scale, height: image.height / scale };
    } finally {
      image.free();
    }
  } finally {
    renderer.free();
  }
}

parentPort!.on("message", async (job: RasterJob) => {
  let reply: RasterReply;
  try {
    await ready;
    reply = { id: job.id, ...draw(job) };
  } catch (error) {
    reply = {
      id: job.id,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  parentPort!.postMessage(reply);
});
