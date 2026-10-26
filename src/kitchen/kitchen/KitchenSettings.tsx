import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { kitchenErrorMessage, useKitchenSettings, useUpdateSettings } from "../api";
import { useKitchenT } from "../i18n";

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first; stored value 0 = Sunday
const inputCls = "h-11 rounded-md border border-input bg-background px-2 text-sm text-foreground";

export default function KitchenSettings() {
  const t = useKitchenT();
  const k = t.kitchen;
  const { data } = useKitchenSettings();
  const update = useUpdateSettings();
  const [weekday, setWeekday] = useState("0");
  const [time, setTime] = useState("");
  const [reminder, setReminder] = useState("");
  const [hours, setHours] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!data) return;
    setWeekday(String(data.cutoffWeekday));
    setTime(data.cutoffTime.slice(0, 5));
    setReminder(String(data.reminderHoursBefore));
    setHours(String(data.weeklyCapacityMinutes / 60));
  }, [data?.cutoffWeekday, data?.cutoffTime, data?.reminderHoursBefore, data?.weeklyCapacityMinutes]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <p className="p-4 text-sm text-muted-foreground">{k.loading}</p>;

  const save = () => {
    const errs: string[] = [];
    const rem = Number(reminder);
    const h = Number(hours);
    if (!/^\d{2}:\d{2}$/.test(time)) errs.push(k.errTime);
    if (reminder.trim() === "" || !Number.isInteger(rem) || rem < 0 || rem > 48) errs.push(k.errReminder);
    if (hours.trim() === "" || !Number.isFinite(h) || Math.round(h * 60) <= 0) errs.push(k.errHours);
    setErrors(errs);
    if (errs.length) return;
    update.mutate(
      { cutoffWeekday: Number(weekday), cutoffTime: `${time}:00`, reminderHoursBefore: rem, weeklyCapacityMinutes: Math.round(h * 60) },
      { onSuccess: () => toast.success(k.saved), onError: (err) => toast.error(kitchenErrorMessage(err, t)) },
    );
  };

  const field = "flex flex-col gap-1 text-sm";
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-16 pt-4">
      <h2 className="text-lg font-semibold">{k.settingsTitle}</h2>
      <label className={field}>{k.cutoffWeekday}
        <select className={inputCls} value={weekday} onChange={(e) => setWeekday(e.target.value)}>
          {WEEKDAY_ORDER.map((d) => <option key={d} value={d}>{k.weekdays[d]}</option>)}
        </select>
      </label>
      <label className={field}>{k.cutoffTime}
        <input className={inputCls} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      <label className={field}>{k.reminderHours}
        <input className={inputCls} type="number" inputMode="numeric" min={0} max={48} value={reminder} onChange={(e) => setReminder(e.target.value)} />
      </label>
      <label className={field}>{k.weeklyHours}
        <input className={inputCls} type="number" inputMode="decimal" min={0} step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
      </label>
      {errors.length > 0 && (
        <div role="alert" className="text-sm font-medium text-destructive">{errors.map((e) => <p key={e}>{e}</p>)}</div>
      )}
      <Button className="h-12" disabled={update.isPending} onClick={save}>{k.save}</Button>
    </div>
  );
}
