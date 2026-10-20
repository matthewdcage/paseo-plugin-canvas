// Visual-test fixture for @getpaseo/plugin/client. Paseo's app adds these
// exports when it evaluates a plugin; the npm package only declares them.
export * from "../../node_modules/@getpaseo/plugin/dist/client/index.js";
import { defaultCanvasSettings } from "../../shared/settings";

declare const window: {
  open(url: string, target: string, features: string): unknown;
};

export function useSettings() {
  return {
    status: "ready" as const,
    values: defaultCanvasSettings,
    revision: "fixture",
    saving: false,
    saveError: null,
    save: async () => false,
    reset: async () => false,
    reload: async () => {},
  };
}

export async function openExternalUrl(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}
