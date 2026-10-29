import { cn } from "@/lib/utils";

const ROAST_COLORS: Record<string, string> = {
  light: "bg-brand-sand border-brand-orange-200",
  medium: "bg-brand-orange border-brand-orange-700",
  dark: "bg-brand-orange-700 border-brand-ink",
  espresso: "bg-foreground border-foreground",
};

interface RoastIconProps {
  roastLevel: string;
  className?: string;
}

export function RoastIcon({ roastLevel, className }: RoastIconProps) {
  return (
    <div
      className={cn(
        "w-10 h-10 rounded-lg border flex items-center justify-center",
        ROAST_COLORS[roastLevel] || ROAST_COLORS.medium,
        className
      )}
    >
      <div className="w-4 h-4 rounded-sm bg-background/20" />
    </div>
  );
}
