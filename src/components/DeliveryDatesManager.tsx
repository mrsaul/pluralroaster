import { useEffect, useState } from "react";
import { format, parseISO, isAfter, startOfDay } from "date-fns";
import { Plus, Trash2, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

type DeliveryDate = {
  id: string;
  date: string;
  is_default: boolean;
};

export function DeliveryDatesManager() {
  const { toast } = useToast();
  const [dates, setDates] = useState<DeliveryDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data, error } = await supabase
      .from("delivery_dates")
      .select("id, date, is_default")
      .order("date", { ascending: true });
    if (error) {
      toast({ title: "Failed to load delivery dates", variant: "destructive" });
      return;
    }
    setDates(data ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function addDate() {
    if (!newDate) return;
    setSaving(true);
    const { error } = await supabase
      .from("delivery_dates")
      .insert({ date: newDate, is_default: false });
    setSaving(false);
    if (error) {
      toast({ title: "Failed to add date", description: error.message, variant: "destructive" });
      return;
    }
    setNewDate("");
    void load();
  }

  async function removeDate(id: string) {
    const { error } = await supabase.from("delivery_dates").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to remove date", variant: "destructive" });
      return;
    }
    void load();
  }

  async function setDefault(id: string) {
    // Clear existing default, then set new one
    const { error: clearError } = await supabase
      .from("delivery_dates")
      .update({ is_default: false })
      .neq("id", "00000000-0000-0000-0000-000000000000"); // update all
    if (clearError) {
      toast({ title: "Failed to update default", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("delivery_dates")
      .update({ is_default: true })
      .eq("id", id);
    if (error) {
      toast({ title: "Failed to set default", variant: "destructive" });
      return;
    }
    void load();
  }

  async function clearDefault(id: string) {
    const { error } = await supabase
      .from("delivery_dates")
      .update({ is_default: false })
      .eq("id", id);
    if (error) {
      toast({ title: "Failed to clear default", variant: "destructive" });
      return;
    }
    void load();
  }

  const today = startOfDay(new Date());
  const upcoming = dates.filter((d) => !isAfter(today, parseISO(d.date)));
  const past = dates.filter((d) => isAfter(today, parseISO(d.date)));

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>;
  }

  return (
    <div className="space-y-6 max-w-md">
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/40">
          <h3 className="text-sm font-medium text-foreground">Upcoming delivery dates</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Clients will only see these dates when placing an order. The default is pre-selected.
          </p>
        </div>

        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground px-4 py-6 text-center">
            No upcoming dates — add one below.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {upcoming.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground">
                    {format(parseISO(d.date), "EEE d MMM yyyy")}
                  </span>
                </div>
                <button
                  onClick={() => d.is_default ? void clearDefault(d.id) : void setDefault(d.id)}
                  title={d.is_default ? "Remove default" : "Set as default"}
                  className={cn(
                    "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors",
                    d.is_default
                      ? "bg-primary/10 border-primary/30 text-primary font-medium"
                      : "bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                  )}
                >
                  <Star className={cn("w-3 h-3", d.is_default && "fill-current")} />
                  {d.is_default ? "Default" : "Set default"}
                </button>
                <button
                  onClick={() => void removeDate(d.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="px-4 py-3 border-t border-border bg-muted/20 flex gap-2">
          <Input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            min={format(today, "yyyy-MM-dd")}
            className="text-sm"
          />
          <Button
            size="sm"
            disabled={!newDate || saving}
            onClick={() => void addDate()}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add
          </Button>
        </div>
      </div>

      {past.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/40">
            <h3 className="text-sm font-medium text-muted-foreground">Past dates</h3>
          </div>
          <div className="divide-y divide-border">
            {past.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3 opacity-50">
                <span className="flex-1 text-sm text-muted-foreground line-through">
                  {format(parseISO(d.date), "EEE d MMM yyyy")}
                </span>
                <button
                  onClick={() => void removeDate(d.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
