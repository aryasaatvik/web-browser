import type { NucleoVariant } from "./types";

const outlineDefaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const fillDefaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "currentColor",
};

const glyphDuoDefaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "currentColor",
};

const outlineDuoDefaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function getDefaultAttributes(variant: NucleoVariant): Record<string, any> {
  switch (variant) {
    case "outline":
      return outlineDefaultAttributes;
    case "fill":
      return fillDefaultAttributes;
    case "glyph-duo":
      return glyphDuoDefaultAttributes;
    case "outline-duo":
      return outlineDuoDefaultAttributes;
    default:
      return outlineDefaultAttributes;
  }
}

