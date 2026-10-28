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

// Floating frosted pill above the tab bar (no prices, unlike the coffee CartBar).
export default function CafeCartBar({ totalUnits, status, countdown, cutoffLabel, sending, onSend }: Props) {
  const t = useKitchenT().cafeApp;
  const submitted = status === "sent" || status === "approved";
  return (
    <div
      data-testid="cafe-cart-bar"
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-40 mx-auto max-w-xl rounded-full border border-brand-line bg-card/80 py-2 pl-5 pr-2 shadow-sm backdrop-blur-xl"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t.totalUnits(totalUnits)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {status === "sent" ? t.sentNote(cutoffLabel) : status === "approved" ? t.approvedNote : t.cutoffIn(countdown)}
          </p>
        </div>
        {(status === "none" || status === "draft") && (
          <Button className="shrink-0 px-6" disabled={totalUnits === 0 || sending} onClick={onSend}>
            {sending ? t.sending : t.send}
          </Button>
        )}
      </div>
    </div>
  );
}
