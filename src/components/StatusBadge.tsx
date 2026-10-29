import { cn } from "@/lib/utils";

const FALLBACK_STYLE = "bg-brand-line text-brand-ink";

export const STATUS_STYLES: Record<string, string> = {
  pending: "bg-brand-sand text-brand-ink",
  confirmed: "bg-brand-blue text-brand-ink",
  fulfilled: "bg-brand-line text-brand-ink",
  synced: "bg-brand-green-600 text-brand-paper",
  received: "bg-brand-green-600 text-brand-paper",
  approved: "bg-brand-blue text-brand-ink",
  packaging: "bg-brand-orange text-brand-ink",
  ready_for_delivery: "bg-brand-salmon text-brand-ink",
  delivered: "bg-brand-line text-brand-ink",
};

interface StatusBadgeProps {
  status: string;
  sellsyId?: string;
}

export function StatusBadge({ status, sellsyId }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold",
        STATUS_STYLES[status] ?? FALLBACK_STYLE,
      )}
    >
      {status === "synced" && sellsyId ? (
        <span className="font-mono tabular-nums">{sellsyId}</span>
      ) : (
        <span className="capitalize">{status}</span>
      )}
    </span>
  );
}
