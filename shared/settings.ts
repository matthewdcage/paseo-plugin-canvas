import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** Host-scoped preferences shared by every client of the daemon. */
export const canvasSettings = defineSettings({
  id: "canvas",
  scope: "host",
  version: 1,
  schema: z.object({
    timelineNotifications: z.boolean().default(true),
    openLinksIn: z
      .enum(["workspace-browser", "system"])
      .default("workspace-browser"),
  }),
});
export type CanvasSettings = z.output<typeof canvasSettings.schema>;
export const defaultCanvasSettings: CanvasSettings =
  canvasSettings.schema.parse({});
