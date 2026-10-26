import { toast } from "sonner";
import { useKitchenT } from "../i18n";

/** Native share sheet when available (WhatsApp on phones), clipboard otherwise. */
export function useShareText() {
  const copied = useKitchenT().kitchen.copied;
  return async (text: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") await navigator.clipboard?.writeText(text).catch(() => {});
      }
    } else {
      await navigator.clipboard?.writeText(text).catch(() => {});
      toast.success(copied);
    }
  };
}
