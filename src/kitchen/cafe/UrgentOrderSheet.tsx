import { useState } from "react";
import { toast } from "sonner";
import { QuantityStepper } from "@/components/QuantityStepper";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { kitchenErrorMessage, useCreateUrgentOrder } from "../api";
import { useKitchenT } from "../i18n";
import { defaultParisNeededBy, parisLocalToIso } from "../lib/format";
import type { KitchenProduct } from "../types";

// A coffee manager passes their own cafeId; the stores manager passes `cafes` and picks one.
type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  products: KitchenProduct[];
  cafeId?: string;
  cafes?: { id: string; name: string }[];
};

export default function UrgentOrderSheet({ open, onOpenChange, cafeId: fixedCafeId, cafes, products }: Props) {
  const t = useKitchenT();
  const c = t.cafeApp;
  const create = useCreateUrgentOrder();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [neededBy, setNeededBy] = useState(defaultParisNeededBy);
  const [pickedCafe, setPickedCafe] = useState("");
  const cafeId = fixedCafeId ?? pickedCafe;

  const items = products
    .filter((p) => p.isVisible && (qty[p.id] ?? 0) > 0)
    .map((p) => ({ productId: p.id, units: qty[p.id] }));
  const neededIso = neededBy ? parisLocalToIso(neededBy) : "";
  const neededDate = neededIso ? new Date(neededIso) : null;
  const valid =
    !!cafeId && items.length > 0 && reason.trim().length > 0 && !!neededDate && !isNaN(neededDate.getTime()) && neededDate.getTime() > Date.now();

  const submit = () => {
    if (!valid || !neededDate) return;
    create.mutate(
      { cafeId, reason: reason.trim(), neededBy: neededIso, items },
      {
        onSuccess: () => {
          toast.success(c.urgentSent);
          setQty({}); setReason(""); setNeededBy(defaultParisNeededBy()); setPickedCafe("");
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
          {!fixedCafeId && cafes && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              {c.urgentCafe}
              <select
                aria-label={c.urgentCafe}
                value={pickedCafe}
                onChange={(e) => setPickedCafe(e.target.value)}
                className="h-12 rounded-md border border-input bg-background px-3 text-base"
              >
                <option value="">{c.urgentPickCafe}</option>
                {cafes.map((cafe) => <option key={cafe.id} value={cafe.id}>{cafe.name}</option>)}
              </select>
            </label>
          )}
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
            {c.urgentNeededByField}
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
