// ── PluralRoaster — Google Sheets Invoicing Export v2 ────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Google JWT auth ───────────────────────────────────────────────────────────
function base64url(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function strToBase64url(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
async function getGoogleAccessToken(serviceEmail: string, privateKeyPem: string): Promise<string> {
  const pem = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "\n").replace(/\n/g, "").replace(/\s/g, "").trim();
  const keyBytes = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyBytes.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const now = Math.floor(Date.now() / 1000);
  const h = strToBase64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const p = strToBase64url(JSON.stringify({ iss: serviceEmail, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(`${h}.${p}`));
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${h}.${p}.${base64url(sig)}` }),
  });
  if (!resp.ok) throw new Error(`Google auth failed: ${await resp.text()}`);
  const { access_token } = (await resp.json()) as { access_token: string };
  return access_token;
}

// ── Sheets REST helpers ───────────────────────────────────────────────────────
class SheetsPermissionError extends Error {
  constructor(msg: string) { super(msg); this.name = "SheetsPermissionError"; }
}
type GoogleColor = { red: number; green: number; blue: number };
type SheetMeta = { properties: { title: string; sheetId: number; index: number } };

async function sheetsApi(token: string, method: string, path: string, body?: unknown): Promise<unknown> {
  const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  if (!resp.ok) {
    if (resp.status === 403) throw new SheetsPermissionError(text);
    throw new Error(`Sheets ${method} ${path} → ${resp.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function getAllSheets(token: string, id: string): Promise<SheetMeta[]> {
  const data = (await sheetsApi(token, "GET", `/${id}?fields=sheets.properties`)) as { sheets: SheetMeta[] };
  return data.sheets ?? [];
}
async function writeValues(token: string, id: string, range: string, values: unknown[][]): Promise<void> {
  await sheetsApi(token, "PUT", `/${id}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, { range, majorDimension: "ROWS", values });
}
async function clearRange(token: string, id: string, range: string): Promise<void> {
  await sheetsApi(token, "POST", `/${id}/values/${encodeURIComponent(range)}:clear`, {});
}
async function batchUpdate(token: string, id: string, requests: unknown[]): Promise<void> {
  if (requests.length === 0) return;
  await sheetsApi(token, "POST", `/${id}:batchUpdate`, { requests });
}

// ── French month names ────────────────────────────────────────────────────────
const FRENCH_MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
function monthTabName(year: number, month: number): string { return `${FRENCH_MONTHS[month]} ${year}`; }

// ── Color constants ───────────────────────────────────────────────────────────
const VAT_RATE = 20;
const CLIENT_HEADER_COLORS: GoogleColor[] = [
  { red: 0.68, green: 0.85, blue: 0.90 },
  { red: 0.72, green: 0.88, blue: 0.73 },
  { red: 0.99, green: 0.98, blue: 0.70 },
  { red: 0.99, green: 0.85, blue: 0.71 },
  { red: 0.87, green: 0.74, blue: 0.90 },
];
const COLOR_WHITE: GoogleColor = { red: 1, green: 1, blue: 1 };
const COLOR_LIGHT_GRAY: GoogleColor = { red: 0.93, green: 0.93, blue: 0.93 };
const COLOR_ORDER_HEADER: GoogleColor = { red: 0.86, green: 0.86, blue: 0.86 };
const COLOR_CLIENT_TOTAL: GoogleColor = { red: 0.75, green: 0.75, blue: 0.75 };
const COLOR_INVOICED_GREEN: GoogleColor = { red: 0.72, green: 0.93, blue: 0.70 };
const COLOR_NOT_INVOICED_RED: GoogleColor = { red: 0.99, green: 0.75, blue: 0.75 };
const COLOR_DARK: GoogleColor = { red: 0.18, green: 0.18, blue: 0.18 };
const COLOR_DARK_TEXT: GoogleColor = { red: 0.10, green: 0.10, blue: 0.10 };

// ── Domain types ──────────────────────────────────────────────────────────────
type OrderItem = {
  product_name: string | null;
  product_sku: string | null;
  price_per_kg: number;
  quantity: number;
  size_label: string | null;
};
type RawOrder = {
  id: string;
  user_id: string | null;
  company_id: string | null;
  delivery_date: string;
  total_price: number;
  status: string;
  sellsy_id: string | null;
  sellsy_invoice_id: string | null;
  invoicing_status: string;
  notes: string | null;
  order_items: OrderItem[];
  companies: { id: string; name: string | null; email: string | null } | null;
};
type ClientGroup = {
  groupKey: string;
  companyName: string;
  contactName: string | null;
  orders: RawOrder[];
};
type YearSummaryOrder = {
  id: string;
  user_id: string | null;
  company_id: string | null;
  delivery_date: string;
  total_price: number;
  invoicing_status: string;
  order_items: Pick<OrderItem, "price_per_kg" | "quantity">[];
  companies: { id: string; name: string | null } | null;
};
function emptyCells(n: number): string[] { return Array(n).fill(""); }

// ── Data fetch ────────────────────────────────────────────────────────────────
async function fetchOrdersForMonth(
  db: ReturnType<typeof createClient>,
  year: number,
  month: number, // 0-indexed
): Promise<ClientGroup[]> {
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);

  const { data: ordersRaw, error } = await (db as any)
    .from("orders")
    .select(`
      id, user_id, company_id, delivery_date, total_price, status,
      sellsy_id, sellsy_invoice_id, invoicing_status, notes,
      order_items ( product_name, product_sku, price_per_kg, quantity, size_label ),
      companies ( id, name, email )
    `)
    .in("status", ["received", "approved", "packaging", "ready_for_delivery", "delivered"])
    .gte("delivery_date", monthStart)
    .lte("delivery_date", monthEnd)
    .order("delivery_date");
  if (error) throw error;

  const orders = (ordersRaw ?? []) as RawOrder[];

  // Fetch primary contacts for all company_ids
  const companyIds = [...new Set(orders.map((o) => o.company_id).filter(Boolean))] as string[];
  const contactMap = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: contacts, error: contactsError } = await db.from("contacts")
      .select("company_id, first_name, last_name")
      .eq("is_primary", true)
      .in("company_id", companyIds);
    if (contactsError) throw contactsError;
    for (const c of (contacts ?? []) as { company_id: string; first_name: string | null; last_name: string | null }[]) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
      if (name) contactMap.set(c.company_id, name);
    }
  }

  // Fetch profiles for user_id-based orders (auth users without company_id)
  const userIds = [...new Set(orders.filter((o) => o.user_id && !o.company_id).map((o) => o.user_id!))] as string[];
  const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await db.from("profiles").select("id, full_name, email").in("id", userIds);
    if (profilesError) throw profilesError;
    for (const p of (profiles ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
      profileMap.set(p.id, p);
    }
  }

  // Group by client
  const groups = new Map<string, ClientGroup>();
  for (const order of orders) {
    let groupKey: string, companyName: string, contactName: string | null = null;
    if (order.company_id && order.companies) {
      groupKey = order.company_id;
      companyName = order.companies.name ?? order.companies.email ?? order.company_id.slice(0, 8);
      contactName = contactMap.get(order.company_id) ?? null;
    } else if (order.user_id) {
      groupKey = order.user_id;
      const p = profileMap.get(order.user_id);
      companyName = p?.full_name ?? p?.email ?? order.user_id.slice(0, 8);
    } else {
      groupKey = "unknown"; companyName = "Client inconnu";
    }
    if (!groups.has(groupKey)) groups.set(groupKey, { groupKey, companyName, contactName, orders: [] });
    groups.get(groupKey)!.orders.push(order);
  }
  for (const g of groups.values()) {
    g.orders.sort((a, b) => a.delivery_date.localeCompare(b.delivery_date));
  }
  return [...groups.values()].sort((a, b) => a.companyName.localeCompare(b.companyName, "fr"));
}

async function fetchAllOrdersForYear(
  db: ReturnType<typeof createClient>,
  year: number,
): Promise<YearSummaryOrder[]> {
  const { data, error } = await (db as any)
    .from("orders")
    .select(`id, user_id, company_id, delivery_date, total_price, invoicing_status, order_items ( price_per_kg, quantity ), companies ( id, name )`)
    .in("status", ["received", "approved", "packaging", "ready_for_delivery", "delivered"])
    .gte("delivery_date", `${year}-01-01`)
    .lte("delivery_date", `${year}-12-31`);
  if (error) throw error;
  return (data ?? []) as YearSummaryOrder[];
}

// ── PLACEHOLDER — functions added in later tasks ──────────────────────────────
// buildMonthlyTabRows, ensureTab, ensureResumeTab, ensureMonthTab,
// writeMonthlyTab, writeResumeAnnuel are added below this line in Tasks 2-4.

const serviceEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(JSON.stringify({ error: "Not yet implemented — see plan tasks 2-5" }), {
    status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
