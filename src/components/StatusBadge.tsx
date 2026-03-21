import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-secondary text-secondary-foreground",
  confirmed: "bg-primary/10 text-primary",
  fulfilled: "bg-muted text-muted-foreground",
  synced: "bg-success/10 text-success",
  received: "bg-muted text-muted-foreground",
  approved: "bg-info/10 text-info",
  in_production: "bg-primary/10 text-primary",
  ready_for_packaging: "bg-warning/10 text-warning",
  packaging: "bg-warning/15 text-warning",
  ready_for_delivery: "bg-info/10 text-info",
  shipped: "bg-info/15 text-info",
  delivered: "bg-success/10 text-success",
};

interface StatusBadgeProps {
  status: string;
  sellsyId?: string;
}

export function StatusBadge({ status, sellsyId }: StatusBadgeProps) {
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium", STATUS_STYLES[status])}>
      {status === "synced" && sellsyId ? (
        <span className="font-mono tabular-nums">{sellsyId}</span>
      ) : (
        <span className="capitalize">{status}</span>
      )}
    </span>
  );
}
