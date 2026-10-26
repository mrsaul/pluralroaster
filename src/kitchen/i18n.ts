// Kitchen-only strings. Lives in the lazy Kitchen chunk, never in the main bundle.
import { useMemo } from "react";
import { useLang } from "@/i18n";

const fr = {
  title: "Cuisine",
  roles: {
    coffee_manager: "Responsable café",
    stores_manager: "Responsable des stocks",
    kitchen_manager: "Responsable cuisine",
  },
  cafe: "Café",
  placeholder: "L'espace Cuisine arrive bientôt.",
  backToCoffee: "Retour au café",
  logout: "Se déconnecter",
};

export type KitchenStrings = typeof fr;

const en: KitchenStrings = {
  title: "Kitchen",
  roles: {
    coffee_manager: "Café manager",
    stores_manager: "Stores manager",
    kitchen_manager: "Kitchen manager",
  },
  cafe: "Café",
  placeholder: "The Kitchen space is coming soon.",
  backToCoffee: "Back to coffee",
  logout: "Sign out",
};

const dictionaries = { fr, en } as const;

export function useKitchenT(): KitchenStrings {
  const { lang } = useLang();
  return useMemo(() => dictionaries[lang], [lang]);
}
