// ── PluralRoaster — Google Sheets Packaging Checklist Export ─────────────────
// The admin creates a Google Sheet, shares it with the service account as
// Editor, and pastes the URL on first use. The function creates two tabs:
//   • "Overview"     — summary of all approved/packaging orders
//   • "Packing List" — print-optimized per-order checklist sections

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
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "\n").replace(/\n/g, "").replace(/\s/g, "").trim();

  const keyBytes = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyBytes.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );

  const now = Math.floor(Date.now() / 1000);
  const headerB64 = strToBase64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payloadB64 = strToBase64url(JSON.stringify({
    iss: serviceEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now,
  }));
  const sigInput = `${headerB64}.${payloadB64}`;
  const sigBuf = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(sigInput));

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${sigInput}.${base64url(sigBuf)}` }),
  });
  if (!resp.ok) throw new Error(`Google auth failed: ${await resp.text()}`);
  const { access_token } = (await resp.json()) as { access_token: string };
  return access_token;
}

// ── Sheets REST helpers ───────────────────────────────────────────────────────

async function sheetsApi(token: string, method: string, path: string, body?: unknown): Promise<unknown> {
  const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Sheets ${method} ${path} → ${resp.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

type SheetMeta = { properties: { title: string; sheetId: number; index: number } };

async function getSheetsMeta(token: string, id: string): Promise<SheetMeta[]> {
  const data = (await sheetsApi(token, "GET", `/${id}?fields=sheets.properties`)) as { sheets: SheetMeta[] };
  return data.sheets ?? [];
}

/** Ensure "Overview" (index 0) and "Packing List" (index 1) tabs exist. */
async function ensureTabs(token: string, id: string, sheets: SheetMeta[]): Promise<void> {
  const requests: unknown[] = [];
  const hasOverview = sheets.some((s) => s.properties.title === "Overview");
  const hasPacking = sheets.some((s) => s.properties.title === "Packing List");

  if (!hasOverview) {
    const first = sheets[0];
    if (first) {
      requests.push({
        updateSheetProperties: {
          properties: { sheetId: first.properties.sheetId, title: "Overview" },
          fields: "title",
        },
      });
    } else {
      requests.push({ addSheet: { properties: { title: "Overview", index: 0 } } });
    }
  }

  if (!hasPacking) {
    const second = sheets.find((s) => {
      const title = s.properties.title;
      return title !== "Overview" && s.properties.index === 1;
    });
    if (second && second.properties.title !== "Packing List") {
      requests.push({
        updateSheetProperties: {
          properties: { sheetId: second.properties.sheetId, title: "Packing List" },
          fields: "title",
        },
      });
    } else if (!second) {
      requests.push({ addSheet: { properties: { title: "Packing List", index: 1 } } });
    }
  }

  if (requests.length > 0) {
    await sheetsApi(token, "POST", `/${id}:batchUpdate`, { requests });
  }
}

async function clearRange(token: string, id: string, range: string): Promise<void> {
  await sheetsApi(token, "POST", `/${id}/values/${encodeURIComponent(range)}:clear`);
}
async function writeValues(token: string, id: string, range: string, values: unknown[][]): Promise<void> {
  await sheetsApi(token, "PUT", `/${id}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, { range, majorDimension: "ROWS", values });
}
async function batchFormat(token: string, id: string, requests: unknown[]): Promise<void> {
  await sheetsApi(token, "POST", `/${id}:batchUpdate`, { requests });
}

// ── Color palette ─────────────────────────────────────────────────────────────
const COLOR = {
  darkBrown:   { red: 0.22, green: 0.14, blue: 0.09 },
  midBrown:    { red: 0.45, green: 0.28, blue: 0.15 },
  lightCream:  { red: 0.98, green: 0.96, blue: 0.91 },
  tableHeader: { red: 0.24, green: 0.24, blue: 0.24 },
  rowAlt:      { red: 0.96, green: 0.96, blue: 0.96 },
  white:       { red: 1,    green: 1,    blue: 1    },
  signatureBg: { red: 0.94, green: 0.94, blue: 0.94 },
  notesBg:     { red: 0.99, green: 0.99, blue: 0.95 },
};

