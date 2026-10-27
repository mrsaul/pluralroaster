// Kitchen data layer: TanStack Query hooks over the kitchen_* tables and RPCs,
// plus the best-effort notification helper.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import type { KitchenStrings } from "./i18n";
import { productionWeekStart } from "./lib/weeks";
import type { KitchenOrder, KitchenOrderItem, KitchenProduct } from "./types";

export type KitchenEvent =
  | "order_sent"
  | "order_approved"
  | "urgent_created"
  | "urgent_approved"
  | "urgent_declined"
  | "ready_eta"
  | "order_ready"
  | "cutoff_reminder";

export type KitchenChange = { product_name: string; from: number; to: number };

// ── Errors ───────────────────────────────────────────────────────────────────

export function kitchenErrorMessage(err: unknown, t: KitchenStrings): string {
  const code =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message)
      : "";
  switch (code) {
    case "cutoff_passed": return t.errors.cutoffPassed;
    case "order_locked": return t.errors.orderLocked;
    case "forbidden": return t.errors.forbidden;
    case "empty_order": return t.errors.emptyOrder;
    case "product_hidden": return t.errors.productHidden;
    case "invalid_status": return t.errors.invalidStatus;
    case "invalid_input": return t.errors.invalidInput;
    case "not_kitchen_member": return t.errors.notKitchenMember;
    default: return t.errors.generic;
  }
}

// ── Notifications (best effort, never throws) ────────────────────────────────

export async function notifyKitchen(
  event: KitchenEvent,
  orderId: string,
  extra?: object,
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("notify-kitchen", {
      body: { event, orderId, extra },
    });
    if (error) console.warn("[notifyKitchen]", event, error);
  } catch (err) {
    console.warn("[notifyKitchen]", event, err);
  }
}

// ── Mappers ──────────────────────────────────────────────────────────────────

type ProductRow = {
  id: string; name: string; unit_label: string; pieces_per_unit: number;
  stock_units: number; production_minutes: number; is_visible: boolean;
};
type ItemRow = {
  product_id: string; product_name: string; unit_label: string; pieces_per_unit: number;
  units: number; adjusted_units: number | null; served_from_stock_units: number;
};
type OrderRow = {
  id: string; cafe_id: string; week_start: string; kind: string; status: string;
  urgent_reason: string | null; needed_by: string | null; ready_eta: string | null; decline_note?: string | null;
  kitchen_cafes?: { name: string } | null;
  kitchen_order_items?: ItemRow[] | null;
};

export function mapProduct(r: ProductRow): KitchenProduct {
  return {
    id: r.id,
    name: r.name,
    unitLabel: r.unit_label,
    piecesPerUnit: r.pieces_per_unit,
    stockUnits: r.stock_units,
    productionMinutes: r.production_minutes,
    isVisible: r.is_visible,
  };
}

export function mapItem(r: ItemRow): KitchenOrderItem {
  return {
    productId: r.product_id,
    productName: r.product_name,
    unitLabel: r.unit_label,
    piecesPerUnit: r.pieces_per_unit,
    units: r.units,
    adjustedUnits: r.adjusted_units,
    servedFromStockUnits: r.served_from_stock_units,
  };
}

export function mapOrder(r: OrderRow): KitchenOrder {
  return {
    id: r.id,
    cafeId: r.cafe_id,
    cafeName: r.kitchen_cafes?.name ?? "",
    weekStart: r.week_start,
    kind: r.kind as KitchenOrder["kind"],
    status: r.status as KitchenOrder["status"],
    urgentReason: r.urgent_reason,
    neededBy: r.needed_by,
    readyEta: r.ready_eta,
    declineNote: r.decline_note ?? null,
    items: (r.kitchen_order_items ?? []).map(mapItem),
  };
}

// ── Queries ──────────────────────────────────────────────────────────────────

export function useKitchenProducts() {
  return useQuery({
    queryKey: ["kitchen", "products"],
    queryFn: async (): Promise<KitchenProduct[]> => {
      const { data, error } = await supabase
        .from("kitchen_products")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapProduct);
    },
  });
}

export type KitchenSettings = {
  cutoffWeekday: number;
  cutoffTime: string;
  reminderHoursBefore: number;
  weeklyCapacityMinutes: number;
};

export function useKitchenSettings() {
  return useQuery({
    queryKey: ["kitchen", "settings"],
    queryFn: async (): Promise<KitchenSettings> => {
      const { data, error } = await supabase
        .from("kitchen_settings")
        .select("*")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return {
        cutoffWeekday: data.cutoff_weekday,
        cutoffTime: data.cutoff_time,
        reminderHoursBefore: data.reminder_hours_before,
        weeklyCapacityMinutes: data.weekly_capacity_minutes,
      };
    },
  });
}

