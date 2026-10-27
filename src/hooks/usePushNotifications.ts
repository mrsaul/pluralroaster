// src/hooks/usePushNotifications.ts
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

export type PushSupportStatus = "supported" | "no-sw" | "no-push" | "no-vapid-key";

export function usePushNotifications() {
  const { toast } = useToast();
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default",
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const supportStatus: PushSupportStatus = (() => {
    if (typeof window === "undefined") return "no-sw";
    if (!("serviceWorker" in navigator)) return "no-sw";
    if (!("PushManager" in window)) return "no-push";
    if (!VAPID_PUBLIC_KEY) return "no-vapid-key";
    return "supported";
  })();

  const supported = supportStatus === "supported";

  // Check if this browser is already subscribed on mount
  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    });
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported || !VAPID_PUBLIC_KEY) return;
    setLoading(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        toast({ title: "Notifications bloquées", description: "Autorisez les notifications dans les réglages de votre navigateur.", variant: "destructive" });
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const p256dh = sub.getKey("p256dh");
      const auth = sub.getKey("auth");
      if (!p256dh || !auth) throw new Error("Missing push keys");

      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from("push_subscriptions" as any).upsert(
        {
          user_id: user?.id ?? null,
          endpoint: sub.endpoint,
          p256dh: arrayBufferToBase64(p256dh),
          auth: arrayBufferToBase64(auth),
        },
        { onConflict: "endpoint" },
      );
      if (error) throw error;

      setSubscribed(true);
      toast({ title: "Notifications activées", description: "Vous recevrez les notifications sur cet appareil." });
    } catch (err) {
      toast({ title: "Impossible d'activer les notifications", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [supported, toast]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        const { error: deleteError } = await supabase.from("push_subscriptions" as any).delete().eq("endpoint", sub.endpoint);
        if (deleteError) throw deleteError;
      }
      setSubscribed(false);
      toast({ title: "Notifications désactivées" });
    } catch (err) {
      toast({ title: "Impossible de désactiver les notifications", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [supported, toast]);

  return { permission, subscribed, loading, supported, supportStatus, subscribe, unsubscribe };
}
