import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-secondary text-secondary-foreground",
  confirmed: "bg-primary/10 text-primary",
  fulfilled: "bg-muted text-muted-foreground",
  synced: "bg-success/10 text-success",
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
