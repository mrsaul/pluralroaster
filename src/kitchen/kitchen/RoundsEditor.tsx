import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { kitchenErrorMessage, useDeleteRound, useKitchenRounds, useUpsertRound } from "../api";
import { useKitchenT } from "../i18n";
import type { KitchenRound } from "../types";

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first; stored value 0 = Sunday
const inputCls = "h-11 rounded-md border border-input bg-background px-2 text-sm text-foreground";
const field = "flex flex-col gap-1 text-sm";

type Draft = Omit<KitchenRound, "id"> & { id?: string };
const BLANK: Draft = { name: "", productionWeekday: 2, cutoffWeekday: 0, cutoffTime: "20:00", capacityMinutes: 360, isActive: true };

/** Minutes to hours, at most one decimal; French decimal comma when shown as text. */
function fmtHours(minutes: number, comma = false): string {
  const s = String(+(minutes / 60).toFixed(1));
  return comma ? s.replace(".", ",") : s;
}

function RoundForm({ initial, rounds, onDone }: { initial: Draft; rounds: KitchenRound[]; onDone: () => void }) {
  const t = useKitchenT();
  const k = t.kitchen;
  const upsert = useUpsertRound();
  const [name, setName] = useState(initial.name);
  const [prodDay, setProdDay] = useState(String(initial.productionWeekday));
  const [cutDay, setCutDay] = useState(String(initial.cutoffWeekday));
  const [time, setTime] = useState(initial.cutoffTime);
  const [hours, setHours] = useState(fmtHours(initial.capacityMinutes));
  const [active, setActive] = useState(initial.isActive);
  const [errors, setErrors] = useState<string[]>([]);

  const save = () => {
    const errs: string[] = [];
    const h = Number(hours);
    if (!name.trim()) errs.push(k.errRoundName);
    if (!/^\d{2}:\d{2}$/.test(time)) errs.push(k.errTime);
    if (hours.trim() === "" || !Number.isFinite(h) || Math.round(h * 60) <= 0 || h > 168) errs.push(k.errHours);
    if (rounds.some((r) => r.id !== initial.id && r.productionWeekday === Number(prodDay))) errs.push(k.errDuplicateDay);
    setErrors(errs);
    if (errs.length) return;
    upsert.mutate(
      {
        id: initial.id,
        name: name.trim(),
        productionWeekday: Number(prodDay),
        cutoffWeekday: Number(cutDay),
        cutoffTime: time,
        capacityMinutes: Math.round(h * 60),
        isActive: active,
      },
      {
        onSuccess: () => { toast.success(k.saved); onDone(); },
        onError: (err) => {
          const e = err as { code?: string; message?: string } | null;
          const duplicate = e?.code === "23505" || /duplicate key|unique/i.test(e?.message ?? "");
          setErrors([duplicate ? k.errDuplicateDay : kitchenErrorMessage(err, t)]);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <label className={field}>{k.roundName}
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className={field}>{k.productionDay}
        <select className={inputCls} value={prodDay} onChange={(e) => setProdDay(e.target.value)}>
          {WEEKDAY_ORDER.map((d) => <option key={d} value={d}>{k.weekdays[d]}</option>)}
        </select>
      </label>
      <label className={field}>{k.cutoffDay}
        <select className={inputCls} value={cutDay} onChange={(e) => setCutDay(e.target.value)}>
          {WEEKDAY_ORDER.map((d) => <option key={d} value={d}>{k.weekdays[d]}</option>)}
        </select>
      </label>
      <label className={field}>{k.cutoffTime}
        <input className={inputCls} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      <label className={field}>{k.teamHours}
        <input className={inputCls} type="number" inputMode="decimal" min={0} max={168} step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={active} onChange={(e) => setActive(e.target.checked)} />
        {k.roundActive}
      </label>
      {errors.length > 0 && (
        <div role="alert" className="text-sm font-medium text-destructive">{errors.map((e) => <p key={e}>{e}</p>)}</div>
      )}
      <div className="flex gap-2">
        <Button className="h-11 flex-1" disabled={upsert.isPending} onClick={save}>{k.save}</Button>
        <Button variant="outline" className="h-11" onClick={onDone}>{k.cancelEdit}</Button>
      </div>
    </div>
  );
}

export default function RoundsEditor() {
  const t = useKitchenT();
  const k = t.kitchen;
  const { data: rounds = [] } = useKitchenRounds();
  const del = useDeleteRound();
  const [editing, setEditing] = useState<string | null>(null); // round id, or "new"
  const [toDelete, setToDelete] = useState<KitchenRound | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-base font-semibold">{k.roundsTitle}</h3>
      {deleteError && <p role="alert" className="text-sm font-medium text-destructive">{deleteError}</p>}
      <ul className="flex flex-col gap-2">
        {rounds.map((r) => (
          <li key={r.id} data-testid={`round-${r.id}`} className="rounded-xl border border-border bg-card p-3">
            {editing === r.id ? (
              <RoundForm initial={r} rounds={rounds} onDone={() => setEditing(null)} />
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{r.name} <span className="text-xs font-normal text-muted-foreground">{r.isActive ? k.roundActive : k.roundInactive}</span></p>
                  <p className="text-xs text-muted-foreground">
                    {k.roundSummary(k.weekdays[r.productionWeekday].toLowerCase(), k.weekdays[r.cutoffWeekday].toLowerCase(), r.cutoffTime, fmtHours(r.capacityMinutes, true))}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" className="h-10" onClick={() => { setDeleteError(null); setEditing(r.id); }}>{k.edit}</Button>
                  <Button variant="outline" className="h-10" onClick={() => { setDeleteError(null); setToDelete(r); }}>{k.remove}</Button>
                </div>
              </div>
            )}
          </li>
        ))}
        {editing === "new" && (
          <li data-testid="round-new" className="rounded-xl border border-border bg-card p-3">
            <RoundForm initial={BLANK} rounds={rounds} onDone={() => setEditing(null)} />
          </li>
        )}
      </ul>
      {editing !== "new" && (
        <Button variant="outline" className="h-11" onClick={() => { setDeleteError(null); setEditing("new"); }}>{k.addRound}</Button>
      )}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{k.confirmDeleteRound(toDelete?.name ?? "")}</AlertDialogTitle>
            <AlertDialogDescription>{k.roundsTitle}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{k.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toDelete) {
                  del.mutate({ id: toDelete.id }, {
                    onSuccess: () => toast.success(k.saved),
                    onError: (err) => setDeleteError(kitchenErrorMessage(err, t)),
                  });
                }
                setToDelete(null);
              }}
            >
              {k.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
