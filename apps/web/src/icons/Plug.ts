import createNucleoIcon from "./createNucleoIcon";
import type { IconMetadata, IconNode } from "./types";

export const __iconNode: IconNode = [
  [
    "line",
    {
      "x1": "7",
      "y1": "6",
      "x2": "7",
      "y2": "3",
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
      "x1": "13",
      "y1": "6",
      "x2": "13",
      "y2": "3",
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
      "y1": "17",
      "x2": "10",
      "y2": "15",
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
      "d": "m5,6h10c.5519,0,1,.4481,1,1v2c0,3.3115-2.6885,6-6,6h0c-3.3115,0-6-2.6885-6-6v-2c0-.5519.4481-1,1-1Z",
      "fill": "none",
      "stroke": "#000",
      "strokeLinecap": "round",
      "strokeLinejoin": "round",
      "strokeWidth": "2"
    }
  ]
] as const;

export const __metadata: IconMetadata = {
  "name": "plug",
  "componentName": "Plug",
  "collection": "micro-bold",
  "variant": "fill",
  "category": "technology-devices",
  "sourceSize": 20,
  "filePath": "micro-bold/fill/technology-devices/20px_plug.svg"
} as const;

const Plug = createNucleoIcon("plug", __iconNode, __metadata);

export default Plug;
