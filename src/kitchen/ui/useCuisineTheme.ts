import { useLayoutEffect } from "react";

const CLASS_NAME = "theme-cuisine";

// Ref-count so overlapping users do not remove the class early.
let users = 0;

/** Adds `theme-cuisine` to <html> while mounted so portalled UI is themed too. */
export function useCuisineTheme(): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    users += 1;
    root.classList.add(CLASS_NAME);
    return () => {
      users -= 1;
      if (users <= 0) {
        users = 0;
        root.classList.remove(CLASS_NAME);
      }
    };
  }, []);
}
