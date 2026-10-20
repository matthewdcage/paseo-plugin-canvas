import { open, realpath } from "node:fs/promises";
import path from "node:path";
import { isSvgSource, svgSourceLimit } from "../shared/media";
import type { GraphicsRenderer } from "./graphics";
const limit = svgSourceLimit;
export function imageMime(bytes: Uint8Array): string {
  const b = Buffer.from(bytes);
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (/^GIF8[79]a/.test(b.subarray(0, 6).toString())) return "image/gif";
  if (
    b.subarray(0, 4).toString() === "RIFF" &&
    b.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  throw new Error("Supported image formats are PNG, JPEG, GIF, WebP, and SVG");
}
function svgSource(bytes: Uint8Array) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return isSvgSource(text) ? text : undefined;
  } catch {
    return undefined;
  }
}
/** SVG files are rasterized on the daemon because native clients cannot draw SVG. */
export async function workspaceImage(
  directory: string,
  src: string,
  graphics: Pick<GraphicsRenderer, "render">,
) {
  if (/^[a-z][\w+.-]*:|^\/\/|[\\\u0000]/i.test(src))
    throw new Error("Specify an image path within the workspace");
  let decoded: string;
  try {
    decoded = decodeURIComponent(src.split(/[?#]/)[0]);
  } catch {
    throw new Error("Invalid image path");
  }
  if (decoded.includes("\0") || decoded.includes("\\"))
    throw new Error("Invalid image path");
  const root = await realpath(directory);
  const target = await realpath(
    path.resolve(root, decoded.replace(/^\/+/, "")),
  );
  const relative = path.relative(root, target);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    throw new Error("Images outside the workspace cannot be displayed");
  const file = await open(target, "r");
  let data: Buffer;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > limit)
      throw new Error("The image must be a regular file no larger than 5 MB");
    const buffer = Buffer.alloc(limit + 1);
    let size = 0;
    for (;;) {
      const { bytesRead } = await file.read(
        buffer,
        size,
        buffer.length - size,
        null,
      );
      if (!bytesRead) break;
      size += bytesRead;
      if (size > limit) throw new Error("The image must be no larger than 5 MB");
    }
    data = buffer.subarray(0, size);
  } finally {
    await file.close();
  }
  const svg = svgSource(data);
  if (svg !== undefined) return graphics.render({ kind: "svg", source: svg });
  return { uri: `data:${imageMime(data)};base64,${data.toString("base64")}` };
}
