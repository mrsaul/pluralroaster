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

// ── Monthly tab layout builder ────────────────────────────────────────────────
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

// ── Tab management ────────────────────────────────────────────────────────────
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

// ── Résumé Annuel tab writer ──────────────────────────────────────────────────
async function writeResumeAnnuel(
  token: string,
  spreadsheetId: string,
  resumeSheetId: number,
  year: number,
  allOrders: YearSummaryOrder[],
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
    const name = o.companies?.name ?? key.slice(0, 8);
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

const serviceEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(JSON.stringify({ error: "Not yet implemented — see plan tasks 2-5" }), {
    status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
