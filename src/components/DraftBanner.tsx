import { Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface DraftBannerProps {
  /** ISO 8601 string of when the draft was last saved */
  savedAt: string;
  /** Called when the user clicks "Discard" — should call discardDraft() from the hook */
  onDiscard: () => void;
}

/**
 * Non-intrusive amber banner shown at the top of a form when a saved draft
 * has been restored from localStorage.
 *
 * Disappears automatically the moment the user starts editing (showBanner → false).
 * Includes a "Discard" action that resets the form to its default state.
 */
export function DraftBanner({ savedAt, onDiscard }: DraftBannerProps) {
  const formattedDate = (() => {
    try {
      return format(new Date(savedAt), "MMM d 'at' h:mm a");
    } catch {
      return "recently";
    }
  })();

  return (
    <Alert className="flex items-center justify-between gap-3 py-2.5 px-3 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex items-center gap-2 min-w-0">
        <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <AlertDescription className="text-xs text-amber-800 dark:text-amber-300 leading-none">
          You have a saved draft from {formattedDate}.
        </AlertDescription>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDiscard}
        className="h-auto py-1 px-2 text-xs text-amber-700 hover:text-amber-900 hover:bg-amber-100 dark:text-amber-400 dark:hover:text-amber-200 dark:hover:bg-amber-900/50 shrink-0"
      >
        Discard
      </Button>
    </Alert>
  );
}