// ── Border helpers ────────────────────────────────────────────────────────────
const THICK = { style: "SOLID_THICK", color: COLOR.darkBrown };
const THIN  = { style: "SOLID",       color: { red: 0.7, green: 0.7, blue: 0.7 } };
const MEDIUM = { style: "SOLID_MEDIUM", color: COLOR.midBrown };

function outerBorder(sheetId: number, r0: number, r1: number, c0: number, c1: number) {
  return {
    updateBorders: {
      range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 },
      top: THICK, bottom: THICK, left: THICK, right: THICK,
    },
  };
}

function innerHorizontalBorder(sheetId: number, rowIndex: number, c0: number, c1: number) {
  return {
    updateBorders: {
      range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: c0, endColumnIndex: c1 },
      bottom: MEDIUM,
    },
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderItem = {
  product_name: string;
  product_sku: string | null;
  quantity: number;
  size_label: string | null;
};

type RawOrder = {
  id: string;
  user_id: string;
  delivery_date: string;
  status: string;
  total_kg: number;
  notes: string | null;
  is_roasted: boolean;
  is_packed: boolean;
  is_labeled: boolean;
  order_items: OrderItem[];
};

type Profile = { id: string; full_name: string | null; email: string | null };

type Onboarding = {
  user_id: string;
  company_name: string | null;
  custom_company_name: string | null;
  delivery_address: string | null;
  custom_delivery_address: string | null;
};

// ── Main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const serviceEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    const privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY");
    if (!serviceEmail || !privateKey) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY"))!;

    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized — no auth header");

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const db = createClient(supabaseUrl, serviceRoleKey);
    const { data: currentRole, error: roleErr } = await userClient.rpc("ensure_current_user_role");
    if (roleErr) throw new Error(`Role check failed: ${roleErr.message}`);
    if (currentRole !== "admin") throw new Error(`Admin only (your role: ${currentRole})`);

    // ── Request body ──────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const bodySpreadsheetId = typeof body.spreadsheet_id === "string" ? body.spreadsheet_id.trim() : null;

    // ── Fetch orders ──────────────────────────────────────────────────────────
    const { data: ordersRaw, error: ordersErr } = await db
      .from("orders")
      .select(`
        id, user_id, delivery_date, status, total_kg, notes,
        is_roasted, is_packed, is_labeled,
        order_items ( product_name, product_sku, quantity, size_label )
      `)
      .in("status", ["approved", "packaging"])
      .order("delivery_date")
      .order("created_at");
    if (ordersErr) throw ordersErr;
    const orders = (ordersRaw ?? []) as RawOrder[];

    // ── Fetch client profiles & onboarding ───────────────────────────────────
    const userIds = [...new Set(orders.map((o) => o.user_id))];

    const [profilesRes, onboardingRes] = await Promise.all([
      userIds.length > 0
        ? db.from("profiles").select("id, full_name, email").in("id", userIds)
        : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? db.from("client_onboarding")
            .select("user_id, company_name, custom_company_name, delivery_address, custom_delivery_address")
            .in("user_id", userIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap = new Map<string, Profile>(
      ((profilesRes.data ?? []) as Profile[]).map((p) => [p.id, p])
    );
    const onboardingMap = new Map<string, Onboarding>(
      ((onboardingRes.data ?? []) as Onboarding[]).map((o) => [o.user_id, o])
    );

    const getClientName = (userId: string): string => {
      const ob = onboardingMap.get(userId);
      if (ob?.custom_company_name) return ob.custom_company_name;
      if (ob?.company_name) return ob.company_name;
      const p = profileMap.get(userId);
      return p?.full_name ?? p?.email ?? userId.slice(0, 8);
    };

    const getDeliveryAddress = (userId: string): string => {
      const ob = onboardingMap.get(userId);
      if (ob?.custom_delivery_address) return ob.custom_delivery_address;
      if (ob?.delivery_address) return ob.delivery_address;
      return "—";
    };

    // ── Google auth ───────────────────────────────────────────────────────────
    const token = await getGoogleAccessToken(serviceEmail, privateKey);

    // ── Resolve spreadsheet ───────────────────────────────────────────────────
    const SHEET_KEY = "packaging-current";

    const { data: existingExport } = await db
      .from("sheet_exports")
      .select("spreadsheet_id, spreadsheet_url")
      .eq("month_key", SHEET_KEY)
      .maybeSingle();

    let spreadsheetId: string;
    let spreadsheetUrl: string;
    const isExisting = Boolean(existingExport);

    if (existingExport) {
      spreadsheetId = existingExport.spreadsheet_id;
      spreadsheetUrl = existingExport.spreadsheet_url;
    } else if (bodySpreadsheetId) {
      spreadsheetId = bodySpreadsheetId;
      spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
      await db.from("sheet_exports").insert({
        month_key: SHEET_KEY,
        spreadsheet_id: spreadsheetId,
        spreadsheet_url: spreadsheetUrl,
        orders_count: orders.length,
      });
    } else {
      throw new Error(
        `No packaging Google Sheet connected. Create a Google Sheet, share it with the service account (${serviceEmail}) as Editor, then paste the URL in the "Connect Packaging Sheet" field.`
      );
    }

    // ── Ensure tabs ───────────────────────────────────────────────────────────
    let sheets = await getSheetsMeta(token, spreadsheetId);
    await ensureTabs(token, spreadsheetId, sheets);
    sheets = await getSheetsMeta(token, spreadsheetId);

    const overviewSheetId = sheets.find((s) => s.properties.title === "Overview")?.properties.sheetId ?? 0;
    const packingSheetId = sheets.find((s) => s.properties.title === "Packing List")?.properties.sheetId ?? 1;

    if (isExisting) {
      await clearRange(token, spreadsheetId, "Overview!A1:ZZ10000");
      await clearRange(token, spreadsheetId, "Packing List!A1:ZZ10000");
    }

    // ── Build Overview tab ────────────────────────────────────────────────────
    const exportedAt = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

    const overviewRows: unknown[][] = [
      [`PACKAGING OVERVIEW — Exported ${exportedAt}`, "", "", "", "", ""],
      [""],
      ["Client", "Order #", "Delivery Date", "# Products", "Total (kg)", "Status"],
    ];

    let totalKgAll = 0;
    let totalOrdersAll = 0;
    for (const order of orders) {
      const clientName = getClientName(order.user_id);
      const itemCount = order.order_items?.length ?? 0;
      overviewRows.push([
        clientName,
        order.id.slice(0, 8).toUpperCase(),
        new Date(order.delivery_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }),
        itemCount,
        Number(order.total_kg).toFixed(2) + " kg",
        order.status === "approved" ? "✓ Approved" : "📦 Packaging",
      ]);
      totalKgAll += Number(order.total_kg);
      totalOrdersAll++;
    }

    overviewRows.push([
      `TOTAL: ${totalOrdersAll} order${totalOrdersAll !== 1 ? "s" : ""}`,
      "",
      "",
      "",
      totalKgAll.toFixed(2) + " kg",
      "",
    ]);

    await writeValues(token, spreadsheetId, "Overview!A1", overviewRows);

    // ── Build Packing List tab ────────────────────────────────────────────────
    // Column layout: A=☐  B=Product  C=SKU  D=Qty  E=Unit  F=✓ Done
    // 6 columns total (indices 0–5)
    const NUM_COLS = 6;

    // We'll collect all cell values and track row positions for formatting
    const packingRows: unknown[][] = [];
    // Each entry: { startRow, endRow (exclusive), orderId }
    const orderSections: { startRow: number; endRow: number; itemCount: number; orderId: string }[] = [];

    for (const order of orders) {
      const clientName = getClientName(order.user_id);
      const deliveryAddr = getDeliveryAddress(order.user_id);
      const deliveryDate = new Date(order.delivery_date).toLocaleDateString("fr-FR", {
        weekday: "long", day: "2-digit", month: "long", year: "numeric",
      });
      const statusLabel = order.status === "approved" ? "Approved" : "Packaging";
      const items = order.order_items ?? [];

      const sectionStart = packingRows.length;

      // Row 0: Order header (merged across all cols)
      packingRows.push([
        `ORDER  ${order.id.slice(0, 8).toUpperCase()}`,
        "", "", "", "", "",
      ]);

      // Row 1: Client + delivery date
      packingRows.push([
        `Client: ${clientName}`,
        "", "", "",
        `Delivery: ${deliveryDate}`,
        "",
      ]);

      // Row 2: Delivery address + status
      packingRows.push([
        `Address: ${deliveryAddr}`,
        "", "", "",
        `Status: ${statusLabel}`,
        "",
      ]);

      // Row 3: Checklist table header
      packingRows.push(["☐", "Product / Description", "SKU", "Qty (kg)", "Unit", "✓ Done"]);

      // Rows 4+: Items
      const itemStartRow = packingRows.length;
      for (const item of items) {
        const qty = Number(item.quantity);
        // Determine unit display
        let unit = "kg";
        if (item.size_label) {
          unit = item.size_label;
        }
        packingRows.push([
          "☐",
          item.product_name,
          item.product_sku ?? "—",
          qty.toFixed(qty % 1 === 0 ? 0 : 2),
          unit,
          "",
        ]);
      }

      if (items.length === 0) {
        packingRows.push(["☐", "(no items)", "—", "—", "—", ""]);
      }

      // Notes row
      const notesText = order.notes ? `Notes: ${order.notes}` : "Notes / Remarques:";
      packingRows.push([notesText, "", "", "", "", ""]);

      // Signature row
      packingRows.push(["Packed by: _____________________________", "", "", "Checked by: _____________________________", "", ""]);

      // Separator (empty row)
      packingRows.push(["", "", "", "", "", ""]);

      const sectionEnd = packingRows.length;
      orderSections.push({
        startRow: sectionStart,
        endRow: sectionEnd,
        itemCount: items.length || 1,
        orderId: order.id,
      });
    }

    if (packingRows.length === 0) {
      packingRows.push(["No orders with status 'approved' or 'packaging' found.", "", "", "", "", ""]);
    }

    await writeValues(token, spreadsheetId, "Packing List!A1", packingRows);

    // ── Formatting ────────────────────────────────────────────────────────────
    const formatRequests: unknown[] = [];

    // ── Overview formatting ───────────────────────────────────────────────────
    // Title row (row 0): merge + dark background + large bold white text
    formatRequests.push({
      mergeCells: {
        range: { sheetId: overviewSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: NUM_COLS },
        mergeType: "MERGE_ALL",
      },
    });
    formatRequests.push({
      repeatCell: {
        range: { sheetId: overviewSheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: COLOR.darkBrown,
            textFormat: { bold: true, fontSize: 13, foregroundColor: COLOR.white },
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE",
            padding: { top: 10, bottom: 10 },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)",
      },
    });
    // Column header row (row 2): dark bg
    formatRequests.push({
      repeatCell: {
        range: { sheetId: overviewSheetId, startRowIndex: 2, endRowIndex: 3 },
        cell: {
          userEnteredFormat: {
            backgroundColor: COLOR.tableHeader,
            textFormat: { bold: true, foregroundColor: COLOR.white },
            verticalAlignment: "MIDDLE",
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)",
      },
    });
    // Freeze header rows
    formatRequests.push({
      updateSheetProperties: {
        properties: { sheetId: overviewSheetId, gridProperties: { frozenRowCount: 3 } },
        fields: "gridProperties.frozenRowCount",
      },
    });
    // Total row (last row): bold with background
    const overviewTotalRow = overviewRows.length - 1;
    formatRequests.push({
      repeatCell: {
        range: { sheetId: overviewSheetId, startRowIndex: overviewTotalRow, endRowIndex: overviewTotalRow + 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: COLOR.lightCream,
            textFormat: { bold: true },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    });
    // Alternate row colors for overview data rows
    for (let i = 3; i < overviewRows.length - 1; i++) {
      if ((i - 3) % 2 === 1) {
        formatRequests.push({
          repeatCell: {
            range: { sheetId: overviewSheetId, startRowIndex: i, endRowIndex: i + 1 },
            cell: { userEnteredFormat: { backgroundColor: COLOR.rowAlt } },
            fields: "userEnteredFormat(backgroundColor)",
          },
        });
      }
    }
    // Auto-resize overview columns
    formatRequests.push({
      autoResizeDimensions: {
        dimensions: { sheetId: overviewSheetId, dimension: "COLUMNS", startIndex: 0, endIndex: NUM_COLS },
      },
    });

    // ── Packing List formatting ───────────────────────────────────────────────
    // Set column widths for packing list
    const packingColWidths = [40, 280, 120, 80, 80, 120]; // px for each col A-F
    for (let i = 0; i < packingColWidths.length; i++) {
      formatRequests.push({
        updateDimensionProperties: {
          range: { sheetId: packingSheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
          properties: { pixelSize: packingColWidths[i] },
          fields: "pixelSize",
        },
      });
    }

    for (const section of orderSections) {
      const { startRow, endRow, itemCount } = section;
      // Row indices within the section:
      const headerRow0 = startRow;       // ORDER #xxx
      const headerRow1 = startRow + 1;   // Client + delivery date
      const headerRow2 = startRow + 2;   // Address + status
      const tableHeaderRow = startRow + 3;
      const itemsStart = startRow + 4;
      const itemsEnd = itemsStart + itemCount;
      const notesRow = itemsEnd;
      const signatureRow = itemsEnd + 1;
      // endRow - 1 = separator row

      // ── Order title row (merged) ──
      formatRequests.push({
        mergeCells: {
          range: { sheetId: packingSheetId, startRowIndex: headerRow0, endRowIndex: headerRow0 + 1, startColumnIndex: 0, endColumnIndex: NUM_COLS },
          mergeType: "MERGE_ALL",
        },
      });
      formatRequests.push({
        repeatCell: {
          range: { sheetId: packingSheetId, startRowIndex: headerRow0, endRowIndex: headerRow0 + 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: COLOR.darkBrown,
              textFormat: { bold: true, fontSize: 14, foregroundColor: COLOR.white },
              horizontalAlignment: "LEFT",
              verticalAlignment: "MIDDLE",
              padding: { left: 12, top: 8, bottom: 8 },
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)",
        },
      });
      formatRequests.push({
        updateDimensionProperties: {
          range: { sheetId: packingSheetId, dimension: "ROWS", startIndex: headerRow0, endIndex: headerRow0 + 1 },
          properties: { pixelSize: 40 },
          fields: "pixelSize",
        },
      });

      // ── Client row (A:D merged, E:F merged) ──
      formatRequests.push({
        mergeCells: {
          range: { sheetId: packingSheetId, startRowIndex: headerRow1, endRowIndex: headerRow1 + 1, startColumnIndex: 0, endColumnIndex: 4 },
          mergeType: "MERGE_ALL",
        },
      });
      formatRequests.push({
        mergeCells: {
          range: { sheetId: packingSheetId, startRowIndex: headerRow1, endRowIndex: headerRow1 + 1, startColumnIndex: 4, endColumnIndex: NUM_COLS },
          mergeType: "MERGE_ALL",
        },
      });
      formatRequests.push({
        repeatCell: {
          range: { sheetId: packingSheetId, startRowIndex: headerRow1, endRowIndex: headerRow1 + 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: COLOR.lightCream,
              textFormat: { bold: true, fontSize: 11 },
              verticalAlignment: "MIDDLE",
              padding: { left: 10, top: 6, bottom: 6 },
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)",
        },
      });

      // ── Address row (A:D merged, E:F merged) ──
      formatRequests.push({
        mergeCells: {
          range: { sheetId: packingSheetId, startRowIndex: headerRow2, endRowIndex: headerRow2 + 1, startColumnIndex: 0, endColumnIndex: 4 },
          mergeType: "MERGE_ALL",
        },
      });
      formatRequests.push({
        mergeCells: {
          range: { sheetId: packingSheetId, startRowIndex: headerRow2, endRowIndex: headerRow2 + 1, startColumnIndex: 4, endColumnIndex: NUM_COLS },
          mergeType: "MERGE_ALL",
        },
      });
      formatRequests.push({
        repeatCell: {
          range: { sheetId: packingSheetId, startRowIndex: headerRow2, endRowIndex: headerRow2 + 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: COLOR.lightCream,
              textFormat: { fontSize: 10, italic: true },
              verticalAlignment: "MIDDLE",
              padding: { left: 10, top: 4, bottom: 4 },
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)",
        },
      });

      // ── Table header row ──
      formatRequests.push({
        repeatCell: {
          range: { sheetId: packingSheetId, startRowIndex: tableHeaderRow, endRowIndex: tableHeaderRow + 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: COLOR.tableHeader,
              textFormat: { bold: true, fontSize: 10, foregroundColor: COLOR.white },
              horizontalAlignment: "CENTER",
              verticalAlignment: "MIDDLE",
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
        },
      });

      // ── Item rows ──
      // Alternate row colors + checkbox column centered
      for (let r = itemsStart; r < itemsEnd; r++) {
        const isAlt = (r - itemsStart) % 2 === 1;
        formatRequests.push({
          repeatCell: {
            range: { sheetId: packingSheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: NUM_COLS },
            cell: {
              userEnteredFormat: {
                backgroundColor: isAlt ? COLOR.rowAlt : COLOR.white,
                textFormat: { fontSize: 11 },
                verticalAlignment: "MIDDLE",
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)",
          },
        });
        // Center checkbox col and "Done" col
        formatRequests.push({
          repeatCell: {
            range: { sheetId: packingSheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: 1 },
            cell: { userEnteredFormat: { horizontalAlignment: "CENTER", textFormat: { fontSize: 14 } } },
            fields: "userEnteredFormat(horizontalAlignment,textFormat)",
          },
        });
        formatRequests.push({
          repeatCell: {
            range: { sheetId: packingSheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 5, endColumnIndex: 6 },
            cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } },
            fields: "userEnteredFormat(horizontalAlignment)",
          },
        });
        // Set row height
        formatRequests.push({
          updateDimensionProperties: {
            range: { sheetId: packingSheetId, dimension: "ROWS", startIndex: r, endIndex: r + 1 },
            properties: { pixelSize: 32 },
            fields: "pixelSize",
          },
        });
        // Thin inner border below each item row (except last)
        if (r < itemsEnd - 1) {
          formatRequests.push(innerHorizontalBorder(packingSheetId, r, 0, NUM_COLS));
        }
      }

      // ── Notes row (merged) ──
      formatRequests.push({
        mergeCells: {
          range: { sheetId: packingSheetId, startRowIndex: notesRow, endRowIndex: notesRow + 1, startColumnIndex: 0, endColumnIndex: NUM_COLS },
          mergeType: "MERGE_ALL",
        },
      });
      formatRequests.push({
        repeatCell: {
          range: { sheetId: packingSheetId, startRowIndex: notesRow, endRowIndex: notesRow + 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: COLOR.notesBg,
              textFormat: { italic: true, fontSize: 10 },
              verticalAlignment: "MIDDLE",
              padding: { left: 10, top: 6, bottom: 6 },
              wrapStrategy: "WRAP",
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding,wrapStrategy)",
        },
      });
      formatRequests.push({
        updateDimensionProperties: {
          range: { sheetId: packingSheetId, dimension: "ROWS", startIndex: notesRow, endIndex: notesRow + 1 },
          properties: { pixelSize: 36 },
          fields: "pixelSize",
        },
      });

      // ── Signature row (A:C merged, D:F merged) ──
      formatRequests.push({
        mergeCells: {
          range: { sheetId: packingSheetId, startRowIndex: signatureRow, endRowIndex: signatureRow + 1, startColumnIndex: 0, endColumnIndex: 3 },
          mergeType: "MERGE_ALL",
        },
      });
      formatRequests.push({
        mergeCells: {
          range: { sheetId: packingSheetId, startRowIndex: signatureRow, endRowIndex: signatureRow + 1, startColumnIndex: 3, endColumnIndex: NUM_COLS },
          mergeType: "MERGE_ALL",
        },
      });
      formatRequests.push({
        repeatCell: {
          range: { sheetId: packingSheetId, startRowIndex: signatureRow, endRowIndex: signatureRow + 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: COLOR.signatureBg,
              textFormat: { fontSize: 10, italic: true },
              verticalAlignment: "MIDDLE",
              padding: { left: 10, top: 8, bottom: 8 },
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)",
        },
      });
      formatRequests.push({
        updateDimensionProperties: {
          range: { sheetId: packingSheetId, dimension: "ROWS", startIndex: signatureRow, endIndex: signatureRow + 1 },
          properties: { pixelSize: 40 },
          fields: "pixelSize",
        },
      });

      // ── Separator row height ──
      const separatorRow = endRow - 1;
      formatRequests.push({
        updateDimensionProperties: {
          range: { sheetId: packingSheetId, dimension: "ROWS", startIndex: separatorRow, endIndex: separatorRow + 1 },
          properties: { pixelSize: 20 },
          fields: "pixelSize",
        },
      });

      // ── Thick outer border around entire section (excluding separator) ──
      formatRequests.push(outerBorder(packingSheetId, startRow, signatureRow + 1, 0, NUM_COLS));

      // ── Medium border below table header ──
      formatRequests.push({
        updateBorders: {
          range: {
            sheetId: packingSheetId,
            startRowIndex: tableHeaderRow,
            endRowIndex: tableHeaderRow + 1,
            startColumnIndex: 0,
            endColumnIndex: NUM_COLS,
          },
          bottom: MEDIUM,
          top: THIN,
        },
      });

      // ── Thin vertical lines on the table (header + items) ──
      for (let col = 1; col < NUM_COLS; col++) {
        formatRequests.push({
          updateBorders: {
            range: {
              sheetId: packingSheetId,
              startRowIndex: tableHeaderRow,
              endRowIndex: itemsEnd,
              startColumnIndex: col,
              endColumnIndex: col + 1,
            },
            left: THIN,
          },
        });
      }

      // ── Border between sections (thick bottom of signature row) ──
      formatRequests.push({
        updateBorders: {
          range: {
            sheetId: packingSheetId,
            startRowIndex: signatureRow,
            endRowIndex: signatureRow + 1,
            startColumnIndex: 0,
            endColumnIndex: NUM_COLS,
          },
          bottom: THICK,
        },
      });
    }

    // Apply all formatting in batches (Sheets API has a limit per request)
    const BATCH_SIZE = 40;
    for (let i = 0; i < formatRequests.length; i += BATCH_SIZE) {
      await batchFormat(token, spreadsheetId, formatRequests.slice(i, i + BATCH_SIZE));
    }

    // ── Update DB ─────────────────────────────────────────────────────────────
    const now = new Date();
    await db.from("sheet_exports")
      .update({ last_exported_at: now.toISOString(), orders_count: orders.length })
      .eq("month_key", SHEET_KEY);

    return new Response(
      JSON.stringify({ url: spreadsheetUrl, orders_exported: orders.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[export-packaging-sheet]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
