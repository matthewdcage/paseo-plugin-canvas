import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CanvasStore } from "../server/store";
import { CanvasError } from "../server/errors";
import { recentCanvases } from "../server/recent";
import type { Actor } from "../shared/contracts";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
const actor = (workspaceId: string): Actor => ({
  agentId: "agent-a",
  workspaceId,
  title: "Plan",
  sessionId: "session-a",
});
function paseo(pages: { id: string; name: string; title?: string | null }[][]) {
  const list = vi.fn(async (options: { page: { cursor?: string } }) => {
    const index = options.page.cursor ? Number(options.page.cursor) : 0;
    const hasMore = index + 1 < pages.length;
    return {
      entries: pages[index],
      pageInfo: { hasMore, nextCursor: hasMore ? String(index + 1) : null },
    };
  });
  return { list, api: { workspaces: { list } } as never };
}

test("recent canvases merge active workspaces newest first and name their workspace", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "canvas-recent-"));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  let now = Date.parse("2026-10-01T00:00:00Z");
  const store = await CanvasStore.open(dir, { clock: () => (now += 1000) });
  cleanup.push(() => store.close());
  await store.create(actor("workspace-a"), "Oldest", "# A");
  await store.create(actor("archived"), "Archived", "# B");
  await store.create(actor("workspace-b"), "Middle", "# C");
  await store.create(actor("workspace-a"), "Newest", "# D");
  const { list, api } = paseo([
    [{ id: "workspace-a", name: "repo", title: "Feature A" }],
    [
      { id: "workspace-b", name: "repo-b", title: null },
      { id: "empty", name: "empty" },
    ],
  ]);
  const { items } = await recentCanvases(store, api, 10);
  expect(list).toHaveBeenCalledTimes(2);
  expect(
    items.map(({ title, workspaceName }) => [title, workspaceName]),
  ).toEqual([
    ["Newest", "Feature A"],
    ["Middle", "repo-b"],
    ["Oldest", "Feature A"],
  ]);
  expect((await recentCanvases(store, api, 1)).items).toHaveLength(1);
});

test("an unreadable workspace is skipped, but an unavailable store fails the request", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const items = [{ title: "Readable", updatedAt: "2026-10-01T00:00:00Z" }];
  const store = {
    list: vi.fn(async (workspaceId: string) => {
      if (workspaceId === "broken")
        throw new CanvasError("CORRUPT_DOCUMENT", "Canvas is not valid UTF-8");
      return { items, observedAt: "" };
    }),
  };
  const { api } = paseo([
    [
      { id: "broken", name: "broken" },
      { id: "fine", name: "fine" },
    ],
  ]);
  await expect(
    recentCanvases(store as never, api, 10),
  ).resolves.toMatchObject({
    items: [{ title: "Readable", workspaceName: "fine" }],
  });
  expect(error).toHaveBeenCalledOnce();
  store.list.mockRejectedValue(
    new CanvasError("STORE_UNAVAILABLE", "Canvas store is closed"),
  );
  await expect(recentCanvases(store as never, api, 10)).rejects.toThrow(
    "Canvas store is closed",
  );
  error.mockRestore();
});
