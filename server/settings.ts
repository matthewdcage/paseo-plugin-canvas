import type {
  PluginSettings,
  PluginSettingsState,
} from "@getpaseo/plugin/server";
import {
  defaultCanvasSettings,
  type CanvasSettings,
  type canvasSettings,
} from "../shared/settings";

type Schema = typeof canvasSettings.schema;

/** Keeps the latest saved preferences. Invalid documents fall back to the
 * defaults, so a broken file never disables saving canvases. */
export function watchCanvasSettings(settings: PluginSettings<Schema>) {
  let values: CanvasSettings = defaultCanvasSettings;
  let notified = false;
  const apply = (state: PluginSettingsState<Schema>) => {
    if (state.status === "ready") values = state.values;
    else {
      values = defaultCanvasSettings;
      console.error(
        "[paseo-canvas] Canvas settings are invalid; using defaults",
        state.error,
      );
    }
  };
  const unsubscribe = settings.subscribe((state) => {
    notified = true;
    apply(state);
  });
  const loaded = settings.read().then(
    // A save notified while reading is newer than the read result.
    (state) => {
      if (!notified) apply(state);
    },
    (error) =>
      console.error("[paseo-canvas] Canvas settings could not be read", error),
  );
  return {
    async current() {
      await loaded;
      return values;
    },
    close: unsubscribe,
  };
}
export type CanvasSettingsWatcher = ReturnType<typeof watchCanvasSettings>;
