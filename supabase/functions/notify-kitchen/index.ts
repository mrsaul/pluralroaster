// ── PluralRoaster — Kitchen notifications ────────────────────────────────────
// Called by the app after a Kitchen order action (user JWT) and by pg_cron
// (cutoff_reminder, header x-kitchen-cron-secret).
// Web push first; email (Resend) only for recipients with no push subscription.
// Best effort: per-recipient failures are logged and never fail the call.
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
//          RESEND_API_KEY, FROM_EMAIL, KITCHEN_CRON_SECRET (optional: the
//          cron secret is also checked against Vault kitchen_cron_secret)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-kitchen-cron-secret",
};

type KitchenEvent =
  | "order_sent" | "order_approved" | "urgent_created" | "urgent_approved"
  | "urgent_declined" | "ready_eta" | "order_ready" | "cutoff_reminder";

type Change = { product_name: string; from: number; to: number };
type Message = { title: string; body: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));

// Keep in sync with the French day/month tables in src/kitchen/lib/rounds.ts.
const WEEKDAYS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

// "2026-11-03" -> "mardi 3 nov." (calendar date, no year, no time zone shift).
const fmtProductionDay = (productionDate: string) => {
  const [y, m, d] = productionDate.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS_FR[dow]} ${d} ${MONTHS_FR[m - 1]}`;
};

// cutoff instant -> "lundi 20:00" (Paris time).
const fmtCutoff = (iso: string) => {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("weekday")} ${g("hour")}:${g("minute")}`;
};

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

let vapidReady = false;
function initVapid(): boolean {
  if (vapidReady) return true;
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return false;
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@pluralroaster.com", pub, priv);
  vapidReady = true;
  return true;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let k = 0; k < x.length; k++) diff |= x[k] ^ y[k];
  return diff === 0;
}

type Caller = { userId: string; role: "admin" | "coffee_manager" | "stores_manager" | "kitchen_manager"; cafeId: string | null };

// Cron calls carry x-kitchen-cron-secret. Accept it if it matches the
// KITCHEN_CRON_SECRET function secret, or else the Vault copy (kitchen_cron_secret).
async function cronAuthorized(req: Request): Promise<boolean> {
  const got = req.headers.get("x-kitchen-cron-secret");
  if (!got) return false;
  const expected = Deno.env.get("KITCHEN_CRON_SECRET");
  if (expected && safeEqual(got, expected)) return true;
  const { data, error } = await db.rpc("kitchen_cron_secret_ok", { p_secret: got });
  if (error) console.error("kitchen_cron_secret_ok failed", error.message);
  return !error && data === true;
}

async function getCaller(req: Request): Promise<Caller | null> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data?.user) return null;
  const uid = data.user.id;
  const { data: admin } = await db.from("user_roles").select("user_id")
    .eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (admin) return { userId: uid, role: "admin", cafeId: null };
  const { data: member } = await db.from("kitchen_members").select("role, cafe_id").eq("user_id", uid).maybeSingle();
  if (member) return { userId: uid, role: member.role, cafeId: member.cafe_id };
  return null;
}

type OrderInfo = {
  cafe_id: string; kind: string; status: string; ready_eta: string | null;
};

// Per-event rules: who may trigger it, and which order state it requires.
function authorizeEvent(
  event: KitchenEvent,
  caller: Caller,
  order: OrderInfo,
): "ok" | "forbidden" | "wrong_status" {
  const isAdmin = caller.role === "admin";
  const ownCafe = caller.role === "coffee_manager" && caller.cafeId === order.cafe_id;
  let roleOk: boolean;
  let stateOk: boolean;
  switch (event) {
    case "order_sent":
      roleOk = isAdmin || ownCafe || caller.role === "stores_manager";
      stateOk = order.status === "sent";
      break;
    case "urgent_created":
      roleOk = isAdmin || ownCafe || caller.role === "stores_manager";
      stateOk = order.status === "sent" && order.kind === "urgent";
      break;
    case "order_approved":
      roleOk = isAdmin || caller.role === "stores_manager";
      stateOk = order.status === "approved";
      break;
    case "urgent_declined":
      roleOk = isAdmin || caller.role === "stores_manager";
      stateOk = order.status === "declined";
      break;
    case "ready_eta":
      roleOk = isAdmin || caller.role === "kitchen_manager";
      stateOk = order.status === "approved" && order.kind === "urgent" && order.ready_eta !== null;
      break;
    case "order_ready":
      roleOk = isAdmin || caller.role === "kitchen_manager";
      stateOk = order.status === "ready";
      break;
    default: // urgent_approved is internal only; cutoff_reminder is cron only
      return "forbidden";
  }
  if (!roleOk) return "forbidden";
  return stateOk ? "ok" : "wrong_status";
}

// ── Recipients ───────────────────────────────────────────────────────────────

