import createNucleoIcon from "./createNucleoIcon";
import type { IconMetadata, IconNode } from "./types";

export const __iconNode: IconNode = [
  [
    "polyline",
    {
      "points": "13 11 10 14 7 11",
      "fill": "none",
      "stroke": "#000",
      "strokeLinecap": "round",
      "strokeLinejoin": "round",
      "strokeWidth": "2",
      "data-color": "color-2"
    }
  ],
  [
    "line",
    {
      "x1": "10",
      "y1": "3",
      "x2": "10",
      "y2": "14",
      "fill": "none",
      "stroke": "#000",
      "strokeLinecap": "round",
      "strokeLinejoin": "round",
      "strokeWidth": "2",
      "data-color": "color-2"
    }
  ],
  [
    "path",
    {
      "d": "m14,8c1.657,0,3,1.343,3,3v3c0,1.657-1.343,3-3,3H6c-1.657,0-3-1.343-3-3v-3c0-1.657,1.343-3,3-3",
      "fill": "none",
      "stroke": "#000",
      "strokeLinecap": "round",
      "strokeLinejoin": "round",
      "strokeWidth": "2"
    }
  ]
] as const;

export const __metadata: IconMetadata = {
  "name": "download-3",
  "componentName": "Download3",
  "collection": "micro-bold",
  "variant": "fill",
  "category": "arrows",
  "sourceSize": 20,
  "filePath": "micro-bold/fill/arrows/20px_download-3.svg"
} as const;

const Download3 = createNucleoIcon("download-3", __iconNode, __metadata);

export default Download3;
