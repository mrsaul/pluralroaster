/**
 * useBeforeUnload — shows the browser "Leave site?" prompt when the user
 * tries to close/reload the tab and `isDirty` is true.
 *
 * Only bind when a form is actually dirty to avoid annoying users during
 * normal navigation. Automatically unbound when isDirty becomes false.
 */

import { useEffect } from "react";

export function useBeforeUnload(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the returnValue string but still show a dialog
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
