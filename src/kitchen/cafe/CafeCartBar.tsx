import { Button } from "@/components/ui/button";
import { useKitchenT } from "../i18n";

type Props = {
  totalUnits: number;
  status: "none" | "draft" | "sent" | "approved" | "locked";
  countdown: string;
  cutoffLabel: string;
  sending: boolean;
  onSend: () => void;
};

// Sticky bottom bar (no prices, unlike the coffee CartBar).
export default function CafeCartBar({ totalUnits, status, countdown, cutoffLabel, sending, onSend }: Props) {
  const t = useKitchenT().cafeApp;
  const submitted = status === "sent" || status === "approved";
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t.totalUnits(totalUnits)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {status === "sent" ? t.sentNote(cutoffLabel) : status === "approved" ? t.approvedNote : t.cutoffIn(countdown)}
          </p>
        </div>
        {(status === "none" || status === "draft") && (
          <Button size="lg" className="h-12 px-6" disabled={totalUnits === 0 || sending} onClick={onSend}>
            {sending ? t.sending : t.send}
          </Button>
        )}
      </div>
    </div>
  );
}
