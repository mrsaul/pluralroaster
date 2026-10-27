import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useKitchenT } from "../i18n";

/** Web-push on/off for the signed-in Kitchen user (same subscription table as the admin toggle). */
export default function NotificationsToggle() {
  const t = useKitchenT();
  const { supported, subscribed, loading, subscribe, unsubscribe } = usePushNotifications();
  if (!supported) return null;
  const label = subscribed ? t.notifDisable : t.notifEnable;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-10 w-10"
      aria-label={label}
      title={label}
      aria-pressed={subscribed}
      disabled={loading}
      onClick={() => void (subscribed ? unsubscribe() : subscribe())}
    >
      {subscribed ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
    </Button>
  );
}
