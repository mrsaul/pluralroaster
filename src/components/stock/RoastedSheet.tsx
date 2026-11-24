import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAddRoastedStock } from "@/hooks/useRoasting";
import { parseKgInput, type RoastingNeed } from "@/lib/roasting";

function RoastedForm({ need, onClose }: { need: RoastingNeed; onClose: () => void }) {
  const [raw, setRaw] = useState(need.toRoastKg.toFixed(2));
  const add = useAddRoastedStock();
  const kg = parseKgInput(raw);
  const invalid = kg === null;

  const submit = async () => {
    if (kg === null || add.isPending) return;
    try {
      await add.mutateAsync({ productId: need.productId, productName: need.productName, kg });
      onClose();
    } catch {
      // the hook already shows an error toast
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <SheetHeader>
        <SheetTitle>{`Torréfié · ${need.productName}`}</SheetTitle>
      </SheetHeader>
      <div className="space-y-2">
        <Label htmlFor="roasted-kg">Kilos sortis du torréfacteur</Label>
        <Input
          id="roasted-kg"
          inputMode="decimal"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          className="min-h-[44px]"
          aria-invalid={invalid}
        />
        {invalid ? (
          <p className="text-sm text-destructive">Entrez un poids supérieur à 0</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Stock après{" "}
            <span className="font-medium text-brand-green-600">
              {`${need.stockKg.toFixed(2)} → ${(need.stockKg + kg).toFixed(2)} kg`}
            </span>
          </p>
        )}
      </div>
      <Button type="submit" className="w-full min-h-[44px]" disabled={add.isPending || invalid}>
        Ajouter au stock
      </Button>
      <p className="text-xs text-muted-foreground">Erreur ? Modifier le stock à la main dans l'onglet Stock torréfié.</p>
    </form>
  );
}

export function RoastedSheet({ need, onClose }: { need: RoastingNeed | null; onClose: () => void }) {
  return (
    <Sheet open={need !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom">{need && <RoastedForm key={need.productId} need={need} onClose={onClose} />}</SheetContent>
    </Sheet>
  );
}
