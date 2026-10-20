---
number: 16
title: Rasterize SVG on a daemon worker and retry unrenderable remote images from the viewing device
status: accepted
date: 2026-10-20
links:
- target: 5
  kind: amends
- target: 6
  kind: amends
---

# Rasterize SVG on a daemon worker and retry unrenderable remote images from the viewing device

## Context and Problem Statement

The user asked for SVG images in canvases, including on mobile. Workspace images accepted only PNG, JPEG, GIF and WebP, and raw `<svg>` HTML is shown as text (ADR 5). The React Native `Image` used for document images cannot draw SVG on iOS or Android, and ADR 6 excludes WebView and added native modules such as `react-native-svg`. Mathematics already reaches every client as a PNG drawn by resvg WASM on the daemon.

Three sources were requested: SVG files in the workspace, SVG written into the canvas, and SVG at HTTP(S) URLs. Rasterizing an arbitrary SVG is not bounded like a TeX expression. In a probe with `@resvg/resvg-wasm` 2.6.2, a 2048×2048 SVG with a large Gaussian blur and turbulence filter did not finish within ten seconds. resvg runs synchronously, so it blocks whichever thread it runs on.

## Decision Drivers

* The same SVG appears on Electron, web, iOS and Android without WebView or new native modules (ADR 6).
* One slow or hostile SVG must not stall canvas RPCs or the Canvas MCP server.
* The daemon does not start contacting hosts named in canvas content; external images keep loading from the viewing device (ADR 5).
* Input, pixel and transfer sizes stay bounded.

## Considered Options

* Rasterize SVG on the daemon with the bundled resvg WASM, on a worker thread.
* Rasterize SVG on the daemon with resvg on the plugin process's main thread, as mathematics did.
* Draw SVG on the client with `react-native-svg` or a custom SVG-to-View renderer.

For remote SVG URLs:

* Let the viewing device fetch the SVG after a direct load fails, and send it to the daemon for rasterization.
* Let the daemon fetch the URL and rasterize it.
* Do not support remote SVG on clients that cannot draw it.

## Decision Outcome

Chosen options: "Rasterize SVG on the daemon with the bundled resvg WASM, on a worker thread" and "Let the viewing device fetch the SVG after a direct load fails", because they reuse the renderer that already ships with the plugin, keep slow renders off the plugin process's main thread, and keep the daemon away from external URLs.

**Sources.** A workspace file is treated as SVG by its content (an `svg` root after an optional BOM, prolog, comments and doctype), not by its extension, and uses the existing workspace path and symlink checks. A ` ```svg ` code block is rendered like display mathematics, with **Show source** for the original text. Raw `<svg>` HTML stays inert text (ADR 5).

**Worker.** All rasterization, including mathematics, runs in one `worker_threads` worker. Paseo runs plugin servers in their own Node process with Node's `require`, but its compiler accepts modules only from `client/`, `server/` and `shared/`. The build therefore bundles `renderer/rasterize-worker.ts` into a source string beside the resvg WASM and font, and the server starts it with `eval: true`. A render has ten seconds; on timeout or crash the worker is terminated, pending renders fail and the next render starts a new worker. Renders remain serialized and cached by input as before.

**Limits.** SVG source is limited to 5 MB, matching local images. SVG is drawn at twice its own size, reduced as needed to at most 4096 pixels wide, 8192 pixels tall and 16 million pixels. Mathematics keeps rejecting oversized expressions. Responses carry a display size of at most 16384 per side, so clients do not measure the PNG. External references inside the SVG are not resolved; text uses the bundled Noto Sans JP for every font family; transparent areas stay transparent.

**Remote images.** The client loads an HTTP(S) image with `Image` first, so browsers that can draw an SVG keep it as vectors. If loading fails, the viewing device fetches the URL once (15-second timeout, 5 MB limit, SVG content check) and sends the text through the existing `canvas.render_graphic` RPC. Paseo's WebSocket message limit is 100 MB. The daemon never connects to the URL. In the web build, cross-origin servers must allow CORS for this retry.

This amends ADR 5 by adding SVG to the workspace image formats and a device-side retry for remote images, and ADR 6 by extending daemon rasterization to SVG on a worker thread.

### Consequences

* Good, because SVG appears on every client with the renderer and font already bundled, and without native modules.
* Good, because a slow SVG costs at most ten seconds of one worker and cannot block canvas RPCs or MCP.
* Good, because the daemon makes no outbound requests for canvas content.
* Bad, because rasterized SVG loses sharpness when enlarged, its text cannot be selected, and its fonts may differ from the author's.
* Bad, because a remote image that fails to load is downloaded a second time, and its SVG source is uploaded to the daemon.
* Bad, because one slow SVG delays later renders, including mathematics, until it finishes or times out.
* Bad, because dark-on-transparent SVGs can be hard to read in a dark theme.
* Bad, because agent saves do not return diagnostics for SVG that fails to render.

### Confirmation

`tests/graphics.test.ts` checks PNG sizes, reduced pixel density for large SVGs, rejected input, recovery after a timeout and SVG detection without backtracking. `tests/images.test.ts` covers workspace SVG detection and path restrictions. `tests/ui.test.tsx` covers the remote retry on web, iOS and Android settings, code blocks and source display. `tests/bundle.test.ts` renders SVG through the worker from inside the bundle compiled by Paseo's compiler. Real iOS and Android devices have not been checked.

## Pros and Cons of the Options

### Daemon resvg on a worker thread

* Good, because the worker can be terminated without restarting the plugin process.
* Bad, because the worker's source is generated at build time and evaluated as a string.

### Daemon resvg on the main thread

* Good, because it needs no worker protocol.
* Bad, because the probe SVG would block the plugin process for more than ten seconds.

### Client-side SVG drawing

* Good, because SVG would stay vector graphics.
* Bad, because `react-native-svg` is a native module the host does not expose (ADR 6), and a custom renderer would have to reimplement SVG layout, text and filters.

### Device fetch with daemon rasterization

* Good, because requests still come from the viewing device, as with other external images.
* Bad, because the web build depends on CORS for the retry.

### Daemon fetch

* Good, because it would work regardless of CORS.
* Bad, because canvas content could make the daemon request local or internal network addresses, and it would change who contacts external hosts.

### No remote SVG on mobile

* Good, because it needs no retry path.
* Bad, because the same canvas would show different content on mobile.

## More Information

See [rasterizer](../../server/rasterize.ts), [worker](../../renderer/rasterize-worker.ts), [graphics renderer](../../server/graphics.ts), [image loading](../../server/images.ts), [client media](../../client/media.tsx) and [UI guidance](../ui.md#markdownの表示). Revisit if Paseo exposes a cross-platform SVG component publicly, or if agents need save-time diagnostics for SVG.
