# Google Sheets Invoicing Export Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Google Sheets invoicing export to produce a richly-formatted, client-grouped monthly tab + yearly Résumé Annuel tab, replacing the current flat-row export.

**Architecture:** One Supabase edge function (`export-invoicing-sheet`) rewrites completely: queries orders joined with companies/contacts, groups by client alphabetically, builds multi-section monthly tabs, and writes a yearly summary dashboard. The frontend (`InvoicingView.tsx`) gets a month/year period picker and redesigned export controls. Year-level sheet ID stored in `sheet_exports` as `month_key = "invoicing-YYYY"`.

**Tech Stack:** Deno (Supabase edge functions), Google Sheets REST API v4, TypeScript, React/TypeScript (Vite/Tailwind frontend), Supabase Postgres

**Out of scope:** Step 8 (auto-update on order status change) — separate plan after core export is validated.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/functions/export-invoicing-sheet/index.ts` | **Full rewrite** | All export logic |
| `src/components/InvoicingView.tsx` | **Modify** | Period picker + new export controls UI |

No DB migrations needed. No new files.

**Working directory for all commands:** `pluralroaster/` (the nested repo, not the outer folder).

---

### Task 1: Types, helpers, and data-fetch rewrite

**Files:**
- Modify: `supabase/functions/export-invoicing-sheet/index.ts`

Context: The current file is ~350 lines with a flat query using `profiles`. Rewrite it completely from scratch with new types and a query that joins `companies` and `contacts`. Orders may have `user_id = null` (Sellsy-only clients identified by `company_id`) — use `as any` casts where the migration-added `company_id` column isn't in generated types.

Column layout for monthly tabs (12 cols, A=0 … L=11):
- A=Produit, B=Variante, C=SKU, D=Quantité, E=Prix unit HT, F=Total HT (formula), G=TVA%, H=Total TTC (formula), I=Facturé Sellsy (order summary only), J=N° Facture, K=Notes, L=Vérifié ✓ (checkbox)

- [ ] **Step 1: Replace the entire file with the new skeleton**

Replace `supabase/functions/export-invoicing-sheet/index.ts` with:

```typescript
// ── PluralRoaster — Google Sheets Invoicing Export v2 ────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Google JWT auth ───────────────────────────────────────────────────────────
function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
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
function emptyCells(n: number): string[] { return Array(n).fill(""); }

// ── PLACEHOLDER — functions added in later tasks ──────────────────────────────
// fetchOrdersForMonth, fetchAllOrdersForYear, buildMonthlyTabRows,
// ensureTab, ensureResumeTab, ensureMonthTab, writeMonthlyTab, writeResumeAnnuel
// are added below this line in Tasks 2-4.

const serviceEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(JSON.stringify({ error: "Not yet implemented — see plan tasks 2-5" }), {
    status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Deploy to verify it boots without type errors**

```bash
npx supabase functions deploy export-invoicing-sheet --project-ref wkffugaijomivqahnxom
```

Expected: `Deployed Functions on project wkffugaijomivqahnxom: export-invoicing-sheet` (no build error).

- [ ] **Step 3: Add `fetchOrdersForMonth` after the color constants (before the `serviceEmail` line)**

```typescript
async function fetchOrdersForMonth(
  db: ReturnType<typeof createClient>,
  year: number,
  month: number, // 0-indexed
): Promise<ClientGroup[]> {
  const monthStart = new Date(year, month, 1).toISOString().slice(0, 10);
  const monthEnd = new Date(year, month + 1, 0).toISOString().slice(0, 10);

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
    const { data: contacts } = await db.from("contacts")
      .select("company_id, first_name, last_name")
      .eq("is_primary", true)
      .in("company_id", companyIds);
    for (const c of (contacts ?? []) as { company_id: string; first_name: string | null; last_name: string | null }[]) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
      if (name) contactMap.set(c.company_id, name);
    }
  }

  // Fetch profiles for user_id-based orders (auth users without company_id)
  const userIds = [...new Set(orders.filter((o) => o.user_id && !o.company_id).map((o) => o.user_id!))] as string[];
  const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
  if (userIds.length > 0) {
    const { data: profiles } = await db.from("profiles").select("id, full_name, email").in("id", userIds);
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
): Promise<RawOrder[]> {
  const { data, error } = await (db as any)
    .from("orders")
    .select(`id, user_id, company_id, delivery_date, total_price, invoicing_status, order_items ( price_per_kg, quantity ), companies ( id, name )`)
    .in("status", ["received", "approved", "packaging", "ready_for_delivery", "delivered"])
    .gte("delivery_date", `${year}-01-01`)
    .lte("delivery_date", `${year}-12-31`);
  if (error) throw error;
  return (data ?? []) as RawOrder[];
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/export-invoicing-sheet/index.ts
git commit -m "feat(sheets): skeleton + data-fetch helpers with company/contact join"
```

---

### Task 2: Monthly tab layout builder

**Files:**
- Modify: `supabase/functions/export-invoicing-sheet/index.ts`

Context: Add `buildMonthlyTabRows(sheetId, groups)` — pure data transformation that returns `{ rows, formatRequests, checkboxRanges }`. No Sheets API calls. Insert this function after `fetchAllOrdersForYear` and before the `serviceEmail` line.

- [ ] **Step 1: Add the builder function**

```typescript
type MonthlyTabData = {
  rows: unknown[][];
  formatRequests: unknown[];
  checkboxRanges: { startRow: number; endRow: number }[];
};

function buildMonthlyTabRows(sheetId: number, groups: ClientGroup[]): MonthlyTabData {
  const COLS = 12;
  const rows: unknown[][] = [];
  const formatRequests: unknown[] = [];
  const checkboxRanges: { startRow: number; endRow: number }[] = [];

  // ── Global column header row ──────────────────────────────────────────────
  rows.push(["Produit","Variante","SKU / Réf","Quantité","Prix unit. HT","Total HT","TVA %","Total TTC","Facturé Sellsy","N° Facture Sellsy","Notes","Vérifié ✓"]);
  formatRequests.push(
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: {
          backgroundColor: COLOR_DARK,
          textFormat: { bold: true, foregroundColor: COLOR_WHITE, fontSize: 10 },
          horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE",
        }},
        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
      },
    },
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 } },
        fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
      },
    },
  );

  // ── Per-client sections ───────────────────────────────────────────────────
  groups.forEach((group, groupIdx) => {
    const clientColor = CLIENT_HEADER_COLORS[groupIdx % CLIENT_HEADER_COLORS.length];

    // Client header row
    const clientHeaderIdx = rows.length;
    const clientLabel = group.contactName ? `${group.companyName} — ${group.contactName}` : group.companyName;
    rows.push([clientLabel, ...emptyCells(COLS - 1)]);
    formatRequests.push(
      { mergeCells: { range: { sheetId, startRowIndex: clientHeaderIdx, endRowIndex: clientHeaderIdx + 1, startColumnIndex: 0, endColumnIndex: COLS }, mergeType: "MERGE_ALL" } },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: clientHeaderIdx, endRowIndex: clientHeaderIdx + 1 },
          cell: { userEnteredFormat: { backgroundColor: clientColor, textFormat: { bold: true, fontSize: 14, foregroundColor: COLOR_DARK_TEXT }, verticalAlignment: "MIDDLE" } },
          fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)",
        },
      },
    );

    let clientHt = 0, clientUnbilledHt = 0, clientUnbilledCount = 0;

    group.orders.forEach((order) => {
      // Order header row
      const orderHeaderIdx = rows.length;
      const dateStr = order.delivery_date.split("-").reverse().join("/");
      const statusLabel: Record<string, string> = { received: "Reçue", approved: "Approuvée", packaging: "En conditionnement", ready_for_delivery: "Prête", delivered: "Livrée" };
      const orderLabel = `Commande #${order.id.slice(0, 8).toUpperCase()} — ${dateStr} — Statut: ${statusLabel[order.status] ?? order.status}`;
      rows.push([orderLabel, ...emptyCells(COLS - 1)]);
      formatRequests.push(
        { mergeCells: { range: { sheetId, startRowIndex: orderHeaderIdx, endRowIndex: orderHeaderIdx + 1, startColumnIndex: 0, endColumnIndex: COLS - 1 }, mergeType: "MERGE_ALL" } },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: orderHeaderIdx, endRowIndex: orderHeaderIdx + 1 },
            cell: { userEnteredFormat: { backgroundColor: COLOR_ORDER_HEADER, textFormat: { bold: true, fontSize: 11 }, verticalAlignment: "MIDDLE" } },
            fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)",
          },
        },
      );
      checkboxRanges.push({ startRow: orderHeaderIdx, endRow: orderHeaderIdx + 1 });

      // Product rows
      const items = [...(order.order_items ?? [])].sort((a, b) => (a.product_name ?? "").localeCompare(b.product_name ?? "", "fr"));
      let orderHt = 0;
      items.forEach((item, itemIdx) => {
        const productRowIdx = rows.length;
        const ht = Number(item.quantity) * Number(item.price_per_kg);
        orderHt += ht;
        rows.push([
          item.product_name ?? "—",
          item.size_label ?? "—",
          item.product_sku ?? "—",
          Number(item.quantity),
          Number(item.price_per_kg),
          `=D${productRowIdx + 1}*E${productRowIdx + 1}`,
          VAT_RATE / 100,
          `=F${productRowIdx + 1}*(1+G${productRowIdx + 1})`,
          "", "", "", "",
        ]);
        const rowBg = itemIdx % 2 === 0 ? COLOR_WHITE : COLOR_LIGHT_GRAY;
        formatRequests.push(
          { repeatCell: { range: { sheetId, startRowIndex: productRowIdx, endRowIndex: productRowIdx + 1 }, cell: { userEnteredFormat: { backgroundColor: rowBg, textFormat: { fontSize: 10 } } }, fields: "userEnteredFormat(backgroundColor,textFormat)" } },
          { repeatCell: { range: { sheetId, startRowIndex: productRowIdx, endRowIndex: productRowIdx + 1, startColumnIndex: 4, endColumnIndex: 6 }, cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "#,##0.00 €" } } }, fields: "userEnteredFormat.numberFormat" } },
          { repeatCell: { range: { sheetId, startRowIndex: productRowIdx, endRowIndex: productRowIdx + 1, startColumnIndex: 7, endColumnIndex: 8 }, cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "#,##0.00 €" } } }, fields: "userEnteredFormat.numberFormat" } },
          { repeatCell: { range: { sheetId, startRowIndex: productRowIdx, endRowIndex: productRowIdx + 1, startColumnIndex: 6, endColumnIndex: 7 }, cell: { userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: "0%" } } }, fields: "userEnteredFormat.numberFormat" } },
        );
      });

      if (items.length === 0) orderHt = Number(order.total_price);
      clientHt += orderHt;

      // Subtotal rows (label in col J, value in col K)
      const isSent = order.invoicing_status === "sent";
      if (!isSent) { clientUnbilledHt += orderHt; clientUnbilledCount++; }
      const invoicedBg = isSent ? COLOR_INVOICED_GREEN : COLOR_NOT_INVOICED_RED;

      for (const [label, val] of [
        ["Sous-total HT:", orderHt],
        [`TVA ${VAT_RATE}%:`, orderHt * VAT_RATE / 100],
        ["Total TTC:", orderHt * (1 + VAT_RATE / 100)],
      ] as [string, number][]) {
        const stRowIdx = rows.length;
        const stRow = emptyCells(COLS) as unknown[];
        stRow[9] = label; stRow[10] = val;
        rows.push(stRow);
        formatRequests.push({ repeatCell: { range: { sheetId, startRowIndex: stRowIdx, endRowIndex: stRowIdx + 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, horizontalAlignment: "RIGHT", numberFormat: { type: "CURRENCY", pattern: "#,##0.00 €" } } }, fields: "userEnteredFormat(textFormat,horizontalAlignment,numberFormat)" } });
      }

      // "Facturé Sellsy" row
      const invRowIdx = rows.length;
      const invRow = emptyCells(COLS) as unknown[];
      invRow[9] = "Facturé Sellsy:";
      invRow[10] = isSent ? "✅ Oui" : "❌ Non";
      invRow[11] = order.sellsy_invoice_id ?? "—";
      rows.push(invRow);
      formatRequests.push({ repeatCell: { range: { sheetId, startRowIndex: invRowIdx, endRowIndex: invRowIdx + 1, startColumnIndex: 10, endColumnIndex: 11 }, cell: { userEnteredFormat: { backgroundColor: invoicedBg, textFormat: { bold: true } } }, fields: "userEnteredFormat(backgroundColor,textFormat)" } });

      // Spacer after order
      rows.push(emptyCells(COLS));
    });

    // Client total block
    const totalRowIdx = rows.length;
    const totalTtc = clientHt * (1 + VAT_RATE / 100);
    const totalRow = emptyCells(COLS) as unknown[];
    totalRow[0] = `TOTAL ${group.companyName.toUpperCase()} — ${group.orders.length} commande${group.orders.length > 1 ? "s" : ""}`;
    totalRow[9] = `HT: ${clientHt.toFixed(2)} €`;
    totalRow[10] = `TTC: ${totalTtc.toFixed(2)} €`;
    rows.push(totalRow);
    formatRequests.push({ repeatCell: { range: { sheetId, startRowIndex: totalRowIdx, endRowIndex: totalRowIdx + 1 }, cell: { userEnteredFormat: { backgroundColor: COLOR_CLIENT_TOTAL, textFormat: { bold: true, fontSize: 11 }, borders: { top: { style: "SOLID_MEDIUM", color: { red: 0.4, green: 0.4, blue: 0.4 } }, bottom: { style: "SOLID_MEDIUM", color: { red: 0.4, green: 0.4, blue: 0.4 } } } } }, fields: "userEnteredFormat(backgroundColor,textFormat,borders)" } });

    if (clientUnbilledCount > 0) {
      const unbilledRowIdx = rows.length;
      const unbilledRow = emptyCells(COLS) as unknown[];
      unbilledRow[0] = `  ↳ À facturer: ${clientUnbilledCount} commande${clientUnbilledCount > 1 ? "s" : ""} (${clientUnbilledHt.toFixed(2)} € HT)`;
      rows.push(unbilledRow);
      formatRequests.push({ repeatCell: { range: { sheetId, startRowIndex: unbilledRowIdx, endRowIndex: unbilledRowIdx + 1 }, cell: { userEnteredFormat: { backgroundColor: COLOR_NOT_INVOICED_RED, textFormat: { bold: true, fontSize: 10 } } }, fields: "userEnteredFormat(backgroundColor,textFormat)" } });
    }

    // Two spacer rows between clients
    rows.push(emptyCells(COLS));
    rows.push(emptyCells(COLS));
  });

  return { rows, formatRequests, checkboxRanges };
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/export-invoicing-sheet/index.ts
git commit -m "feat(sheets): monthly tab layout builder — client-grouped rows with formatting"
```

---

### Task 3: Write monthly tab + tab management

**Files:**
- Modify: `supabase/functions/export-invoicing-sheet/index.ts`

Context: Add tab-management helpers (`ensureTab`, `ensureResumeTab`, `ensureMonthTab`) and `writeMonthlyTab` which calls `buildMonthlyTabRows` then sends everything to the Sheets API — values, formatting, checkboxes, column widths. Insert after `buildMonthlyTabRows` and before the `serviceEmail` line.

- [ ] **Step 1: Add tab management helpers**

```typescript
async function ensureTab(token: string, spreadsheetId: string, allSheets: SheetMeta[], tabName: string, targetIndex: number): Promise<number> {
  const existing = allSheets.find((s) => s.properties.title === tabName);
  if (existing) return existing.properties.sheetId;
  const result = (await sheetsApi(token, "POST", `/${spreadsheetId}:batchUpdate`, {
    requests: [{ addSheet: { properties: { title: tabName, index: targetIndex } } }],
  })) as { replies: [{ addSheet: { properties: { sheetId: number } } }] };
  return result.replies[0].addSheet.properties.sheetId;
}

