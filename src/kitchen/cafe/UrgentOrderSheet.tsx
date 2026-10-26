import { useState } from "react";
import { toast } from "sonner";
import { format, addDays, set } from "date-fns";
import { QuantityStepper } from "@/components/QuantityStepper";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { kitchenErrorMessage, useCreateUrgentOrder } from "../api";
import { useKitchenT } from "../i18n";
import type { KitchenProduct } from "../types";

const LOCAL_FMT = "yyyy-MM-dd'T'HH:mm";
const defaultNeededBy = () =>
  format(set(addDays(new Date(), 1), { hours: 10, minutes: 0, seconds: 0, milliseconds: 0 }), LOCAL_FMT);

type Props = { open: boolean; onOpenChange: (o: boolean) => void; cafeId: string; products: KitchenProduct[] };

export default function UrgentOrderSheet({ open, onOpenChange, cafeId, products }: Props) {
  const t = useKitchenT();
  const c = t.cafeApp;
  const create = useCreateUrgentOrder();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [neededBy, setNeededBy] = useState(defaultNeededBy);

  const items = products
    .filter((p) => p.isVisible && (qty[p.id] ?? 0) > 0)
    .map((p) => ({ productId: p.id, units: qty[p.id] }));
  const neededDate = neededBy ? new Date(neededBy) : null;
  const valid = items.length > 0 && reason.trim().length > 0 && !!neededDate && !isNaN(neededDate.getTime());

  const submit = () => {
    if (!valid || !neededDate) return;
    create.mutate(
      { cafeId, reason: reason.trim(), neededBy: neededDate.toISOString(), items },
      {
        onSuccess: () => {
          toast.success(c.urgentSent);
          setQty({}); setReason(""); setNeededBy(defaultNeededBy());
          onOpenChange(false);
        },
        onError: (err) => toast.error(kitchenErrorMessage(err, t)),
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{c.urgentTitle}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 flex flex-col gap-4">
          <ul className="flex flex-col gap-2">
            {products.filter((p) => p.isVisible).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-sm">
                  {p.name} <span className="text-muted-foreground">· {p.unitLabel}</span>
                </span>
                <QuantityStepper
                  step={1}
                  value={qty[p.id] ?? 0}
                  onChange={(v) => setQty((q) => ({ ...q, [p.id]: v }))}
                  renderValue={(v) => String(v)}
                />
              </li>
            ))}
          </ul>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {c.urgentReason}
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={c.urgentReasonPlaceholder}
              rows={3}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {c.urgentNeededBy}
            <input
              type="datetime-local"
              value={neededBy}
              onChange={(e) => setNeededBy(e.target.value)}
              className="h-12 rounded-md border border-input bg-background px-3 text-base"
            />
          </label>
          <Button className="h-12" disabled={!valid || create.isPending} onClick={submit}>
            {c.urgentSubmit}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