async function memberIds(role: string, cafeId?: string): Promise<string[]> {
  let q = db.from("kitchen_members").select("user_id").eq("role", role);
  if (cafeId) q = q.eq("cafe_id", cafeId);
  const { data, error } = await q;
  if (error) { console.warn("[notify-kitchen] members lookup failed", error.message); return []; }
  return (data ?? []).map((r: { user_id: string }) => r.user_id);
}

// ── Delivery ─────────────────────────────────────────────────────────────────

async function sendEmail(to: string, msg: Message): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("FROM_EMAIL");
  if (!apiKey || !from) { console.warn("[notify-kitchen] email not configured"); return; }
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to, subject: msg.title,
      html: `<p style="font-family:sans-serif;font-size:14px">${esc(msg.body).replace(/\n/g, "<br>")}</p>`,
    }),
  });
  if (!resp.ok) throw new Error(`Resend ${resp.status}: ${await resp.text()}`);
}

// Returns number of recipients reached (push or email).
async function deliverTo(userIds: string[], msg: Message): Promise<number> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return 0;
  const pushOk = initVapid();
  const { data: subs } = await db.from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth").in("user_id", ids);
  const byUser = new Map<string, NonNullable<typeof subs>>();
  for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: "/" });
  let reached = 0;

  await Promise.allSettled(ids.map(async (uid) => {
    try {
      const userSubs = byUser.get(uid) ?? [];
      let pushed = false;
      if (pushOk) {
        await Promise.allSettled(userSubs.map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
            pushed = true;
          } catch (err: any) {
            console.warn("[notify-kitchen] push failed:", sub.endpoint.slice(0, 40), err?.statusCode);
            if (err?.statusCode === 404 || err?.statusCode === 410) {
              await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
            }
          }
        }));
      }
      if (pushed) { reached++; return; }
      // No push delivered (no subscription, or all failed/expired): fall back to email.
      const { data } = await db.auth.admin.getUserById(uid);
      const email = data?.user?.email;
      if (!email) return;
      await sendEmail(email, msg);
      reached++;
    } catch (err) {
      console.warn("[notify-kitchen] recipient failed", uid.slice(0, 8), err instanceof Error ? err.message : err);
    }
  }));
  return reached;
}

// ── Events ───────────────────────────────────────────────────────────────────

function changesText(changes: Change[]): string {
  if (!changes.length) return "Aucune modification.";
  return "Modifications :\n" + changes.map((c) => `${c.product_name} : ${c.from} → ${c.to}`).join("\n");
}

async function serverChanges(orderId: string): Promise<Change[]> {
  const { data } = await db.from("kitchen_order_items")
    .select("product_name, units, adjusted_units").eq("order_id", orderId).order("product_name");
  return (data ?? [])
    .filter((r: any) => r.adjusted_units !== null && r.adjusted_units !== r.units)
    .map((r: any) => ({ product_name: r.product_name, from: r.units, to: r.adjusted_units }));
}

// The caller never needs to hear about their own action (e.g. a stores manager who sends
// an order on a café's behalf does not get the "order sent" notification).
async function sendOrderEvent(event: KitchenEvent, order: any, callerId: string): Promise<number> {
  const cafe = order.kitchen_cafes?.name ?? "Café";
  const round = order.production_date ? fmtProductionDay(order.production_date) : null;
  const urgent = order.kind === "urgent";
  const deliver = (ids: string[], msg: Message) => deliverTo(ids.filter((id) => id !== callerId), msg);

  switch (event) {
    case "order_sent":
      return deliver(await memberIds("stores_manager"), {
        title: "Nouvelle commande Cuisine",
        body: round ? `${cafe} a envoyé sa commande pour ${round}.` : `${cafe} a envoyé sa commande.`,
      });
    case "urgent_created":
      return deliver(await memberIds("stores_manager"), {
        title: "Commande urgente",
        body: `${cafe} : ${order.urgent_reason ?? "commande urgente"}` +
          (order.needed_by ? `\nPour le ${fmtDateTime(order.needed_by)}` : ""),
      });
    case "order_approved": {
      const changes = await serverChanges(order.id);
      const msg = {
        title: urgent ? "Commande urgente approuvée" : "Commande approuvée",
        body: `${cafe} : la commande est approuvée.\n${changesText(changes)}`,
      };
      const cafeRecipients = await memberIds("coffee_manager", order.cafe_id);
      const kitchen = urgent ? await memberIds("kitchen_manager") : [];
      return deliver([...cafeRecipients, ...kitchen], msg);
    }
    case "urgent_declined":
      return deliver(await memberIds("coffee_manager", order.cafe_id), {
        title: "Commande urgente refusée",
        body: `Votre commande urgente a été refusée.` + (order.decline_note ? `\n${order.decline_note}` : ""),
      });
    case "ready_eta":
      return deliver(await memberIds("coffee_manager", order.cafe_id), {
        title: "Heure de préparation estimée",
        body: order.ready_eta
          ? `Votre commande sera prête le ${fmtDateTime(order.ready_eta)}.`
          : "L'heure de préparation a été mise à jour.",
      });
    case "order_ready":
      return deliver(await memberIds("coffee_manager", order.cafe_id), {
        title: "Commande prête",
        body: "Votre commande Cuisine est prête.",
      });
    default:
      return 0;
  }
}

