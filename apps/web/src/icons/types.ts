import type { ForwardRefExoticComponent, RefAttributes, SVGProps } from "react";

export type SVGElementType =
  | "circle"
  | "ellipse"
  | "g"
  | "line"
  | "path"
  | "polygon"
  | "polyline"
  | "rect";

export type IconNode = [elementName: SVGElementType, attrs: Record<string, string>][];

export type NucleoCollection = "ui" | "core" | "micro-bold";
export type NucleoVariant = "outline" | "fill" | "glyph-duo" | "outline-duo";

export interface IconMetadata {
  name: string;
  componentName: string;
  collection: NucleoCollection;
  variant: NucleoVariant;
  category: string;
  sourceSize: number;
  filePath: string;
}

export interface NucleoIconProps extends SVGProps<SVGSVGElement> {
  size?: string | number;
  color?: string;
  secondaryColor?: string;
  strokeWidth?: number;
  absoluteStrokeWidth?: boolean;
  className?: string;
}

export type NucleoIcon = ForwardRefExoticComponent<
  Omit<NucleoIconProps, "ref"> & RefAttributes<SVGSVGElement>
>;

export type IconProps = NucleoIconProps;

