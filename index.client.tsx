import { useRpc, type PluginClientContext } from "@getpaseo/plugin/client";
import {
  Icon,
  Modal,
  useToast,
  ScrollView,
  FlatList,
  TextInput,
  copyText,
} from "@getpaseo/plugin/client/react-native";
import { initClientHelpers } from "paseo-plugin-helper/client";
import { registerNativeCanvasHeaders } from "./client/header";
import { CanvasPanel } from "./client/panel";
import { CanvasActivityRow, startActivitySync } from "./client/activity";
import {
  CANVAS_SCREEN,
  CanvasScreen,
  canvasScreenParams,
} from "./client/screen";
import { CanvasSidebarItem } from "./client/sidebar";
import { CanvasSettingsScreen, SETTINGS_SCREEN } from "./client/settings";
import { createCanvasSelection } from "./client/selection";
import { canvasActivitySchema } from "./shared/activity";
export default function contribute(client: PluginClientContext) {
  initClientHelpers({
    Icon,
    Modal,
    useRpc,
    useToast,
    ScrollView,
    FlatList,
    TextInput,
    copyText,
  });
  const selection = createCanvasSelection();
  const stopActivitySync = startActivitySync(client);
  const removeActivity = client.addTimelineRenderer({
    kind: "canvas-activity",
    version: 1,
    schema: canvasActivitySchema,
    Component: (props) => (
      <CanvasActivityRow
        {...props}
        onOpen={(activity) => {
          selection.select(activity.workspaceId, activity.canvasId);
          client.openPanel("canvas", { workspaceId: activity.workspaceId });
        }}
      />
    ),
  });
  const removePanel = client.addWorkspacePanel({
    id: "canvas",
    title: "Canvas",
    icon: "NotebookPen",
    context: "workspace",
    Component: (props) => (
      <CanvasPanel
        {...props}
        selection={selection}
        onOpenScreen={(canvasId) =>
          client.openScreen({
            screenId: CANVAS_SCREEN,
            params: canvasScreenParams(props.workspaceId, canvasId),
          })
        }
      />
    ),
  });
  const removeScreen = client.addScreen({
    id: CANVAS_SCREEN,
    title: "Canvas",
    Component: CanvasScreen,
  });
  const removeSidebarItem = client.addSidebarHeaderItem({
    id: "canvas",
    title: "Canvas",
    Component: CanvasSidebarItem,
  });
  const removeSettings = client.addSettingsScreen({
    id: SETTINGS_SCREEN,
    title: "Canvas",
    icon: "NotebookPen",
    Component: CanvasSettingsScreen,
  });
  const removeSettingsCommand = client.addCommandCenterItem({
    id: "canvas-settings",
    title: "Canvas settings",
    icon: "Settings",
    context: "global",
    onSelect({ openSettings }) {
      openSettings(SETTINGS_SCREEN);
    },
  });
  const removeCommand = client.addCommandCenterItem({
    id: "open-canvas",
    title: "Open Canvas",
    icon: "NotebookPen",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("canvas");
    },
  });
  const removeHeaders = registerNativeCanvasHeaders(client);
  return () => {
    removeHeaders();
    stopActivitySync();
    removeActivity();
    removeCommand();
    removeSettingsCommand();
    removeSettings();
    removeSidebarItem();
    removeScreen();
    removePanel();
  };
}