function ensureResumeTab(token: string, spreadsheetId: string, allSheets: SheetMeta[]): Promise<number> {
  return ensureTab(token, spreadsheetId, allSheets, "Résumé Annuel", 0);
}

function ensureMonthTab(token: string, spreadsheetId: string, allSheets: SheetMeta[], tabName: string): Promise<number> {
  const nonResume = allSheets.filter((s) => s.properties.title !== "Résumé Annuel").length;
  return ensureTab(token, spreadsheetId, allSheets, tabName, 1 + nonResume);
}
```

- [ ] **Step 2: Add `writeMonthlyTab`**

```typescript
async function writeMonthlyTab(
  token: string,
  spreadsheetId: string,
  tabName: string,
  sheetId: number,
  groups: ClientGroup[],
): Promise<void> {
  // Clear first
  await clearRange(token, spreadsheetId, `'${tabName}'!A1:ZZ10000`);

  const { rows, formatRequests, checkboxRanges } = buildMonthlyTabRows(sheetId, groups);

  await writeValues(token, spreadsheetId, `'${tabName}'!A1`, rows);

  // Checkbox data validation on col L (index 11) for each order header row
  const checkboxRequests = checkboxRanges.map(({ startRow, endRow }) => ({
    setDataValidation: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: 11, endColumnIndex: 12 },
      rule: { condition: { type: "BOOLEAN" }, strict: true, showCustomUi: true },
    },
  }));

  // Column widths in pixels
  const widths = [200, 120, 100, 80, 110, 110, 70, 110, 120, 150, 120, 80];
  const widthRequests = widths.map((w, col) => ({
    updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex: col, endIndex: col + 1 },
      properties: { pixelSize: w }, fields: "pixelSize",
    },
  }));

  // Minimum row height
  const rowHeightReq = {
    updateDimensionProperties: {
      range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: rows.length },
      properties: { pixelSize: 24 }, fields: "pixelSize",
    },
  };

  await batchUpdate(token, spreadsheetId, [...formatRequests, ...checkboxRequests, ...widthRequests, rowHeightReq]);
}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/export-invoicing-sheet/index.ts
git commit -m "feat(sheets): tab management + writeMonthlyTab with checkboxes and column widths"
```

---

### Task 4: Résumé Annuel tab writer

**Files:**
- Modify: `supabase/functions/export-invoicing-sheet/index.ts`

Context: Add `writeResumeAnnuel` — writes a dashboard-style first tab with a client × month revenue matrix, an orders-per-month summary table, and a top-clients ranking. Insert after `writeMonthlyTab` and before the `serviceEmail` line.

- [ ] **Step 1: Add `writeResumeAnnuel`**

```typescript
async function writeResumeAnnuel(
  token: string,
  spreadsheetId: string,
  resumeSheetId: number,
  year: number,
  allOrders: RawOrder[],
): Promise<void> {
  await clearRange(token, spreadsheetId, "'Résumé Annuel'!A1:ZZ1000");

  const ABBR = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Août","Sep","Oct","Nov","Déc"];

  // Aggregate data
  const clientNames = new Map<string, string>();
  const clientMonthHt = new Map<string, Map<number, number>>();
  const monthOrderCount = new Map<number, number>();
  const monthInvoicedCount = new Map<number, number>();

  for (const o of allOrders) {
    const key = (o.company_id ?? o.user_id) ?? "unknown";
    const name = (o.companies as any)?.name ?? key.slice(0, 8);
    const m = new Date(o.delivery_date).getMonth();
    const ht = (o.order_items ?? []).reduce((s, i) => s + Number(i.quantity) * Number(i.price_per_kg), 0) || Number(o.total_price);
    clientNames.set(key, name);
    if (!clientMonthHt.has(key)) clientMonthHt.set(key, new Map());
    clientMonthHt.get(key)!.set(m, (clientMonthHt.get(key)!.get(m) ?? 0) + ht);
    monthOrderCount.set(m, (monthOrderCount.get(m) ?? 0) + 1);
    if (o.invoicing_status === "sent") monthInvoicedCount.set(m, (monthInvoicedCount.get(m) ?? 0) + 1);
  }

  const clientKeys = [...clientNames.keys()].sort((a, b) => (clientNames.get(a) ?? "").localeCompare(clientNames.get(b) ?? "", "fr"));

  const rows: unknown[][] = [];
  const fmtReqs: unknown[] = [];

  // Title row
  rows.push([`Résumé Annuel ${year}`, ...Array(13).fill("")]);
  fmtReqs.push(
    { mergeCells: { range: { sheetId: resumeSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 14 }, mergeType: "MERGE_ALL" } },
    { repeatCell: { range: { sheetId: resumeSheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: COLOR_DARK, textFormat: { bold: true, fontSize: 18, foregroundColor: COLOR_WHITE }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)" } },
  );

  // Revenue table header
  rows.push(["Client", ...ABBR, "TOTAL TTC"]);
  const revHeaderIdx = rows.length - 1;
  fmtReqs.push({ repeatCell: { range: { sheetId: resumeSheetId, startRowIndex: revHeaderIdx, endRowIndex: revHeaderIdx + 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.25, green: 0.25, blue: 0.25 }, textFormat: { bold: true, foregroundColor: COLOR_WHITE, fontSize: 10 }, horizontalAlignment: "CENTER" } }, fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)" } });

  const monthTotalsHt = Array(12).fill(0) as number[];
  let grandHt = 0;

  for (const key of clientKeys) {
    const mMap = clientMonthHt.get(key) ?? new Map<number, number>();
    const totalHt = [...mMap.values()].reduce((s, v) => s + v, 0);
    const totalTtc = totalHt * (1 + VAT_RATE / 100);
    grandHt += totalHt;
    const rowVals: unknown[] = [clientNames.get(key) ?? "—"];
    for (let m = 0; m < 12; m++) {
      const ht = mMap.get(m) ?? 0;
      monthTotalsHt[m] += ht;
      rowVals.push(ht > 0 ? ht * (1 + VAT_RATE / 100) : "");
    }
    rowVals.push(totalTtc);
    const dataRowIdx = rows.length;
    rows.push(rowVals);
    fmtReqs.push({ repeatCell: { range: { sheetId: resumeSheetId, startRowIndex: dataRowIdx, endRowIndex: dataRowIdx + 1, startColumnIndex: 1, endColumnIndex: 14 }, cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "#,##0.00 €" } } }, fields: "userEnteredFormat.numberFormat" } });
  }

  // Grand total row
  const grandRowIdx = rows.length;
  const grandRow: unknown[] = ["TOTAL"];
  for (let m = 0; m < 12; m++) grandRow.push(monthTotalsHt[m] > 0 ? monthTotalsHt[m] * (1 + VAT_RATE / 100) : "");
  grandRow.push(grandHt * (1 + VAT_RATE / 100));
  rows.push(grandRow);
  fmtReqs.push({ repeatCell: { range: { sheetId: resumeSheetId, startRowIndex: grandRowIdx, endRowIndex: grandRowIdx + 1 }, cell: { userEnteredFormat: { backgroundColor: COLOR_INVOICED_GREEN, textFormat: { bold: true, fontSize: 11 }, numberFormat: { type: "CURRENCY", pattern: "#,##0.00 €" } } }, fields: "userEnteredFormat(backgroundColor,textFormat,numberFormat)" } });

  rows.push([""], [""]); // spacers

  // Orders per month table
  const ordTableTitleIdx = rows.length;
  rows.push(["Commandes par mois", "", "", ""]);
  fmtReqs.push(
    { mergeCells: { range: { sheetId: resumeSheetId, startRowIndex: ordTableTitleIdx, endRowIndex: ordTableTitleIdx + 1, startColumnIndex: 0, endColumnIndex: 4 }, mergeType: "MERGE_ALL" } },
    { repeatCell: { range: { sheetId: resumeSheetId, startRowIndex: ordTableTitleIdx, endRowIndex: ordTableTitleIdx + 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.25, green: 0.25, blue: 0.25 }, textFormat: { bold: true, foregroundColor: COLOR_WHITE, fontSize: 12 } } }, fields: "userEnteredFormat(backgroundColor,textFormat)" } },
  );
  rows.push(["Mois","Nb commandes","Nb facturées","Nb à facturer"]);
  const ordSubIdx = rows.length - 1;
  fmtReqs.push({ repeatCell: { range: { sheetId: resumeSheetId, startRowIndex: ordSubIdx, endRowIndex: ordSubIdx + 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.45, green: 0.45, blue: 0.45 }, textFormat: { bold: true, foregroundColor: COLOR_WHITE, fontSize: 10 }, horizontalAlignment: "CENTER" } }, fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)" } });

  for (let m = 0; m < 12; m++) {
    const total = monthOrderCount.get(m) ?? 0;
    const invoiced = monthInvoicedCount.get(m) ?? 0;
    const toBill = total - invoiced;
    const mRowIdx = rows.length;
    rows.push([FRENCH_MONTHS[m], total, invoiced, toBill]);
    if (toBill > 0) fmtReqs.push({ repeatCell: { range: { sheetId: resumeSheetId, startRowIndex: mRowIdx, endRowIndex: mRowIdx + 1, startColumnIndex: 3, endColumnIndex: 4 }, cell: { userEnteredFormat: { backgroundColor: COLOR_NOT_INVOICED_RED, textFormat: { bold: true } } }, fields: "userEnteredFormat(backgroundColor,textFormat)" } });
    else if (total > 0) fmtReqs.push({ repeatCell: { range: { sheetId: resumeSheetId, startRowIndex: mRowIdx, endRowIndex: mRowIdx + 1, startColumnIndex: 3, endColumnIndex: 4 }, cell: { userEnteredFormat: { backgroundColor: COLOR_INVOICED_GREEN } }, fields: "userEnteredFormat.backgroundColor" } });
  }

  rows.push([""], [""]); // spacers

  // Top clients table
  const topTitleIdx = rows.length;
  rows.push(["Top clients (CA TTC)", "", "", ""]);
  fmtReqs.push(
    { mergeCells: { range: { sheetId: resumeSheetId, startRowIndex: topTitleIdx, endRowIndex: topTitleIdx + 1, startColumnIndex: 0, endColumnIndex: 4 }, mergeType: "MERGE_ALL" } },
    { repeatCell: { range: { sheetId: resumeSheetId, startRowIndex: topTitleIdx, endRowIndex: topTitleIdx + 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.25, green: 0.25, blue: 0.25 }, textFormat: { bold: true, foregroundColor: COLOR_WHITE, fontSize: 12 } } }, fields: "userEnteredFormat(backgroundColor,textFormat)" } },
  );
  rows.push(["#","Client","CA Total TTC","Nb commandes"]);
  const topSubIdx = rows.length - 1;
  fmtReqs.push({ repeatCell: { range: { sheetId: resumeSheetId, startRowIndex: topSubIdx, endRowIndex: topSubIdx + 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.45, green: 0.45, blue: 0.45 }, textFormat: { bold: true, foregroundColor: COLOR_WHITE, fontSize: 10 }, horizontalAlignment: "CENTER" } }, fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)" } });

  const topClients = clientKeys
    .map((key) => {
      const mMap = clientMonthHt.get(key) ?? new Map<number, number>();
      const totalHt = [...mMap.values()].reduce((s, v) => s + v, 0);
      const orderCount = allOrders.filter((o) => (o.company_id ?? o.user_id) === key).length;
      return { name: clientNames.get(key) ?? "—", totalTtc: totalHt * (1 + VAT_RATE / 100), orderCount };
    })
    .sort((a, b) => b.totalTtc - a.totalTtc);

  topClients.forEach((c, i) => {
    const tRowIdx = rows.length;
    rows.push([i + 1, c.name, c.totalTtc, c.orderCount]);
    fmtReqs.push({ repeatCell: { range: { sheetId: resumeSheetId, startRowIndex: tRowIdx, endRowIndex: tRowIdx + 1, startColumnIndex: 2, endColumnIndex: 3 }, cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "#,##0.00 €" } } }, fields: "userEnteredFormat.numberFormat" } });
  });

  // Column widths + freeze
  fmtReqs.push(
    { updateDimensionProperties: { range: { sheetId: resumeSheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 200 }, fields: "pixelSize" } },
    ...Array.from({ length: 12 }, (_, i) => ({ updateDimensionProperties: { range: { sheetId: resumeSheetId, dimension: "COLUMNS", startIndex: i + 1, endIndex: i + 2 }, properties: { pixelSize: 90 }, fields: "pixelSize" } })),
    { updateDimensionProperties: { range: { sheetId: resumeSheetId, dimension: "COLUMNS", startIndex: 13, endIndex: 14 }, properties: { pixelSize: 120 }, fields: "pixelSize" } },
    { updateSheetProperties: { properties: { sheetId: resumeSheetId, gridProperties: { frozenRowCount: 2, frozenColumnCount: 1 } }, fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount" } },
  );

  await writeValues(token, spreadsheetId, "'Résumé Annuel'!A1", rows);
  await batchUpdate(token, spreadsheetId, fmtReqs);
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/export-invoicing-sheet/index.ts
git commit -m "feat(sheets): Résumé Annuel tab — revenue matrix, orders summary, top clients"
```

---

### Task 5: Main handler + deploy

**Files:**
- Modify: `supabase/functions/export-invoicing-sheet/index.ts`

Context: Replace the stub `Deno.serve` with the real handler. Accepts `{ spreadsheet_id?, year?, month?, action? }`. Stores year-level sheet as `month_key = "invoicing-YYYY"`. Exports the month tab then always refreshes Résumé Annuel.

- [ ] **Step 1: Replace the stub Deno.serve block**

Find and replace:

```typescript
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(JSON.stringify({ error: "Not yet implemented — see plan tasks 2-5" }), {
    status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

With:

```typescript
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY");
    if (!serviceEmail || !privateKey) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY env vars");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY"))!;

    // Auth — admin only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");
    const { data: currentRole, error: roleErr } = await userClient.rpc("ensure_current_user_role");
    if (roleErr) throw new Error(`Role check failed: ${roleErr.message}`);
    if (currentRole !== "admin") throw new Error(`Admin only (your role: ${currentRole})`);

    const db = createClient(supabaseUrl, serviceRoleKey);

    // Parse request
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const bodySpreadsheetId = typeof body.spreadsheet_id === "string" ? body.spreadsheet_id.trim() : null;
    const now = new Date();
    const reqYear = typeof body.year === "number" ? body.year : now.getFullYear();
    const reqMonth = typeof body.month === "number" ? body.month : now.getMonth(); // 0-indexed
    const summaryOnly = body.action === "export_summary";

    // Resolve spreadsheet for this year
    const yearKey = `invoicing-${reqYear}`;
    const { data: existingExport } = await db.from("sheet_exports").select("spreadsheet_id, spreadsheet_url").eq("month_key", yearKey).maybeSingle();

    let spreadsheetId: string, spreadsheetUrl: string;
    if (bodySpreadsheetId) {
      spreadsheetId = bodySpreadsheetId;
      spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
      if (existingExport) {
        await db.from("sheet_exports").update({ spreadsheet_id: spreadsheetId, spreadsheet_url: spreadsheetUrl }).eq("month_key", yearKey);
      } else {
        await db.from("sheet_exports").insert({ month_key: yearKey, spreadsheet_id: spreadsheetId, spreadsheet_url: spreadsheetUrl, orders_count: 0 });
      }
    } else if (existingExport) {
      spreadsheetId = existingExport.spreadsheet_id;
      spreadsheetUrl = existingExport.spreadsheet_url;
    } else {
      throw new Error(`Aucun Google Sheet connecté pour ${reqYear}. Créez un Google Sheet, partagez-le avec le compte de service (${serviceEmail}) en tant qu'Éditeur, collez l'URL et réessayez.`);
    }

    // Google auth
    const token = await getGoogleAccessToken(serviceEmail, privateKey);
    let allSheets = await getAllSheets(token, spreadsheetId);

    // Ensure "Résumé Annuel" tab exists at index 0
    const resumeSheetId = await ensureResumeTab(token, spreadsheetId, allSheets);
    allSheets = await getAllSheets(token, spreadsheetId);

    let ordersExported = 0;

    if (!summaryOnly) {
      const tabName = monthTabName(reqYear, reqMonth);
      const monthSheetId = await ensureMonthTab(token, spreadsheetId, allSheets, tabName);
      allSheets = await getAllSheets(token, spreadsheetId);

      const groups = await fetchOrdersForMonth(db, reqYear, reqMonth);
      ordersExported = groups.reduce((s, g) => s + g.orders.length, 0);
      await writeMonthlyTab(token, spreadsheetId, tabName, monthSheetId, groups);

      const orderIds = groups.flatMap((g) => g.orders.map((o) => o.id));
      if (orderIds.length > 0) {
        await db.from("orders").update({ exported_to_sheet_at: now.toISOString() }).in("id", orderIds);
      }
    }

    // Always refresh Résumé Annuel
    const allYearOrders = await fetchAllOrdersForYear(db, reqYear);
    await writeResumeAnnuel(token, spreadsheetId, resumeSheetId, reqYear, allYearOrders);

    await db.from("sheet_exports").update({ last_exported_at: now.toISOString(), orders_count: allYearOrders.length }).eq("month_key", yearKey);

    return new Response(
      JSON.stringify({ url: spreadsheetUrl, orders_exported: ordersExported, month: monthTabName(reqYear, reqMonth), year: reqYear, service_account_email: serviceEmail }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[export-invoicing-sheet]", err);
    if (err instanceof SheetsPermissionError) {
      const email = serviceEmail ?? "the service account";
      return new Response(
        JSON.stringify({ error: `Permission refusée. Partagez le Google Sheet avec "${email}" en tant qu'Éditeur, puis réessayez.`, service_account_email: serviceEmail ?? null }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy export-invoicing-sheet --project-ref wkffugaijomivqahnxom
```

Expected: `Deployed Functions on project wkffugaijomivqahnxom: export-invoicing-sheet`

- [ ] **Step 3: Manual smoke test from admin UI**

Open the admin dashboard → Invoicing section → paste sheet URL → click Export. Check the Google Sheet for:
- A "Résumé Annuel" tab as first tab
- A "Mai 2026" tab (or current month) with client sections
- Each client section has order blocks with product rows and subtotals

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/export-invoicing-sheet/index.ts
git commit -m "feat(sheets): complete edge function — month tabs + Résumé Annuel + year-level storage"
```

---

### Task 6: Frontend — Export controls redesign

**Files:**
- Modify: `src/components/InvoicingView.tsx`

Context: Replace the current sheet-URL input + "Export to Sheets" / "Test export" buttons with a period picker (month + year selects) and two buttons: "Exporter le mois" and "Mettre à jour le résumé annuel". The function now receives `{ year, month, spreadsheet_id?, action? }`.

- [ ] **Step 1: Replace export state variables in `InvoicingView.tsx`**

Find the block starting with `const [exporting, setExporting] = useState(false);` (around line 72) and replace through `const { toast } = useToast();` with:

```typescript
const [exporting, setExporting] = useState(false);
const [exportingSummary, setExportingSummary] = useState(false);
const [sheetUrl, setSheetUrl] = useState<string | null>(null);
const [sheetIdInput, setSheetIdInput] = useState("");
const [serviceAccountEmail, setServiceAccountEmail] = useState<string | null>(null);
const [lastExportedAt, setLastExportedAt] = useState<string | null>(null);
const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth()); // 0-indexed
const { toast } = useToast();

const FRENCH_MONTHS_UI = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const CURRENT_YEAR = new Date().getFullYear();

const parseSheetId = (input: string): string | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed;
  return null;
};

const callExportFunction = async (action?: "export_summary") => {
  const spreadsheetId = parseSheetId(sheetIdInput) ?? undefined;
  const isSummaryOnly = action === "export_summary";
  if (isSummaryOnly) setExportingSummary(true); else setExporting(true);
  try {
    const { data, error } = await supabase.functions.invoke("export-invoicing-sheet", {
      body: { year: selectedYear, month: selectedMonth, spreadsheet_id: spreadsheetId, action: isSummaryOnly ? "export_summary" : undefined },
    });
    if (error) {
      let detail = error.message;
      let saEmail: string | null = null;
      try {
        const b = await (error as any).context?.json?.();
        if (b?.error) detail = b.error;
        if (b?.service_account_email) saEmail = b.service_account_email;
      } catch { /* ignore */ }
      if (saEmail) setServiceAccountEmail(saEmail);
      throw new Error(detail);
    }
    const result = data as { url: string; orders_exported: number; month: string; service_account_email?: string };
    if (result.service_account_email) setServiceAccountEmail(result.service_account_email);
    setSheetUrl(result.url);
    setLastExportedAt(new Date().toISOString());
    toast({
      title: isSummaryOnly ? "Résumé annuel mis à jour ✅" : "Export terminé ✅",
      description: isSummaryOnly
        ? "Le résumé annuel a été mis à jour dans Google Sheets."
        : `${result.orders_exported} commande${result.orders_exported !== 1 ? "s" : ""} exportée${result.orders_exported !== 1 ? "s" : ""} — ${result.month}.`,
    });
  } catch (err) {
    toast({ title: "Export échoué", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
  } finally {
    setExporting(false);
    setExportingSummary(false);
  }
};
```

- [ ] **Step 2: Remove old handler `handleExportToSheets`**

Delete the entire `const handleExportToSheets = async (testMode = false) => { ... };` function (lines ~89–130). It's replaced by `callExportFunction` above.

- [ ] **Step 3: Replace the Google Sheets banner JSX**

Find the `{/* Google Sheets connect banner — shown until a sheet URL is returned */}` block in the JSX (inside `<section className="space-y-6">`). Replace the entire banner div with:

```tsx
{/* ── Google Sheets Export Panel ─────────────────────────────────────── */}
<div className="rounded-lg border border-border bg-card p-4 space-y-4">
  <div className="flex items-center gap-2 flex-wrap">
    <Sheet className="w-5 h-5 text-green-600 shrink-0" />
    <p className="text-sm font-semibold text-foreground">Export Google Sheet</p>
    {sheetUrl && (
      <Button variant="ghost" size="sm" className="ml-auto gap-1.5 text-green-600 hover:text-green-700 text-xs" asChild>
        <a href={sheetUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="w-3.5 h-3.5" /> Ouvrir le Google Sheet ↗
        </a>
      </Button>
    )}
  </div>

  {/* Period picker */}
  <div className="flex flex-wrap items-center gap-3">
    <p className="text-sm text-muted-foreground shrink-0">Période :</p>
    <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
      <SelectContent>
        {FRENCH_MONTHS_UI.map((m, i) => (
          <SelectItem key={i} value={String(i)}>{m}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
      <SelectContent>
        {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => (
          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>

  {/* Sheet URL input — shown only when no sheet connected yet */}
  {!sheetUrl && (
    <div className="space-y-2">
      <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
        <li>Créez un Google Sheet dans votre Drive</li>
        <li>
          Partagez-le avec{" "}
          {serviceAccountEmail
            ? <code className="bg-muted px-1 py-0.5 rounded text-foreground font-mono select-all text-xs">{serviceAccountEmail}</code>
            : <strong>le compte de service</strong>
          }{" "}en tant qu'<strong>Éditeur</strong>
        </li>
        <li>Collez l'URL ci-dessous et cliquez sur <strong>Exporter le mois</strong></li>
      </ol>
      {!serviceAccountEmail && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Essayez d'exporter une fois pour voir l'email du compte de service.
        </p>
      )}
      <Input
        placeholder="https://docs.google.com/spreadsheets/d/…"
        value={sheetIdInput}
        onChange={(e) => setSheetIdInput(e.target.value)}
        className="text-sm"
      />
      {sheetIdInput && !parseSheetId(sheetIdInput) && <p className="text-xs text-destructive">URL invalide</p>}
      {parseSheetId(sheetIdInput) && <p className="text-xs text-green-600">✓ ID détecté : {parseSheetId(sheetIdInput)}</p>}
    </div>
  )}

  {/* Export buttons */}
  <div className="flex flex-wrap gap-2 items-center">
    <Button size="sm" className="gap-2" disabled={exporting || exportingSummary} onClick={() => void callExportFunction()}>
      {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sheet className="w-4 h-4" />}
      {exporting ? "Export en cours…" : "Exporter le mois"}
    </Button>
    <Button variant="outline" size="sm" className="gap-2" disabled={exporting || exportingSummary} onClick={() => void callExportFunction("export_summary")}>
      {exportingSummary ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
      {exportingSummary ? "Mise à jour…" : "Mettre à jour le résumé annuel"}
    </Button>
    {lastExportedAt && (
      <p className="text-xs text-muted-foreground ml-auto">
        Dernier export : {new Date(lastExportedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
      </p>
    )}
  </div>
</div>
```

- [ ] **Step 4: Remove old export buttons from the toolbar**

In the `{/* Toolbar */}` section, find and delete these three elements:
1. The `<Button ... onClick={() => void handleExportToSheets(false)}>Export to Sheets</Button>`
2. The `<Button ... onClick={() => void handleExportToSheets(true)}>Test export</Button>`
3. The `{sheetUrl && (<Button ... >Open Sheet</Button>)}` link

The bulk-send button (`Send selected (N)`) stays.

- [ ] **Step 5: Build and check for TypeScript errors**

```bash
npm run build 2>&1 | tail -30
```

Expected: Build completes. If you see `Cannot find name 'ExternalLink'` or similar, check that imports at the top of `InvoicingView.tsx` include `ExternalLink` from `lucide-react` (it should already be there).

- [ ] **Step 6: Commit and push**

```bash
git add src/components/InvoicingView.tsx
git commit -m "feat(invoicing): period picker + redesigned export panel — Exporter le mois / Résumé annuel"
git push
```

Expected: Vercel deploys automatically. Verify at the live URL.

---

## Self-Review

**Spec coverage:**

| Spec step | Covered | Task |
|---|---|---|
| 1: One tab per month, named in French | ✅ | Tasks 3, 5 |
| 1: Résumé Annuel as first tab | ✅ | Tasks 3, 4, 5 |
| 1: Update tab if exists, never overwrite other months | ✅ | Task 3 (`clearRange` + `ensureMonthTab`) |
| 2: Client-grouped layout, alphabetical | ✅ | Tasks 1, 2 |
| 2: Client header bold 14pt colored | ✅ | Task 2 |
| 2: Order header bold 11pt gray | ✅ | Task 2 |
| 2: Product rows alternating white/gray | ✅ | Task 2 |
| 2: Facturé Sellsy green/red | ✅ | Task 2 |
| 2: Client total block with borders | ✅ | Task 2 |
| 3: Columns A–K with formulas | ✅ | Task 2 (A–L, Vérifié as L) |
| 3: Column widths A=200px etc. | ✅ | Task 3 |
| 3: Freeze row 1 + col A | ✅ | Task 2 |
| 4: Vérifié checkbox column | ✅ | Task 3 |
| 4: Conditional formatting for checked/invoiced state | ⚠️ | Task 3 (basic CF via color-coded rows; full dynamic CF on checkbox state requires Apps Script or manual setup — Google Sheets REST API conditional formatting on checkbox values works but is complex; the color is pre-applied based on current status) |
| 5: Résumé Annuel revenue matrix | ✅ | Task 4 |
| 5: Orders per month table | ✅ | Task 4 |
| 5: Top clients by CA | ✅ | Task 4 |
| 6: Join companies + contacts | ✅ | Task 1 |
| 6: Group by client, sort by date | ✅ | Task 1 |
| 7: Period picker (month + year) | ✅ | Task 6 |
| 7: Exporter le mois + Résumé annuel buttons | ✅ | Task 6 |
| 7: Last export timestamp | ✅ | Task 6 |
| 7: Open Sheet link | ✅ | Task 6 |
| 8: Auto-update on status change | ❌ | Out of scope — follow-up plan |

**Note on conditional formatting (Step 4):** The "checkbox changes row color" behavior requires a `CUSTOM_FORMULA` conditional formatting rule like `=$L2=TRUE` applied after the fact. The rows are already pre-colored by invoice status (green/red). Dynamic checkbox-triggered color change requires the Google Sheets API `addConditionalFormatRule` with a `CUSTOM_FORMULA` condition referencing column L. This works via the REST API but the formula must reference each specific range. The current plan applies static colors based on `invoicing_status` — add a follow-up enhancement to add CF rules for the Vérifié checkbox if desired.

**Type consistency check:**
- `RawOrder` defined in Task 1 → used in Tasks 1, 2, 4 ✅
- `ClientGroup` defined in Task 1 → used in Tasks 2, 3, 5 ✅
- `MonthlyTabData` defined in Task 2 → used in Task 3 ✅
- `GoogleColor` defined in Task 1 → used throughout ✅
- `fetchOrdersForMonth(db, year, month)` → called in Task 5 with `(db, reqYear, reqMonth)` ✅
- `writeMonthlyTab(token, spreadsheetId, tabName, sheetId, groups)` → called correctly in Task 5 ✅
- `writeResumeAnnuel(token, spreadsheetId, resumeSheetId, year, allOrders)` → called correctly in Task 5 ✅
- `callExportFunction(action?)` in Task 6 → both buttons call it correctly ✅