export function useCurrentWeek() {
  return useQuery({
    queryKey: ["kitchen", "currentWeek"],
    queryFn: async (): Promise<{ weekStart: string; cutoffAt: string }> => {
      const { data, error } = await supabase.rpc("kitchen_current_week");
      if (error) throw error;
      const row = data?.[0];
      if (!row) throw new Error("kitchen_current_week returned no row");
      return { weekStart: row.week_start, cutoffAt: row.cutoff_at };
    },
  });
}

/** The production week: the one before the ordering week (its cutoff passed most recently). */
export function useProductionWeek() {
  const q = useCurrentWeek();
  const data = useMemo(
    () => (q.data ? { weekStart: productionWeekStart(q.data.weekStart) } : undefined),
    [q.data],
  );
  return { data, isLoading: q.isLoading, error: q.error };
}

export type KitchenOrderFilter = {
  weekStart?: string;
  cafeId?: string;
  kind?: "weekly" | "urgent";
};

export function useKitchenOrders(filter: KitchenOrderFilter = {}) {
  return useQuery({
    queryKey: ["kitchen", "orders", filter.weekStart ?? null, filter.cafeId ?? null, filter.kind ?? null],
    queryFn: async (): Promise<KitchenOrder[]> => {
      let q = supabase
        .from("kitchen_orders")
        .select("*, kitchen_cafes(name), kitchen_order_items(*)")
        .order("created_at", { ascending: true });
      if (filter.weekStart) q = q.eq("week_start", filter.weekStart);
      if (filter.cafeId) q = q.eq("cafe_id", filter.cafeId);
      if (filter.kind) q = q.eq("kind", filter.kind);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => mapOrder(r as unknown as OrderRow));
    },
  });
}

export function useKitchenCafes() {
  return useQuery({
    queryKey: ["kitchen", "cafes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kitchen_cafes")
        .select("id, name, is_active")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((c) => ({ id: c.id, name: c.name, isActive: c.is_active }));
    },
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────

// Builds a mutation that calls an RPC, invalidates ["kitchen"], then (optionally)
// fires a best-effort notification. Notification is never awaited.
function useRpcMutation<V, R = unknown>(opts: {
  call: (v: V) => PromiseLike<{ data: R | null; error: { message: string } | null }>;
  notify?: (v: V, data: R | null) => { event: KitchenEvent; orderId: string; extra?: object } | null;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: V) => {
      const { data, error } = await opts.call(v);
      if (error) throw error;
      return data;
    },
    onSuccess: (data, v) => {
      void qc.invalidateQueries({ queryKey: ["kitchen"] });
      const n = opts.notify?.(v, data);
      if (n) void notifyKitchen(n.event, n.orderId, n.extra);
    },
  });
}

type OrderArg = { orderId: string };

// A café edit of an approved order sends it back for review (flipped = true): tell the stores manager.
export const useSetItem = () =>
  useRpcMutation<{ orderId: string; productId: string; units: number }, boolean>({
    call: (v) => supabase.rpc("kitchen_set_item", { p_order_id: v.orderId, p_product_id: v.productId, p_units: v.units }),
    notify: (v, flipped) => (flipped ? { event: "order_sent", orderId: v.orderId } : null),
  });

export const useGetOrCreateDraft = () =>
  useRpcMutation<{ cafeId?: string | null }, string>({
    call: (v) => supabase.rpc("kitchen_get_or_create_draft", v.cafeId ? { p_cafe_id: v.cafeId } : {}),
  });

export const useSendOrder = () =>
  useRpcMutation<OrderArg>({
    call: (v) => supabase.rpc("kitchen_send_order", { p_order_id: v.orderId }),
    notify: (v) => ({ event: "order_sent", orderId: v.orderId }),
  });

export const useMarkReceived = () =>
  useRpcMutation<OrderArg>({
    call: (v) => supabase.rpc("kitchen_mark_received", { p_order_id: v.orderId }),
  });

export const useLockOrder = () =>
  useRpcMutation<OrderArg>({
    call: (v) => supabase.rpc("kitchen_lock_order", { p_order_id: v.orderId }),
  });

export const useUnlockOrder = () =>
  useRpcMutation<OrderArg>({
    call: (v) => supabase.rpc("kitchen_unlock_order", { p_order_id: v.orderId }),
  });

export const useAdjustItem = () =>
  useRpcMutation<{ orderId: string; productId: string; adjustedUnits: number }>({
    call: (v) =>
      supabase.rpc("kitchen_adjust_item", {
        p_order_id: v.orderId,
        p_product_id: v.productId,
        p_adjusted_units: v.adjustedUnits,
      }),
  });