// Reminds cafés that have not ordered for a round whose reminder window is open.
// kitchen_next_open_rounds is SECURITY DEFINER and only rejects a non-null auth.uid() that is not a
// kitchen member; the service-role client has no uid, so the call is allowed here.
async function handleCutoffReminder(): Promise<{ cafes: number; notified: number } | null> {
  const [{ data: settings, error: settingsError }, { data: rounds, error: roundsError }] = await Promise.all([
    db.from("kitchen_settings").select("reminder_hours_before").eq("id", 1).single(),
    db.rpc("kitchen_next_open_rounds", { p_count: 4 }),
  ]);
  if (settingsError || roundsError) {
    console.error("[notify-kitchen] cutoff reminder read failed", settingsError?.message ?? roundsError?.message);
    return null;
  }
  if (!settings || !rounds?.length) return { cafes: 0, notified: 0 };

  const now = Date.now();
  const due = (rounds as { production_date: string; cutoff_at: string }[]).filter((r) => {
    const cutoff = new Date(r.cutoff_at).getTime();
    return cutoff - settings.reminder_hours_before * 3_600_000 <= now && now < cutoff;
  });
  if (!due.length) return { cafes: 0, notified: 0 };

  const { data: cafes } = await db.from("kitchen_cafes").select("id, name").eq("is_active", true);

  let cafesCount = 0, notified = 0;
  for (const r of due) {
    const [{ data: orders }, { data: already }] = await Promise.all([
      db.from("kitchen_orders").select("cafe_id").eq("production_date", r.production_date).eq("kind", "weekly")
        .in("status", ["sent", "approved", "ready", "received"]),
      db.from("kitchen_reminders_sent").select("cafe_id").eq("production_date", r.production_date),
    ]);
    const skip = new Set([...(orders ?? []), ...(already ?? [])].map((x: { cafe_id: string }) => x.cafe_id));

    for (const c of cafes ?? []) {
      if (skip.has(c.id)) continue;
      // Claim first: the primary key makes this once per café per production date even if runs overlap.
      const { data: claimed, error } = await db.from("kitchen_reminders_sent")
        .upsert({ production_date: r.production_date, cafe_id: c.id }, { onConflict: "production_date,cafe_id", ignoreDuplicates: true })
        .select("cafe_id");
      if (error || !claimed || claimed.length === 0) continue;
      cafesCount++;
      notified += await deliverTo(await memberIds("coffee_manager", c.id), {
        title: "Commande Cuisine à envoyer",
        body: `${c.name} : commande pour la production du ${fmtProductionDay(r.production_date)} à envoyer avant ${fmtCutoff(r.cutoff_at)}.`,
      });
    }
  }
  return { cafes: cafesCount, notified };
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({})) as { event?: KitchenEvent; orderId?: string };
    const event = body.event;
    if (!event) return json({ error: "unauthorized" }, 401);

    if (event === "cutoff_reminder") {
      if (!(await cronAuthorized(req))) return json({ error: "unauthorized" }, 401);
      const r = await handleCutoffReminder();
      if (!r) return json({ error: "internal_error" }, 500);
      console.log("[notify-kitchen] cutoff_reminder", r);
      return json({ success: true, ...r });
    }

    const caller = await getCaller(req);
    if (!caller) return json({ error: "unauthorized" }, 401);
    if (!body.orderId) return json({ error: "orderId required" }, 400);

    // Note: request-supplied `extra` is deliberately ignored; content is derived server-side.
    const { data: order } = await db.from("kitchen_orders")
      .select("id, cafe_id, kind, status, production_date, urgent_reason, needed_by, ready_eta, decline_note, kitchen_cafes(name)")
      .eq("id", body.orderId).maybeSingle();
    if (!order) return json({ error: "order_not_found" }, 404);

    const verdict = authorizeEvent(event, caller, order);
    if (verdict === "forbidden") return json({ error: "forbidden" }, 403);
    if (verdict === "wrong_status") return json({ error: "wrong_status" }, 409);

    const notified = await sendOrderEvent(event, order, caller.userId);
    console.log(`[notify-kitchen] ${event} ${body.orderId.slice(0, 8)} notified: ${notified}`);
    return json({ success: true, notified });
  } catch (err) {
    console.error("[notify-kitchen]", err);
    return json({ error: "internal_error" }, 500);
  }
});
