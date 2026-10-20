import { expect, test, vi } from "vitest";
import { watchCanvasSettings } from "../server/settings";
import { canvasSettings, defaultCanvasSettings } from "../shared/settings";

type Listener = (state: unknown) => void;
function handle(read: () => Promise<unknown>) {
  let listener: Listener | undefined;
  const unsubscribe = vi.fn();
  return {
    settings: {
      read,
      subscribe: (next: Listener) => {
        listener = next;
        return unsubscribe;
      },
    } as never,
    notify: (state: unknown) => listener?.(state),
    unsubscribe,
  };
}
const ready = (values: object, revision = "1") => ({
  status: "ready",
  revision,
  values: canvasSettings.schema.parse(values),
});

test("defaults apply until saved preferences load, and saves update them", async () => {
  expect(defaultCanvasSettings).toEqual({
    timelineNotifications: true,
    openLinksIn: "workspace-browser",
  });
  const { settings, notify, unsubscribe } = handle(async () =>
    ready({ timelineNotifications: false }),
  );
  const watcher = watchCanvasSettings(settings);
  expect((await watcher.current()).timelineNotifications).toBe(false);
  notify(ready({ timelineNotifications: true }, "2"));
  expect((await watcher.current()).timelineNotifications).toBe(true);
  watcher.close();
  expect(unsubscribe).toHaveBeenCalledOnce();
});

test("a save notified during the initial read wins, and invalid or unreadable documents use defaults", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  let finish!: (state: unknown) => void;
  const slow = handle(() => new Promise((resolve) => (finish = resolve)));
  const watcher = watchCanvasSettings(slow.settings);
  slow.notify(ready({ openLinksIn: "system" }, "2"));
  finish(ready({ openLinksIn: "workspace-browser" }, "1"));
  expect((await watcher.current()).openLinksIn).toBe("system");

  const invalid = handle(async () => ({
    status: "invalid",
    revision: "1",
    error: "Expected boolean",
  }));
  expect(await watchCanvasSettings(invalid.settings).current()).toEqual(
    defaultCanvasSettings,
  );
  const failed = handle(async () => {
    throw new Error("Plugin session closed");
  });
  expect(await watchCanvasSettings(failed.settings).current()).toEqual(
    defaultCanvasSettings,
  );
  expect(error).toHaveBeenCalledTimes(2);
  error.mockRestore();
});
