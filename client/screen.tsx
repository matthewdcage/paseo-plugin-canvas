import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import {
  useHosts,
  useWorkspace,
  type PluginHostProps,
  type PluginScreenParams,
  type PluginScreenProps,
} from "@getpaseo/plugin/client";
import { EmptyState, PluginThemeProvider } from "paseo-plugin-helper/client";
import { idSchema } from "../shared/contracts";
import { CanvasPanel } from "./panel";
import { createCanvasSelection } from "./selection";
import { ToolbarButton, metaText } from "./controls";

export const CANVAS_SCREEN = "canvas";

/** Screen params live in the URL, so reload and back/forward keep the canvas. */
export function canvasScreenParams(
  workspaceId: string,
  canvasId: string | null,
): PluginScreenParams {
  return canvasId ? { workspaceId, canvasId } : { workspaceId };
}

const validId = (value: string | undefined) =>
  value !== undefined && idSchema.safeParse(value).success ? value : null;

/** Connection notice for a host that cannot serve Canvas RPCs right now. */
export function useHostNotice(host: PluginHostProps["host"]) {
  const status = useHosts().find(
    (entry) => entry.serverId === host.id,
  )?.status;
  if (!status || status === "online") return null;
  return status === "idle" || status === "connecting"
    ? `Connecting to ${host.label}…`
    : `${host.label} is offline. Canvas changes appear after it reconnects.`;
}

export function CanvasScreen({
  params,
  theme,
  host,
  layout,
  navigation,
}: PluginScreenProps) {
  const workspaceId = validId(params.workspaceId);
  const canvasId = validId(params.canvasId);
  // The screen keeps its own selection and editor, separate from the
  // workspace panel, which may stay mounted behind it.
  const [selection] = useState(() => {
    const initial = createCanvasSelection();
    if (workspaceId && canvasId) initial.selectDirect(workspaceId, canvasId);
    return initial;
  });
  useEffect(() => {
    // Reopening with other params asks before discarding a dirty draft.
    if (workspaceId && canvasId && selection.get(workspaceId) !== canvasId)
      selection.select(workspaceId, canvasId);
  }, [selection, workspaceId, canvasId]);
  if (!workspaceId)
    return (
      <PluginThemeProvider theme={theme} layout={layout}>
        <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
          <EmptyState
            icon={null}
            title="No workspace selected"
            description="Open a canvas from the sidebar or from a workspace's Canvas panel"
            style={{ flex: 1, padding: 16 }}
          />
        </View>
      </PluginThemeProvider>
    );
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <PluginThemeProvider theme={theme} layout={layout}>
        <WorkspaceBar
          workspaceId={workspaceId}
          theme={theme}
          host={host}
          openWorkspace={navigation?.openWorkspace}
        />
      </PluginThemeProvider>
      <CanvasPanel
        context="workspace"
        workspaceId={workspaceId}
        theme={theme}
        host={host}
        layout={layout}
        navigation={navigation}
        selection={selection}
      />
    </View>
  );
}

function WorkspaceBar({
  workspaceId,
  theme,
  host,
  openWorkspace,
}: Pick<PluginScreenProps, "theme" | "host"> & {
  workspaceId: string;
  openWorkspace:
    | NonNullable<PluginScreenProps["navigation"]>["openWorkspace"]
    | undefined;
}) {
  const colors = theme.colors;
  const workspace = useWorkspace(workspaceId, ({ name, title }) => ({
    name,
    title,
  }));
  const notice = useHostNotice(host);
  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderBottomWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Icon name="FolderOpen" size={16} color={colors.foregroundMuted} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{ ...metaText, color: colors.foreground }}
        >
          {workspace
            ? workspace.title || workspace.name
            : "Workspace unavailable"}
        </Text>
        {notice && (
          <Text
            accessibilityRole="alert"
            style={{ ...metaText, color: colors.statusWarning }}
          >
            {notice}
          </Text>
        )}
      </View>
      {openWorkspace && workspace && (
        <ToolbarButton
          icon="ArrowUpRight"
          label="Open workspace"
          onPress={() => openWorkspace({ workspaceId, serverId: host.id })}
        />
      )}
    </View>
  );
}
