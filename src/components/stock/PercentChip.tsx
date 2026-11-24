import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSetDefaultGreenPercent, useSetGreenPercent } from "@/hooks/useRoasting";
import { formatPercent, parsePercentInput } from "@/lib/roasting";
import { cn } from "@/lib/utils";

type Props =
  | { scope: "default"; percent: number }
  | { scope: "product"; productId: string; productName: string; percent: number; isCustom: boolean };

export function PercentChip(props: Props) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState(formatPercent(props.percent));
  const setDefault = useSetDefaultGreenPercent();
  const setProduct = useSetGreenPercent();
  const value = parsePercentInput(raw);
  const isCustom = props.scope === "product" && props.isCustom;
  const pending = setDefault.isPending || setProduct.isPending;

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setOpen(false);
    } catch {
      // the hook already shows an error toast
    }
  };

  const save = () => {
    if (value === null || pending) return;
    if (props.scope === "default") return run(() => setDefault.mutateAsync({ percent: value }));
    return run(() => setProduct.mutateAsync({ productId: props.productId, percent: value }));
  };

  const reset = () => {
    if (props.scope !== "product" || pending) return;
    return run(() => setProduct.mutateAsync({ productId: props.productId, percent: null }));
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setRaw(formatPercent(props.percent));
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            props.scope === "default"
              ? "Modifier le pourcentage par défaut"
              : `Modifier le pourcentage de ${props.productName}`
          }
          className={cn(
            "inline-flex min-h-[44px] items-center rounded-full border px-3 text-sm",
            isCustom ? "border-brand-orange-700 text-brand-orange-700" : "border-border text-foreground",
          )}
        >
          {props.scope === "default" ? `Par défaut ${formatPercent(props.percent)} % ✎` : `${formatPercent(props.percent)} %`}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3">
        <Input
          inputMode="decimal"
          aria-label="Pourcentage de perte"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          className="min-h-[44px]"
          aria-invalid={value === null}
        />
        {value === null && <p className="text-sm text-destructive">Entre 0 et 50 %</p>}
        <Button className="w-full min-h-[44px]" disabled={value === null || pending} onClick={save}>
          Enregistrer
        </Button>
        {isCustom && (
          <Button variant="outline" className="w-full min-h-[44px]" disabled={pending} onClick={reset}>
            Revenir au défaut
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
