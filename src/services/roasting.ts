import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_GREEN_PERCENT,
  type RoastingInputs,
  type RoastingLine,
} from "@/lib/roasting";

export type RoastingInputsWithNames = RoastingInputs & {
  productNames: Record<string, string>;
};

export async function getRoastingInputs(): Promise<RoastingInputsWithNames> {
  const [stockRes, productsRes, settingsRes] = await Promise.all([
    supabase.from("roasted_stock").select("product_id, quantity_kg"),
    supabase
      .from("products")
      .select("id, name, custom_name, data_source_mode, green_percent"),
    supabase.from("roasting_settings").select("default_green_percent").maybeSingle(),
  ]);

  if (stockRes.error) throw stockRes.error;
  if (productsRes.error) throw productsRes.error;
  if (settingsRes.error) throw settingsRes.error;

  const stockKg: Record<string, number> = {};
  for (const row of stockRes.data ?? []) {
    stockKg[row.product_id] = Number(row.quantity_kg);
  }

  const productPercent: Record<string, number | null> = {};
  const productNames: Record<string, string> = {};
  for (const p of productsRes.data ?? []) {
    productPercent[p.id] = p.green_percent === null ? null : Number(p.green_percent);
    productNames[p.id] =
      p.data_source_mode === "custom" && p.custom_name ? p.custom_name : p.name;
  }

  const raw = settingsRes.data?.default_green_percent;
  const defaultPercent = raw === null || raw === undefined ? DEFAULT_GREEN_PERCENT : Number(raw);

  return { stockKg, productPercent, defaultPercent, productNames };
}

export async function getOpenRoastingLines(): Promise<RoastingLine[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, delivery_date, order_items ( product_id, product_name, quantity, kind )")
    .in("status", ["received", "approved", "packaging"])
    .eq("is_packed", false);

  if (error) throw error;

  const lines: RoastingLine[] = [];
  for (const order of data ?? []) {
    for (const item of order.order_items ?? []) {
      if (!item.product_id) continue;
      lines.push({
        orderId: order.id,
        productId: item.product_id,
        productName: item.product_name,
        quantityKg: Number(item.quantity),
        kind: item.kind === "service" ? "service" : "coffee",
        deliveryDate: order.delivery_date,
      });
    }
  }
  return lines;
}

export async function addRoastedStock(
  productId: string,
  kg: number,
  note?: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("add_roasted_stock", {
    p_product_id: productId,
    p_kg: kg,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
  return Number(data);
}

export async function setGreenPercent(productId: string, percent: number | null): Promise<void> {
  const { error } = await supabase.rpc("set_green_percent", {
    p_product_id: productId,
    p_percent: percent,
  });
  if (error) throw error;
}

export async function setDefaultGreenPercent(percent: number): Promise<void> {
  const { error } = await supabase.rpc("set_default_green_percent", { p_percent: percent });
  if (error) throw error;
}