export const useApproveOrder = () =>
  useRpcMutation<OrderArg, { changes?: KitchenChange[] }>({
    call: (v) =>
      supabase.rpc("kitchen_approve_order", { p_order_id: v.orderId }) as unknown as PromiseLike<{
        data: { changes?: KitchenChange[] } | null;
        error: { message: string } | null;
      }>,
    notify: (v, data) => ({ event: "order_approved", orderId: v.orderId, extra: { changes: data?.changes ?? [] } }),
  });

export const useDeclineOrder = () =>
  useRpcMutation<{ orderId: string; note: string }>({
    call: (v) => supabase.rpc("kitchen_decline_order", { p_order_id: v.orderId, p_note: v.note }),
    notify: (v) => ({ event: "urgent_declined", orderId: v.orderId, extra: { note: v.note } }),
  });

export const useCreateUrgentOrder = () =>
  useRpcMutation<
    { cafeId: string | null; reason: string; neededBy: string; items: { productId: string; units: number }[] },
    string
  >({
    call: (v) =>
      supabase.rpc("kitchen_create_urgent_order", {
        p_cafe_id: v.cafeId as string,
        p_reason: v.reason,
        p_needed_by: v.neededBy,
        p_items: v.items.map((i) => ({ product_id: i.productId, units: i.units })),
      }),
    notify: (_v, id) => (id ? { event: "urgent_created", orderId: id } : null),
  });

export const useSetReadyEta = () =>
  useRpcMutation<{ orderId: string; eta: string }>({
    call: (v) => supabase.rpc("kitchen_set_ready_eta", { p_order_id: v.orderId, p_eta: v.eta }),
    notify: (v) => ({ event: "ready_eta", orderId: v.orderId, extra: { eta: v.eta } }),
  });

export const useMarkReady = () =>
  useRpcMutation<OrderArg>({
    call: (v) => supabase.rpc("kitchen_mark_ready", { p_order_id: v.orderId }),
    notify: (v) => ({ event: "order_ready", orderId: v.orderId }),
  });

export const useCreateOrderForCafe = () =>
  useRpcMutation<{ cafeId: string; weekStart?: string }, string>({
    call: (v) =>
      supabase.rpc("kitchen_create_order_for_cafe", { p_cafe_id: v.cafeId, p_week_start: v.weekStart }),
  });

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; patch: Partial<Omit<KitchenProduct, "id">> & { sortOrder?: number; photoUrl?: string | null } }) => {
      const p = v.patch;
      const row: TablesUpdate<"kitchen_products"> = {};
      if (p.name !== undefined) row.name = p.name;
      if (p.unitLabel !== undefined) row.unit_label = p.unitLabel;
      if (p.piecesPerUnit !== undefined) row.pieces_per_unit = p.piecesPerUnit;
      if (p.stockUnits !== undefined) row.stock_units = p.stockUnits;
      if (p.productionMinutes !== undefined) row.production_minutes = p.productionMinutes;
      if (p.isVisible !== undefined) row.is_visible = p.isVisible;
      if (p.sortOrder !== undefined) row.sort_order = p.sortOrder;
      if (p.photoUrl !== undefined) row.photo_url = p.photoUrl;
      row.updated_at = new Date().toISOString();
      const { error } = await supabase.from("kitchen_products").update(row).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["kitchen"] }),
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Omit<KitchenProduct, "id"> & { sortOrder?: number; photoUrl?: string | null }) => {
      const { error } = await supabase.from("kitchen_products").insert({
        name: v.name,
        unit_label: v.unitLabel,
        pieces_per_unit: v.piecesPerUnit,
        stock_units: v.stockUnits,
        production_minutes: v.productionMinutes,
        is_visible: v.isVisible,
        sort_order: v.sortOrder ?? 0,
        photo_url: v.photoUrl ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["kitchen"] }),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<KitchenSettings>) => {
      const row: TablesUpdate<"kitchen_settings"> = { updated_at: new Date().toISOString() };
      if (v.cutoffWeekday !== undefined) row.cutoff_weekday = v.cutoffWeekday;
      if (v.cutoffTime !== undefined) row.cutoff_time = v.cutoffTime;
      if (v.reminderHoursBefore !== undefined) row.reminder_hours_before = v.reminderHoursBefore;
      if (v.weeklyCapacityMinutes !== undefined) row.weekly_capacity_minutes = v.weeklyCapacityMinutes;
      const { error } = await supabase.from("kitchen_settings").update(row).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["kitchen"] }),
  });
}
