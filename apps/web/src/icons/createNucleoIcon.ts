import { createElement, forwardRef } from "react";
import Icon from "./Icon";
import type { IconMetadata, IconNode, NucleoIconProps } from "./types";
import { mergeClasses, toKebabCase } from "./utils";

const createNucleoIcon = (iconName: string, iconNode: IconNode, metadata: IconMetadata) => {
  const Component = forwardRef<SVGSVGElement, NucleoIconProps>(
    ({ className, ...props }, ref) =>
      createElement(Icon, {
        ref,
        iconNode,
        variant: metadata.variant,
        sourceSize: metadata.sourceSize,
        className: mergeClasses(
          `nucleo-${toKebabCase(metadata.componentName)}`,
          `nucleo-${iconName}`,
          className,
        ),
        ...props,
      }),
  );

  Component.displayName = metadata.componentName;
  return Component;
};

export default createNucleoIcon;

