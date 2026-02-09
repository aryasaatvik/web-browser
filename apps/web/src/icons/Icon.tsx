import { createElement, forwardRef } from "react";
import { getDefaultAttributes } from "./defaultAttributes";
import type { IconNode, NucleoIconProps, NucleoVariant } from "./types";
import { hasA11yProp, mergeClasses } from "./utils";

interface IconComponentProps extends NucleoIconProps {
  iconNode: IconNode;
  variant?: NucleoVariant;
  sourceSize?: number;
}

const Icon = forwardRef<SVGSVGElement, IconComponentProps>(
  (
    {
      color = "currentColor",
      secondaryColor = "currentColor",
      size = 24,
      strokeWidth = 2,
      absoluteStrokeWidth,
      className = "",
      children,
      iconNode,
      variant = "outline",
      sourceSize = 24,
      ...rest
    },
    ref,
  ) => {
    const defaultAttrs = getDefaultAttributes(variant);
    const isOutlineVariant = variant === "outline" || variant === "outline-duo";
    const isFillVariant = variant === "fill" || variant === "glyph-duo";
    const viewBox = `0 0 ${sourceSize} ${sourceSize}`;

    const elements = iconNode.map(([tag, attrs], index) => {
      const elementAttrs: Record<string, any> = { ...attrs };

      if (elementAttrs.fill && elementAttrs.fill !== "none") {
        if (elementAttrs["data-color"] === "color-2" && secondaryColor) {
          elementAttrs.fill = secondaryColor;
        } else if (
          !elementAttrs["data-color"] ||
          elementAttrs["data-color"] === "color-1"
        ) {
          elementAttrs.fill = color;
        }
      }

      if (elementAttrs.stroke && elementAttrs.stroke !== "none") {
        if (elementAttrs["data-color"] === "color-2" && secondaryColor) {
          elementAttrs.stroke = secondaryColor;
        } else {
          elementAttrs.stroke = color;
        }
      }

      return createElement(tag, { ...elementAttrs, key: index });
    });

    return createElement(
      "svg",
      {
        ref,
        ...defaultAttrs,
        viewBox,
        width: size,
        height: size,
        ...(isOutlineVariant && {
          stroke: color,
          strokeWidth: absoluteStrokeWidth
            ? (Number(strokeWidth) * sourceSize) / Number(size)
            : strokeWidth,
        }),
        ...(isFillVariant && {
          fill: color,
        }),
        className: mergeClasses("nucleo", className),
        ...(!children && !hasA11yProp(rest) && { "aria-hidden": "true" }),
        ...rest,
      },
      [
        ...elements,
        ...(Array.isArray(children) ? children : children ? [children] : []),
      ],
    );
  },
);

Icon.displayName = "NucleoIcon";

export default Icon;

