// ── PluralRoaster — Kitchen notifications ────────────────────────────────────
// Called by the app after a Kitchen order action (user JWT) and by pg_cron
// (cutoff_reminder, header x-kitchen-cron-secret).
// Web push first; email (Resend) only for recipients with no push subscription.
// Best effort: per-recipient failures are logged and never fail the call.
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
//          RESEND_API_KEY, FROM_EMAIL, KITCHEN_CRON_SECRET

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

type Caller = { role: "admin" | "coffee_manager" | "stores_manager" | "kitchen_manager"; cafeId: string | null };

function cronAuthorized(req: Request): boolean {
  const expected = Deno.env.get("KITCHEN_CRON_SECRET");
  const got = req.headers.get("x-kitchen-cron-secret");
  return !!expected && !!got && safeEqual(got, expected);
}

async function getCaller(req: Request): Promise<Caller | null> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data?.user) return null;
  const uid = data.user.id;
  const { data: admin } = await db.from("user_roles").select("user_id")
    .eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (admin) return { role: "admin", cafeId: null };
  const { data: member } = await db.from("kitchen_members").select("role, cafe_id").eq("user_id", uid).maybeSingle();
  if (member) return { role: member.role, cafeId: member.cafe_id };
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
async function deliver(userIds: string[], msg: Message): Promise<number> {
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

async function sendOrderEvent(event: KitchenEvent, order: any): Promise<number> {
  const cafe = order.kitchen_cafes?.name ?? "Café";
  const urgent = order.kind === "urgent";

  switch (event) {
    case "order_sent":
      return deliver(await memberIds("stores_manager"), {
        title: "Nouvelle commande Cuisine",
        body: `${cafe} a envoyé sa commande de la semaine.`,
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

async function handleCutoffReminder(): Promise<{ cafes: number; notified: number }> {
  const [{ data: settings }, { data: weekRows }] = await Promise.all([
    db.from("kitchen_settings").select("reminder_hours_before").eq("id", 1).single(),
    db.rpc("kitchen_current_week"),
  ]);
  const week = weekRows?.[0];
  if (!settings || !week) return { cafes: 0, notified: 0 };

  const now = Date.now();
  const cutoff = new Date(week.cutoff_at).getTime();
  const windowStart = cutoff - settings.reminder_hours_before * 3_600_000;
  if (!(windowStart <= now && now < cutoff)) return { cafes: 0, notified: 0 };

  const [{ data: cafes }, { data: orders }, { data: already }] = await Promise.all([
    db.from("kitchen_cafes").select("id, name").eq("is_active", true),
    db.from("kitchen_orders").select("cafe_id").eq("week_start", week.week_start).eq("kind", "weekly")
      .in("status", ["sent", "approved", "ready", "received"]),
    db.from("kitchen_reminders_sent").select("cafe_id").eq("week_start", week.week_start),
  ]);
  const skip = new Set([...(orders ?? []), ...(already ?? [])].map((r: { cafe_id: string }) => r.cafe_id));

  let cafesCount = 0, notified = 0;
  for (const c of cafes ?? []) {
    if (skip.has(c.id)) continue;
    // Claim first: the primary key makes this once per café per week even if runs overlap.
    const { data: claimed, error } = await db.from("kitchen_reminders_sent")
      .upsert({ week_start: week.week_start, cafe_id: c.id }, { onConflict: "week_start,cafe_id", ignoreDuplicates: true })
      .select("cafe_id");
    if (error || !claimed || claimed.length === 0) continue;
    cafesCount++;
    notified += await deliver(await memberIds("coffee_manager", c.id), {
      title: "Commande Cuisine à envoyer",
      body: `${c.name} : la date limite est ${fmtDateTime(week.cutoff_at)}. Pensez à envoyer votre commande.`,
    });
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
      if (!cronAuthorized(req)) return json({ error: "unauthorized" }, 401);
      const r = await handleCutoffReminder();
      console.log("[notify-kitchen] cutoff_reminder", r);
      return json({ success: true, ...r });
    }

    const caller = await getCaller(req);
    if (!caller) return json({ error: "unauthorized" }, 401);
    if (!body.orderId) return json({ error: "orderId required" }, 400);

    // Note: request-supplied `extra` is deliberately ignored; content is derived server-side.
    const { data: order } = await db.from("kitchen_orders")
      .select("id, cafe_id, kind, status, urgent_reason, needed_by, ready_eta, decline_note, kitchen_cafes(name)")
      .eq("id", body.orderId).maybeSingle();
    if (!order) return json({ error: "order_not_found" }, 404);

    const verdict = authorizeEvent(event, caller, order);
    if (verdict === "forbidden") return json({ error: "forbidden" }, 403);
    if (verdict === "wrong_status") return json({ error: "wrong_status" }, 409);

    const notified = await sendOrderEvent(event, order);
    console.log(`[notify-kitchen] ${event} ${body.orderId.slice(0, 8)} notified: ${notified}`);
    return json({ success: true, notified });
  } catch (err) {
    console.error("[notify-kitchen]", err);
    return json({ error: "internal_error" }, 500);
  }
});
