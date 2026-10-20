import { test, expect, vi } from "vitest";
import { mkdtemp, writeFile, mkdir, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { workspaceImage } from "../server/images";
import { GraphicsRenderer } from "../server/graphics";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64",
);
const unused = {
  render: () => Promise.reject(new Error("Only SVG files are rendered")),
};
test("workspace images resolve encoded paths and reject traversal, external symlinks and nonimages", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "canvas-images-"));
  try {
    const root = path.join(directory, "workspace");
    await mkdir(root);
    await writeFile(path.join(root, "画像.png"), png);
    await writeFile(path.join(directory, "outside.png"), png);
    await writeFile(path.join(root, "fake.png"), "not an image");
    await writeFile(path.join(directory, "outside.svg"), "<svg/>");
    await symlink(
      path.join(directory, "outside.png"),
      path.join(root, "link.png"),
    );
    await symlink(
      path.join(directory, "outside.svg"),
      path.join(root, "link.svg"),
    );
    const result = await workspaceImage(
      root,
      "%E7%94%BB%E5%83%8F.png",
      unused,
    );
    expect(result.uri).toBe(`data:image/png;base64,${png.toString("base64")}`);
    for (const src of [
      "../outside.png",
      "%2e%2e/outside.png",
      "link.png",
      "link.svg",
      "file:///tmp/image.png",
      "fake.png",
    ])
      await expect(workspaceImage(root, src, unused)).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("workspace SVG files are rasterized with their display size, whatever their extension", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "canvas-images-"));
  const graphics = new GraphicsRenderer();
  try {
    const svg =
      '<?xml version="1.0" encoding="UTF-8"?>\n<!-- 図 -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg xmlns="http://www.w3.org/2000/svg" width="120" height="30"><rect width="120" height="30" fill="#336699"/></svg>';
    await writeFile(path.join(directory, "diagram.svg"), svg);
    await writeFile(path.join(directory, "diagram.txt"), svg);
    await writeFile(path.join(directory, "page.svg"), "<html></html>");
    const render = vi.spyOn(graphics, "render");
    for (const src of ["diagram.svg", "diagram.txt"]) {
      const result = await workspaceImage(directory, src, graphics);
      expect(result).toMatchObject({ width: 120, height: 30 });
      expect(result.uri).toMatch(/^data:image\/png;base64,/);
    }
    expect(render).toHaveBeenCalledWith({ kind: "svg", source: svg });
    await expect(workspaceImage(directory, "page.svg", graphics)).rejects.toThrow(
      "Supported image formats are PNG, JPEG, GIF, WebP, and SVG",
    );
  } finally {
    await graphics.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
