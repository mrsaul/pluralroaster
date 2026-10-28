import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { kitchenErrorMessage, useKitchenSettings, useUpdateSettings } from "../api";
import { useKitchenT } from "../i18n";
import RoundsEditor from "./RoundsEditor";

const inputCls = "h-12 rounded-full border border-brand-line bg-card px-4 text-sm text-foreground";

export default function KitchenSettings() {
  const t = useKitchenT();
  const k = t.kitchen;
  const { data } = useKitchenSettings();
  const update = useUpdateSettings();
  const [reminder, setReminder] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) setReminder(String(data.reminderHoursBefore));
  }, [data?.reminderHoursBefore]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <p className="p-4 text-sm text-muted-foreground">{k.loading}</p>;

  const save = () => {
    const rem = Number(reminder);
    if (reminder.trim() === "" || !Number.isInteger(rem) || rem < 0 || rem > 48) { setError(k.errReminder); return; }
    setError(null);
    update.mutate(
      { reminderHoursBefore: rem },
      { onSuccess: () => toast.success(k.saved), onError: (err) => toast.error(kitchenErrorMessage(err, t)) },
    );
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 pb-16 pt-4">
            <RoundsEditor />
      <section className="flex flex-col gap-3 rounded-[26px] border border-brand-line bg-card p-4">
        <label className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">{k.reminderHours}
          <input className={inputCls} type="number" inputMode="numeric" min={0} max={48} value={reminder} onChange={(e) => setReminder(e.target.value)} />
        </label>
        {error && <p role="alert" className="rounded-[18px] bg-brand-coral-100 px-3 py-2 text-sm font-semibold text-brand-ink">{error}</p>}
        <Button disabled={update.isPending} onClick={save}>{k.saveReminder}</Button>
      </section>
    </div>
  );
}
