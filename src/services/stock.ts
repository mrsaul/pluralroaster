import { supabase } from "@/integrations/supabase/client";

// roasted_stock and roasted_stock_history are now included in auto-generated types.ts.

export type StockListItem = {
  id: string | null;             // null = product exists but no stock row yet
  product_id: string;
  quantity_kg: number | null;    // null = untracked
  low_stock_threshold_kg: number | null;
  last_updated_by: string | null;
  last_updated_at: string | null;
  created_at: string | null;
  product_name: string;
  updater_name: string | null;
  is_low: boolean;
};

export type StockHistoryRow = {
  id: string;
  stock_id: string;
  previous_quantity_kg: number;
  new_quantity_kg: number;
  delta_kg: number;
  change_type: "manual_update" | "order_delivered";
  order_id: string | null;
  note: string | null;
  updated_by: string | null;
  updated_at: string;
  updater_name: string | null;
  order_reference: string | null;
};

// ── getStockList ──────────────────────────────────────────────────────────────
// Drives from products (LEFT JOIN roasted_stock) so every active product
// always appears, even if its stock row is somehow missing.

export async function getStockList(): Promise<StockListItem[]> {
  const { data, error } = await supabase
    .from("products")
    .select(`
      id, name, custom_name, data_source_mode,
      roasted_stock (
        id, quantity_kg, low_stock_threshold_kg,
        last_updated_by, last_updated_at, created_at,
        profiles ( full_name )
      )
    `)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw error;

  const rows: StockListItem[] = (data ?? []).map((row) => {
    const productName =
      row.data_source_mode === "custom" && row.custom_name
        ? row.custom_name
        : row.name;

    // Supabase returns FK relations as array or object depending on cardinality.
    // roasted_stock has unique(product_id) so it's at most one row.
    const rs = Array.isArray(row.roasted_stock)
      ? row.roasted_stock[0] ?? null
      : (row.roasted_stock ?? null);

    const qty = rs !== null ? Number(rs.quantity_kg) : null;
    const threshold = rs !== null ? Number(rs.low_stock_threshold_kg) : null;
    const isLow = qty !== null && threshold !== null && qty <= threshold;

    return {
      id: rs?.id ?? null,
      product_id: row.id,
      quantity_kg: qty,
      low_stock_threshold_kg: threshold,
      last_updated_by: rs?.last_updated_by ?? null,
      last_updated_at: rs?.last_updated_at ?? null,
      created_at: rs?.created_at ?? null,
      product_name: productName,
      updater_name: (rs?.profiles as any)?.full_name ?? null,
      is_low: isLow,
    };
  });

  // Low-stock first, then alphabetical
  return rows.sort((a, b) => {
    if (a.is_low !== b.is_low) return a.is_low ? -1 : 1;
    return a.product_name.localeCompare(b.product_name);
  });
}

// ── updateStock ───────────────────────────────────────────────────────────────

export async function updateStock(
  stockId: string,
  newQuantityKg: number,
  newThresholdKg: number,
  note?: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.rpc("update_stock_with_history", {
    p_stock_id: stockId,
    p_new_qty: newQuantityKg,
    p_new_threshold: newThresholdKg,
    p_note: note?.trim() || null,
    p_updated_by: user.id,
  });

  if (error) throw error;
}

// ── initStock ─────────────────────────────────────────────────────────────────
// Creates a stock row for a product that somehow has none.
// on conflict do nothing makes this idempotent.

export async function initStock(productId: string): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("roasted_stock")
    .upsert(
      { product_id: productId, quantity_kg: 0, low_stock_threshold_kg: 5 },
      { onConflict: "product_id", ignoreDuplicates: false },
    )
    .select("id")
    .single();
  if (error) throw error;
  return data as { id: string };
}

// ── getStockHistory ───────────────────────────────────────────────────────────

export async function getStockHistory(stockId: string): Promise<StockHistoryRow[]> {
  const { data, error } = await supabase
    .from("roasted_stock_history")
    .select(`
      id, stock_id, previous_quantity_kg, new_quantity_kg,
      delta_kg, change_type, order_id, note, updated_by, updated_at,
      profiles ( full_name )
    `)
    .eq("stock_id", stockId)
    .order("updated_at", { ascending: false })
    .limit(30);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    stock_id: row.stock_id ?? "",
    previous_quantity_kg: Number(row.previous_quantity_kg),
    new_quantity_kg: Number(row.new_quantity_kg),
    delta_kg: Number(row.delta_kg),
    change_type: row.change_type as "manual_update" | "order_delivered",
    order_id: row.order_id,
    note: row.note,
    updated_by: row.updated_by,
    updated_at: row.updated_at ?? "",
    updater_name: (row.profiles as any)?.full_name ?? null,
    order_reference: row.order_id ? (row.order_id as string).slice(0, 8) : null,
  }));
}
