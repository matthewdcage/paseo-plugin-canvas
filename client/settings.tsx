import { Text, View } from "react-native";
import {
  useSettings,
  type PluginSurfaceProps,
  type SettingsState,
} from "@getpaseo/plugin/client";
import {
  ExternalLink,
  SettingsAction,
  SettingsCard,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { canvasSettings, type CanvasSettings } from "../shared/settings";
import { metaText } from "./controls";

export const SETTINGS_SCREEN = "canvas";
const DOCUMENTATION =
  "https://github.com/supermomonga/paseo-plugin-canvas#readme";
const linkTargets = [
  { label: "Workspace browser", value: "workspace-browser" },
  { label: "System browser", value: "system" },
] as const;
type Ready = Extract<
  SettingsState<typeof canvasSettings.schema>,
  { status: "ready" }
>;

export function CanvasSettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(canvasSettings);
  const colors = theme.colors;
  if (settings.status === "loading")
    return (
      <Text style={{ ...metaText, color: colors.foregroundMuted }}>
        Loading…
      </Text>
    );
  if (settings.status !== "ready")
    return (
      <SettingsSection title="Canvas">
        <SettingsCard>
          <SettingsAction
            label="Settings are unavailable"
            hint={settings.error}
            actionLabel={
              settings.status === "invalid" ? "Reset to defaults" : "Retry"
            }
            disabled={settings.saving}
            error={settings.saveError}
            onPress={() =>
              void (settings.status === "invalid"
                ? settings.reset()
                : settings.reload())
            }
          />
        </SettingsCard>
      </SettingsSection>
    );
  return <Controls settings={settings} theme={theme} />;
}

function Controls({
  settings,
  theme,
}: {
  settings: Ready;
  theme: PluginSurfaceProps["theme"];
}) {
  // Each control saves immediately against the revision it displays.
  const save = (change: Partial<CanvasSettings>) =>
    void settings.save({ ...settings.values, ...change }, settings.revision);
  return (
    <View style={{ gap: 24 }}>
      <SettingsSection title="Timeline">
        <SettingsCard>
          <SettingsSwitch
            label="Canvas notifications"
            hint="Add a row with an Open canvas button to the agent's timeline when it creates or updates a canvas."
            value={settings.values.timelineNotifications}
            disabled={settings.saving}
            error={settings.saveError}
            onValueChange={(timelineNotifications) =>
              save({ timelineNotifications })
            }
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Links">
        <SettingsCard>
          <SettingsSelect
            label="Open web links in"
            hint="The workspace browser is available in the desktop app. Other clients always use the system browser."
            value={settings.values.openLinksIn}
            options={linkTargets}
            disabled={settings.saving}
            error={settings.saveError}
            onValueChange={(openLinksIn) => save({ openLinksIn })}
          />
        </SettingsCard>
      </SettingsSection>
      <View style={{ gap: 8 }}>
        <Text style={{ ...metaText, color: theme.colors.foregroundMuted }}>
          Settings apply to every client of this host.
        </Text>
        <ExternalLink href={DOCUMENTATION}>Canvas documentation</ExternalLink>
      </View>
    </View>
  );
}
