import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { QuantityStepper } from "@/components/QuantityStepper";
import { kitchenErrorMessage, useCreateProduct, useKitchenProducts, useUpdateProduct } from "../api";
import { useKitchenT, type KitchenStrings } from "../i18n";
import { formatMinutes } from "../lib/format";
import type { KitchenProduct } from "../types";

type Draft = { name: string; unitLabel: string; piecesPerUnit: string; stockUnits: number; productionMinutes: string; isVisible: boolean };

const toDraft = (p: Omit<KitchenProduct, "id">): Draft => ({
  name: p.name, unitLabel: p.unitLabel, piecesPerUnit: String(p.piecesPerUnit), stockUnits: p.stockUnits,
  productionMinutes: String(p.productionMinutes), isVisible: p.isVisible,
});

/** Returns the parsed product or the list of validation messages. */
function validate(d: Draft, k: KitchenStrings["kitchen"]): { value: Omit<KitchenProduct, "id"> } | { errors: string[] } {
  const errors: string[] = [];
  const pieces = Number(d.piecesPerUnit);
  const minutes = Number(d.productionMinutes);
  if (!d.name.trim()) errors.push(k.errName);
  if (!d.unitLabel.trim()) errors.push(k.errUnit);
  if (!Number.isInteger(pieces) || pieces < 1) errors.push(k.errPieces);
  if (d.stockUnits < 0) errors.push(k.errStock);
  if (d.productionMinutes.trim() === "" || !Number.isFinite(minutes) || minutes < 0) errors.push(k.errMinutes);
  if (errors.length) return { errors };
  return {
    value: {
      name: d.name.trim(), unitLabel: d.unitLabel.trim(), piecesPerUnit: pieces, stockUnits: d.stockUnits,
      productionMinutes: Math.round(minutes), isVisible: d.isVisible,
    },
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-xs text-muted-foreground">{label}{children}</label>;
}
const inputCls = "h-11 rounded-md border border-input bg-background px-2 text-sm text-foreground";

function ProductForm({ initial, submitLabel, testId, onSubmit, busy, resetOnSuccess }: {
  initial: Draft; submitLabel: string; testId: string; busy: boolean; resetOnSuccess?: boolean;
  onSubmit: (v: Omit<KitchenProduct, "id">, done: () => void) => void;
}) {
  const k = useKitchenT().kitchen;
  const [d, setD] = useState<Draft>(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const set = <K extends keyof Draft>(key: K, v: Draft[K]) => setD((x) => ({ ...x, [key]: v }));
  const submit = () => {
    const r = validate(d, k);
    if ("errors" in r) { setErrors(r.errors); return; }
    setErrors([]);
    onSubmit(r.value, () => { if (resetOnSuccess) setD(initial); });
  };
  const minutes = Number(d.productionMinutes);
  return (
    <div data-testid={testId} className="flex flex-col gap-3">
      <Field label={k.productName}><input className={inputCls} value={d.name} onChange={(e) => set("name", e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={k.unitLabel}><input className={inputCls} value={d.unitLabel} onChange={(e) => set("unitLabel", e.target.value)} /></Field>
        <Field label={k.piecesPerUnit}>
          <input className={inputCls} type="number" inputMode="numeric" min={1} value={d.piecesPerUnit} onChange={(e) => set("piecesPerUnit", e.target.value)} />
        </Field>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{k.stockUnits}</span>
        <div data-testid="stock-stepper">
          <QuantityStepper step={1} min={0} value={d.stockUnits} onChange={(n) => set("stockUnits", n)}
            renderValue={(n) => String(n)} />
        </div>
      </div>
      <Field label={k.productionMinutes}>
        <div className="flex items-center gap-2">
          <input className={`${inputCls} flex-1`} type="number" inputMode="numeric" min={0} value={d.productionMinutes}
            onChange={(e) => set("productionMinutes", e.target.value)} />
          <span className="w-16 text-sm text-foreground">{Number.isFinite(minutes) && minutes >= 0 ? formatMinutes(Math.round(minutes)) : ""}</span>
        </div>
      </Field>
      {errors.length > 0 && (
        <div role="alert" className="text-sm font-medium text-destructive">
          {errors.map((e) => <p key={e}>{e}</p>)}
        </div>
      )}
      <Button className="h-11" disabled={busy} onClick={submit}>{submitLabel}</Button>
    </div>
  );
}

export default function ProductsEditor() {
  const t = useKitchenT();
  const k = t.kitchen;
  const { data: products = [] } = useKitchenProducts();
  const update = useUpdateProduct();
  const create = useCreateProduct();
  const [adding, setAdding] = useState(false);
  const fail = (err: unknown) => toast.error(kitchenErrorMessage(err, t));

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-4">
      <Button variant="outline" className="mb-3 h-11 w-full" onClick={() => setAdding((a) => !a)}>{k.newProduct}</Button>
      {adding && (
        <div className="mb-4 rounded-xl border border-border bg-card p-3">
          <ProductForm
            testId="product-new"
            initial={toDraft({ name: "", unitLabel: "", piecesPerUnit: 1, stockUnits: 0, productionMinutes: 0, isVisible: true })}
            submitLabel={k.create}
            busy={create.isPending}
            resetOnSuccess
            onSubmit={(v, done) => create.mutate(v, {
              onSuccess: () => { toast.success(k.saved); done(); setAdding(false); },
              onError: fail,
            })}
          />
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {products.map((p) => (
          <li key={p.id} className="rounded-xl border border-border bg-card p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium">{p.name}</span>
              <label className="flex items-center gap-2 text-sm">
                {p.isVisible ? k.visible : k.hidden}
                <Switch
                  checked={p.isVisible}
                  aria-label={`${k.visible} ${p.name}`}
                  onCheckedChange={(v) => update.mutate({ id: p.id, patch: { isVisible: v } }, { onError: fail })}
                />
              </label>
            </div>
            <ProductForm
              key={`${p.id}-${p.name}-${p.unitLabel}-${p.piecesPerUnit}-${p.stockUnits}-${p.productionMinutes}`}
              testId={`product-${p.id}`}
              initial={toDraft(p)}
              submitLabel={k.save}
              busy={update.isPending}
              onSubmit={(v, done) => update.mutate({ id: p.id, patch: v }, {
                onSuccess: () => { toast.success(k.saved); done(); },
                onError: fail,
              })}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
