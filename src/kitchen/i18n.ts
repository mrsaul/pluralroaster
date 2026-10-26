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
  errors: {
    cutoffPassed: "La date limite de commande est dépassée.",
    orderLocked: "Cette commande est en cours de révision par quelqu'un d'autre.",
    forbidden: "Vous n'avez pas le droit d'effectuer cette action.",
    emptyOrder: "La commande est vide.",
    productHidden: "Ce produit n'est plus disponible.",
    invalidStatus: "Cette commande a changé de statut. Actualisez la page.",
    invalidInput: "Données invalides.",
    notKitchenMember: "Vous n'avez pas accès à l'espace Cuisine.",
    generic: "Une erreur est survenue. Réessayez.",
  },
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
  errors: {
    cutoffPassed: "The ordering deadline has passed.",
    orderLocked: "Someone else is currently reviewing this order.",
    forbidden: "You are not allowed to do this.",
    emptyOrder: "The order is empty.",
    productHidden: "This product is no longer available.",
    invalidStatus: "This order changed status. Please refresh.",
    invalidInput: "Invalid input.",
    notKitchenMember: "You do not have access to the Kitchen space.",
    generic: "Something went wrong. Please try again.",
  },
};

const dictionaries = { fr, en } as const;

export function useKitchenT(): KitchenStrings {
  const { lang } = useLang();
  return useMemo(() => dictionaries[lang], [lang]);
}
