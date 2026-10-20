import { test, expect } from "vitest";
import { mathSvg } from "../server/math";
import { GraphicsRenderer } from "../server/graphics";
import { imageResultSchema, isSvgSource } from "../shared/media";
test("real local renderer draws math without a browser, rejects invalid input and remains usable", async () => {
  const renderer = new GraphicsRenderer();
  const base = {
    display: true,
    foreground: "#fafafa",
    background: "#181b1a",
    fontSize: 16,
  };
  try {
    for (const [kind, source] of [
      ["math", "\\frac{n(n+1)}{2}"],
      ["math", "\\sum_{i=1}^n i = \\text{日本語}"],
    ] as const) {
      const result = await renderer.render({ ...base, kind, source });
      imageResultSchema.parse(result);
      expect(
        Buffer.from(result.uri.split(",")[1], "base64").subarray(0, 8),
      ).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(result.width).toBeGreaterThan(20);
      expect(result.height).toBeGreaterThan(20);
      expect(await renderer.render({ ...base, kind, source })).toEqual(result);
    }
    await renderer.render({
      ...base,
      kind: "math",
      source: "\\newcommand{\\canvasmacro}{x}\\canvasmacro",
    });
    await expect(
      renderer.render({ ...base, kind: "math", source: "\\canvasmacro" }),
    ).rejects.toThrow();
    await expect(
      renderer.render({ ...base, kind: "math", source: "\\invalidcommand" }),
    ).rejects.toThrow();
    expect(
      (
        await renderer.render({
          ...base,
          display: false,
          kind: "math",
          source: "a^2",
        })
      ).width,
    ).toBeGreaterThan(10);
  } finally {
    await renderer.close();
  }
  await expect(
    renderer.render({ ...base, kind: "math", source: "a" }),
  ).rejects.toThrow("shut down");
}, 60_000);

test("inline math retains both sides of relation operators in one SVG", () => {
  const svg = mathSvg({
    kind: "math",
    source: "E=mc^2",
    display: false,
    foreground: "#eeeeee",
    background: "#111111",
    fontSize: 16,
  });
  expect(svg).toContain('data-c="3D"');
  expect(svg).toContain('data-c="32"');
  expect(svg).toContain('data-latex="m"');
  expect(svg).toContain('data-latex="c"');
  const width = Number(/width="([\d.]+)"/.exec(svg)?.[1]);
  expect(width).toBeGreaterThan(50);
});

const pngSize = (uri: string) => {
  const png = Buffer.from(uri.split(",")[1], "base64");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
};

test("SVG is rasterized at twice its own size, and large SVGs lower their pixel density", async () => {
  const renderer = new GraphicsRenderer();
  const svg = (width: number, height: number, body = "") =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`;
  try {
    const text = await renderer.render({
      kind: "svg",
      source: svg(
        200,
        40,
        '<text x="4" y="30" font-family="Arial" font-size="20">Canvas 日本語</text>',
      ),
    });
    imageResultSchema.parse(text);
    expect(text).toMatchObject({ width: 200, height: 40 });
    expect(pngSize(text.uri)).toEqual({ width: 400, height: 80 });
    // Unknown font families fall back to the bundled font instead of dropping text.
    const blank = await renderer.render({ kind: "svg", source: svg(200, 40) });
    expect(text.uri.length).toBeGreaterThan(blank.uri.length * 2);

    const tall = await renderer.render({ kind: "svg", source: svg(800, 6000) });
    expect(tall.width).toBeCloseTo(800, 0);
    expect(tall.height).toBe(6000);
    expect(pngSize(tall.uri).height).toBeLessThanOrEqual(8192);
    const huge = await renderer.render({
      kind: "svg",
      source: svg(40_000, 20_000),
    });
    imageResultSchema.parse(huge);
    expect(huge.width / huge.height).toBeCloseTo(2);
    expect(pngSize(huge.uri).width).toBeLessThanOrEqual(4096);

    for (const source of ["<html></html>", "<svg", svg(0, 0)])
      await expect(renderer.render({ kind: "svg", source })).rejects.toThrow();
    await expect(
      renderer.render({ kind: "svg", source: "x".repeat(5_000_001) }),
    ).rejects.toThrow();
  } finally {
    await renderer.close();
  }
}, 60_000);

test("a render that exceeds its time limit stops the worker, and the next render starts a new one", async () => {
  const renderer = new GraphicsRenderer();
  const rasterizer = renderer["rasterizer"] as unknown as { timeout: number };
  const source =
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
  try {
    rasterizer.timeout = 1;
    await expect(renderer.render({ kind: "svg", source })).rejects.toThrow(
      "Rendering took too long",
    );
    rasterizer.timeout = 10_000;
    expect(await renderer.render({ kind: "svg", source })).toMatchObject({
      width: 10,
      height: 10,
    });
  } finally {
    await renderer.close();
  }
  await expect(renderer.render({ kind: "svg", source })).rejects.toThrow(
    "shut down",
  );
}, 60_000);

test("SVG detection skips the prolog without backtracking", () => {
  for (const text of [
    "<svg/>",
    "\uFEFF  <svg xmlns='http://www.w3.org/2000/svg'>",
    '<?xml version="1.0"?>\n<!-- a --><!-- b -->\n<svg>',
    '<!DOCTYPE svg [<!ENTITY a "b">]>\n<svg\nwidth="1">',
  ])
    expect(isSvgSource(text), text).toBe(true);
  for (const text of [
    "",
    "<svgx>",
    "<html><svg></svg></html>",
    "<!-- <svg>",
    "<?xml version='1.0'",
    "<!DOCTYPE svg [<!ENTITY a 'b'>",
  ])
    expect(isSvgSource(text), text).toBe(false);
  const started = performance.now();
  expect(isSvgSource("<!-- a -->".repeat(100_000) + "<x>")).toBe(false);
  expect(performance.now() - started).toBeLessThan(1_000);
});
