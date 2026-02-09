import createNucleoIcon from "./createNucleoIcon";
import type { IconMetadata, IconNode } from "./types";

export const __iconNode: IconNode = [
  [
    "path",
    {
      "d": "m16,3H4c-1.1025,0-2,.897-2,2v2c0,1.103.8975,2,2,2h12c1.1025,0,2-.897,2-2v-2c0-1.103-.8975-2-2-2ZM5.25,7.25c-.6904,0-1.25-.5596-1.25-1.25s.5596-1.25,1.25-1.25,1.25.5596,1.25,1.25-.5596,1.25-1.25,1.25Zm4,0c-.6904,0-1.25-.5596-1.25-1.25s.5596-1.25,1.25-1.25,1.25.5596,1.25,1.25-.5596,1.25-1.25,1.25Z",
      "strokeWidth": "0",
      "fill": "#000"
    }
  ],
  [
    "rect",
    {
      "x": "3",
      "y": "12",
      "width": "14",
      "height": "4",
      "rx": "1",
      "ry": "1",
      "fill": "none",
      "stroke": "#000",
      "strokeLinecap": "round",
      "strokeLinejoin": "round",
      "strokeWidth": "2",
      "data-color": "color-2"
    }
  ]
] as const;

export const __metadata: IconMetadata = {
  "name": "server",
  "componentName": "Server",
  "collection": "micro-bold",
  "variant": "fill",
  "category": "technology-devices",
  "sourceSize": 20,
  "filePath": "micro-bold/fill/technology-devices/20px_server.svg"
} as const;

const Server = createNucleoIcon("server", __iconNode, __metadata);

export default Server;
