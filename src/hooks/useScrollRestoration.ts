/**
 * useScrollRestoration — saves window.scrollY to sessionStorage on tab hide /
 * page unload, and restores it after the component mounts and data has loaded.
 *
 * Call once at the top of each admin screen:
 *   useScrollRestoration("admin-orders");
 *
 * Pass `isReady = true` once data has finished loading so the restore runs
 * after the DOM has content to scroll into.
 */

import { useEffect, useRef } from "react";

const PREFIX = "scroll:";

export function useScrollRestoration(routeKey: string, isReady: boolean = true): void {
  const storageKey = `${PREFIX}${routeKey}`;
  const restored = useRef(false);

  // Restore scroll after data is ready (run once per mount)
  useEffect(() => {
    if (!isReady || restored.current) return;
    restored.current = true;

    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved !== null) {
        const y = Number(saved);
        if (Number.isFinite(y) && y > 0) {
          // Small delay to let the DOM paint before scrolling
          requestAnimationFrame(() => {
            window.scrollTo({ top: y, behavior: "instant" });
          });
        }
      }
    } catch {
      // sessionStorage unavailable — ignore
    }
  }, [isReady, storageKey]);

  // Save scroll position on tab hide and page unload
  useEffect(() => {
    const save = () => {
      try {
        sessionStorage.setItem(storageKey, String(Math.round(window.scrollY)));
      } catch {
        // ignore
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") save();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", save);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", save);
      // Also save on unmount (route navigation)
      save();
    };
  }, [storageKey]);
}
