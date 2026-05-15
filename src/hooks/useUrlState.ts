/**
 * useUrlState — mirrors a scalar filter value to/from a URL search param.
 *
 * Survives Chrome tab discards, page reloads, and is bookmarkable/shareable.
 * Uses React Router v6 useSearchParams under the hood.
 *
 * @param key          The URL search param key (e.g. "status", "q")
 * @param defaultValue Returned when the param is absent. Also used to decide
 *                     when to omit the param (= cleaner URLs).
 */

import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export function useUrlState(
  key: string,
  defaultValue: string,
): [string, (value: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const value = searchParams.get(key) ?? defaultValue;

  const setValue = useCallback(
    (next: string) => {
      setSearchParams(
        (prev) => {
          const updated = new URLSearchParams(prev);
          if (next === defaultValue) {
            updated.delete(key); // keep URL clean when value is default
          } else {
            updated.set(key, next);
          }
          return updated;
        },
        { replace: true }, // don't pollute browser history with filter changes
      );
    },
    [key, defaultValue, setSearchParams],
  );

  return [value, setValue];
}

/**
 * useUrlBoolState — same as useUrlState but for booleans.
 * Stored as "1" / absent in the URL.
 */
export function useUrlBoolState(
  key: string,
  defaultValue: boolean = false,
): [boolean, (value: boolean) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const value = searchParams.has(key) ? searchParams.get(key) === "1" : defaultValue;

  const setValue = useCallback(
    (next: boolean) => {
      setSearchParams(
        (prev) => {
          const updated = new URLSearchParams(prev);
          if (next === defaultValue) {
            updated.delete(key);
          } else {
            updated.set(key, next ? "1" : "0");
          }
          return updated;
        },
        { replace: true },
      );
    },
    [key, defaultValue, setSearchParams],
  );

  return [value, setValue];
}
