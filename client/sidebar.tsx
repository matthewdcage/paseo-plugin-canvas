import { Text, View } from "react-native";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import type {
  PluginPopoverProps,
  PluginSidebarItemProps,
} from "@getpaseo/plugin/client";
import {
  EmptyState,
  PluginThemeProvider,
  useRpcQuery,
} from "paseo-plugin-helper/client";
import { recentCanvases } from "../shared/contracts";
import { CanvasRow } from "./panel";
import { CANVAS_SCREEN, canvasScreenParams, useHostNotice } from "./screen";
import { metaText, titleText } from "./controls";

const RECENT_LIMIT = 10;

export function CanvasSidebarItem({
  currentScreen,
  openPopover,
}: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="NotebookPen"
      active={currentScreen?.screenId === CANVAS_SCREEN}
      onPress={() => openPopover(RecentCanvasesPopover)}
    />
  );
}

/** Anchored to the sidebar row on wide layouts; a bottom sheet on compact. */
export function RecentCanvasesPopover({
  theme,
  host,
  layout,
  openScreen,
}: PluginPopoverProps) {
  const colors = theme.colors;
  const notice = useHostNotice(host);
  const recent = useRpcQuery(
    recentCanvases,
    { limit: RECENT_LIMIT },
    { enabled: !notice, retry: false },
  );
  const error = recent.error ?? recent.failureReason;
  const message = (text: string, color: string, alert = false) => (
    <Text
      accessibilityRole={alert ? "alert" : undefined}
      style={{ ...metaText, color, paddingHorizontal: 12, paddingVertical: 8 }}
    >
      {text}
    </Text>
  );
  return (
    <PluginThemeProvider theme={theme} layout={layout}>
      <View
        style={{
          width: layout.compact ? undefined : 320,
          maxHeight: 440,
          padding: 8,
          gap: 4,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{
            ...titleText,
            color: colors.foreground,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          Recent canvases
        </Text>
        {notice ? (
          message(notice, colors.statusWarning, true)
        ) : error ? (
          message(
            `Unable to load canvases: ${error.message}`,
            colors.statusDanger,
            true,
          )
        ) : !recent.data ? (
          message("Loading…", colors.foregroundMuted)
        ) : recent.data.items.length === 0 ? (
          <EmptyState
            icon={null}
            title="No canvases yet"
            description="Create a canvas in a workspace or ask an agent to create one"
            style={{ padding: 16 }}
          />
        ) : (
          <ScrollView contentContainerStyle={{ gap: 4 }}>
            {recent.data.items.map((item) => (
              <CanvasRow
                key={`${item.workspaceId}/${item.canvasId}`}
                title={item.title}
                state={item.editState}
                workspaceName={item.workspaceName}
                active={false}
                theme={theme}
                // Opening a screen closes the popover.
                onPress={() =>
                  openScreen({
                    screenId: CANVAS_SCREEN,
                    params: canvasScreenParams(item.workspaceId, item.canvasId),
                  })
                }
              />
            ))}
          </ScrollView>
        )}
      </View>
    </PluginThemeProvider>
  );
}
