import type { View, Text } from "react-native";
import type { ReactNode } from "react";
import type { Element } from "hast";
export { sourceRange } from "../shared/review-targets";
/** Border and padding on each side of a wrapped review target. */
export const targetBorder = 2;
export const targetPadding = 8;
export type ReviewBindings = {
  enabled: boolean;
  register: (
    key: string,
    node: View | Text | null,
    range: { start: number; end: number } | null,
  ) => void;
  navigate: number | null;
  navigationRequest: number;
  text: (value: string, map: number[] | undefined, key: string) => ReactNode;
  wrap: (node: Element, child: ReactNode, key: string) => ReactNode;
};
