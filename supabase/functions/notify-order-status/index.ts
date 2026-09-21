// ── PluralRoaster — Order Status Change Notification ─────────────────────────
// Triggered by a Supabase Database Webhook on UPDATE to public.orders.
// Sends a Web Push to the client's subscribed device(s) when their order status changes.
//
// Required secrets (Supabase Dashboard → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY   — base64url VAPID public key
//   VAPID_PRIVATE_KEY  — base64url VAPID private key
//   VAPID_SUBJECT      — e.g. mailto:admin@pluralroaster.com

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STATUS_LABEL: Record<string, string> = {
  received:            "Commande reçue",
  synced:              "Commande confirmée",
  pending:             "En attente",
  confirmed:           "Confirmée",
  approved:            "Approuvée",
  in_production:       "En torréfaction",
  ready_for_packaging: "Prête pour l'emballage",
  packaging:           "En cours d'emballage",
  ready_for_delivery:  "Prête pour la livraison",
  shipped:             "En livraison",
  delivered:           "Livrée",
  fulfilled:           "Livrée",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const vapidPublicKey  = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject    = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@pluralroaster.com";

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.warn("[notify-order-status] Missing VAPID keys — skipping push");
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await req.json() as {
      type: string;
      table: string;
      record: Record<string, unknown>;
      old_record?: Record<string, unknown>;
    };

    if (payload.type !== "UPDATE" || payload.table !== "orders") {
      return new Response(JSON.stringify({ ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newStatus = payload.record.status as string | null;
    const oldStatus = payload.old_record?.status as string | null;

    // Only fire when status actually changed
    if (!newStatus || newStatus === oldStatus) {
      return new Response(JSON.stringify({ ignored: "status unchanged" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId   = (payload.record.user_id as string | null) ?? null;
    const orderId  = payload.record.id as string;
    const clientName = (payload.record.client_name as string | null) ?? "Client";

    if (!userId) {
      return new Response(JSON.stringify({ ignored: "no user_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const { data: subscriptions } = await db
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ pushed: 0, note: "no subscriptions for user" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const statusLabel = STATUS_LABEL[newStatus] ?? newStatus;
    const pushPayload = JSON.stringify({
      title: `Commande mise à jour`,
      body: `${clientName} — ${statusLabel}`,
      icon: "/favicon.png",
      badge: "/favicon.png",
      tag: `order-status-${orderId.slice(0, 8)}`,
      url: "/",
    });

    let pushed = 0;
    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            pushPayload,
          );
          pushed++;
        } catch (err: any) {
          console.warn("[notify-order-status] push failed:", sub.endpoint.slice(0, 40), err?.statusCode);
          if (err?.statusCode === 410) {
            await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
        }
      }),
    );

    console.log(`[notify-order-status] ${orderId.slice(0, 8)} ${oldStatus} → ${newStatus}, pushed: ${pushed}`);

    return new Response(
      JSON.stringify({ success: true, orderId, oldStatus, newStatus, pushed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[notify-order-status]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
