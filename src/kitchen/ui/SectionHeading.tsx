import type { ReactNode } from "react";
import { BrandShape, type BrandColor, type ShapeKind } from "./BrandShape";

/** Fixed shape and colour per meaning (spec "Shapes"). */
export const SECTION_SHAPES = {
  urgent: { shape: "triangle", color: "coral" },
  weekly: { shape: "circle", color: "blue" },
  capacity: { shape: "semi", color: "orange" },
  toProduce: { shape: "circle", color: "blue" },
  toReview: { shape: "quarter", color: "sand" },
  approved: { shape: "semi", color: "blue" },
  notSent: { shape: "quarter", color: "orange" },
} as const satisfies Record<string, { shape: ShapeKind; color: BrandColor }>;

interface SectionHeadingProps {
  shape: ShapeKind;
  color: BrandColor;
  title: string;
  action?: ReactNode;
  level?: "section" | "group";
}

export function SectionHeading({ shape, color, title, action, level = "section" }: SectionHeadingProps) {
  const isSection = level === "section";
  const Tag = isSection ? "h2" : "h3";
  return (
    <div className="flex items-center justify-between gap-3">
      <Tag
        className={
          isSection
            ? "flex items-center gap-2 text-[16px] font-bold text-brand-ink"
            : "flex items-center gap-2 text-[13px] font-bold text-brand-ink-500"
        }
      >
        <BrandShape kind={shape} color={color} size={isSection ? 18 : 14} className="shrink-0" />
        <span>{title}</span>
      </Tag>
      {action}
    </div>
  );
}
