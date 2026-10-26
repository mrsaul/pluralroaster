import type { KitchenAccess } from "@/lib/landing";
import { useKitchenT } from "./i18n";

// Placeholder shell — real screens per role arrive in later tasks.
export default function KitchenApp({
  access,
  onLogout,
  onSwitchToCoffee,
}: {
  access: KitchenAccess;
  onLogout: () => void;
  onSwitchToCoffee?: () => void;
}) {
  const t = useKitchenT();
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-4 pt-16 text-center">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <p className="text-sm font-medium">{t.roles[access.role]}</p>
      {access.cafeName && (
        <p className="text-sm text-muted-foreground">
          {t.cafe} : {access.cafeName}
        </p>
      )}
      <p className="text-sm text-muted-foreground">{t.placeholder}</p>
      <div className="flex gap-3">
        {onSwitchToCoffee && (
          <button type="button" onClick={onSwitchToCoffee} className="text-sm underline text-muted-foreground hover:text-foreground">
            {t.backToCoffee}
          </button>
        )}
        <button type="button" onClick={onLogout} className="text-sm underline text-muted-foreground hover:text-foreground">
          {t.logout}
        </button>
      </div>
    </div>
  );
}
