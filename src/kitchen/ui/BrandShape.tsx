/* eslint-disable react-refresh/only-export-components -- constants are part of the agreed module interface */
export type BrandColor = "coral" | "blue" | "orange" | "sand" | "salmon" | "green600";
export type ShapeKind = "circle" | "semi" | "quarter" | "triangle";

/** Brand fills as hex (single source, shared with the status pills). */
export const BRAND_HEX: Record<BrandColor, string> = {
  coral: "#F0605C",
  blue: "#7E9CD0",
  orange: "#F0951F",
  sand: "#F1DDA9",
  salmon: "#EFA89E",
  green600: "#3D7330",
};

const PATHS: Record<ShapeKind, string> = {
  circle: "M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20Z",
  semi: "M2 16a10 10 0 0 1 20 0Z",
  quarter: "M3 21V3a18 18 0 0 1 18 18Z",
  triangle: "M12 3 22 21H2Z",
};

interface BrandShapeProps {
  kind: ShapeKind;
  color: BrandColor;
  /** px, default 16 */
  size?: number;
  className?: string;
}

/** Decorative flat brand shape (no gradients, no shadows). */
export function BrandShape({ kind, color, size = 16, className }: BrandShapeProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
    >
      <path d={PATHS[kind]} fill={BRAND_HEX[color]} />
    </svg>
  );
}
