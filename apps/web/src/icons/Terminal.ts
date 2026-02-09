import createNucleoIcon from "./createNucleoIcon";
import type { IconMetadata, IconNode } from "./types";

export const __iconNode: IconNode = [
  [
    "line",
    {
      "x1": "12",
      "y1": "16",
      "x2": "17",
      "y2": "16",
      "fill": "none",
      "stroke": "#000",
      "strokeLinecap": "round",
      "strokeLinejoin": "round",
      "strokeWidth": "2",
      "data-color": "color-2"
    }
  ],
  [
    "polyline",
    {
      "points": "3 4 9 10 3 16",
      "fill": "none",
      "stroke": "#000",
      "strokeLinecap": "round",
      "strokeLinejoin": "round",
      "strokeWidth": "2"
    }
  ]
] as const;

export const __metadata: IconMetadata = {
  "name": "terminal",
  "componentName": "Terminal",
  "collection": "micro-bold",
  "variant": "fill",
  "category": "design-development",
  "sourceSize": 20,
  "filePath": "micro-bold/fill/design-development/20px_terminal.svg"
} as const;

const Terminal = createNucleoIcon("terminal", __iconNode, __metadata);

export default Terminal;
