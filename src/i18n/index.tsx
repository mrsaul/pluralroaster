/**
 * Lightweight i18n — French default, English opt-in.
 * No external library needed for two languages.
 *
 * Usage:
 *   const t = useT();
 *   t.login.signIn  // → "Se connecter" or "Sign In"
 *
 * Language switcher: rendered in AccountPage > Profile tab.
 * Preference is persisted in localStorage under "pr_lang".
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Lang = "fr" | "en";

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const LangContext = createContext<LangContextValue>({
  lang: "fr",
  setLang: () => {},
});

const STORAGE_KEY = "pr_lang";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "fr") return saved;
    } catch { /* ignore */ }
    return "fr";
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang(): LangContextValue {
  return useContext(LangContext);
}

// ── Translations ──────────────────────────────────────────────────────────────

const fr = {
  // ── Login / Auth ──────────────────────────────────────────────────────────
  login: {
    subtitleSignIn:       "Connectez-vous pour gérer vos commandes.",
    subtitleSignUp:       "Créez votre compte pour accéder au catalogue.",
    subtitleForgot:       "Entrez votre email pour recevoir un lien de réinitialisation.",
    fullName:             "Nom complet",
    email:                "Email",
    password:             "Mot de passe",
    btnSignIn:            "Se connecter",
    btnSignUp:            "Créer un compte",
    btnForgot:            "Envoyer le lien",
    btnSigningIn:         "Connexion…",
    btnCreating:          "Création du compte…",
    btnSending:           "Envoi du lien…",
    linkForgot:           "Mot de passe oublié ?",
    linkCreate:           "Pas encore de compte ? Créer un",
    linkBack:             "Retour à la connexion",
    msgResetSent:         "Email de réinitialisation envoyé. Vérifiez votre boîte mail.",
    msgAccountCreated:    "Compte créé. Vérifiez votre email pour confirmer votre adresse, puis connectez-vous.",
    errAuthFailed:        "Échec de l'authentification.",
    errRateLimit:         "Trop de tentatives. Veuillez patienter quelques minutes avant de réessayer.",
  },

  // ── Reset password ────────────────────────────────────────────────────────
  reset: {
    title:          "Nouveau mot de passe",
    subtitle:       "Choisissez un nouveau mot de passe pour votre compte.",
    newPassword:    "Nouveau mot de passe",
    confirmPassword:"Confirmer le mot de passe",
    errMismatch:    "Les mots de passe ne correspondent pas.",
    errTooShort:    "Le mot de passe doit contenir au moins 8 caractères.",
    errInvalidLink: "Ce lien de réinitialisation est invalide ou expiré. Les liens sont valides 1 heure.",
    errUnableToUpdate: "Impossible de mettre à jour le mot de passe.",
    msgUpdated:     "Mot de passe mis à jour avec succès.",
    btnUpdate:      "Mettre à jour le mot de passe",
    btnUpdating:    "Mise à jour…",
    linkBack:       "← Retour à la connexion",
    verifying:      "Vérification de votre lien…",
    btnSignIn:      "Se connecter",
  },

  // ── Catalog / Navigation ──────────────────────────────────────────────────
  catalog: {
    home:             "Accueil",
    shop:             "Boutique",
    account:          "Compte",
    refreshCatalog:   "Actualiser le catalogue",
    searchPlaceholder:"Rechercher par nom, origine ou notes…",
    clearSearch:      "Effacer la recherche",
    filterAll:        "Tous",
    // counts
    coffeeCount:      (n: number) => `${n} café${n > 1 ? "s" : ""} disponible${n > 1 ? "s" : ""}`,
    productCount:     (n: number) => `${n} produit${n > 1 ? "s" : ""}`,
    // home dashboard
    lastOrder:        "Dernière commande",
    deliveryLabel:    (d: string) => `Livraison ${d}`,
    repeatOrder:      "Re-commander",
    history:          "Historique",
    noOrdersYet:      "Aucune commande pour l'instant.",
    browseCatalog:    "Parcourir le catalogue",
    quickReorder:     "Re-commande rapide",
    reorderAll:       "Tout re-commander",
    lastQty:          (qty: number) => `Dernière : ×${qty}`,
    add:              "+ Ajouter",
    ourCoffees:       "Nos cafés",
    browseAll:        "Voir tout",
    fromPrice:        (p: string) => `Dès ${p}`,
    // errors / empty
    couldntLoad:      "Impossible de charger le catalogue.",
    showingDefault:   "Affichage des produits par défaut.",
    retry:            "Réessayer",
    refresh:          "Actualiser",
    noMatch:          "Aucun café ne correspond à votre recherche",
    tryDifferent:     "Essayez un autre nom ou filtre",
    clearFilters:     "Effacer les filtres",
    noProducts:       "Aucun produit disponible",
    askAdmin:         "Demandez à un admin de synchroniser le catalogue.",
  },

  // ── Checkout ──────────────────────────────────────────────────────────────
  checkout: {
    reviewOrder:      "Vérification de la commande",
    headerSubtitle:   (kg: string, ttc: string) => `${kg} kg · ${ttc} TTC`,
    orderItems:       "Articles",
    deliveryDate:     "Date de livraison",
    notes:            "Notes",
    notesOptional:    "(optionnel)",
    notesPlaceholder: "Instructions spéciales, notes de livraison ou commentaires…",
    subtotalHT:       "Sous-total HT",
    vat:              "TVA (20%)",
    totalTTC:         "Total TTC",
    confirmOrder:     "Confirmer la commande",
    sendingOrder:     "Envoi de votre commande…",
    editOrder:        "Modifier la commande",
    basedOn:          "Basé sur votre commande",
    // success
    successTitle:     "Votre commande est confirmée !",
    successSubtitle:  "Notre équipe a bien reçu votre commande et va la traiter rapidement.",
    orderRef:         "Référence de commande",
    placeNewOrder:    "Passer une nouvelle commande",
    share:            "Partager",
    copy:             "Copier",
    copied:           "Copié !",
    pdf:              "PDF",
    // error
    errorTitle:       "Échec de la commande",
    tryAgain:         "Réessayer",
    backToCart:       "Retour au panier",
    errorGeneric:     "Quelque chose s'est mal passé. Votre panier a été conservé.",
  },

  // ── Cart bar ──────────────────────────────────────────────────────────────
  cart: {
    itemCount:  (n: number) => n === 1 ? "1 article" : `${n} articles`,
    viewOrder:  "Voir la commande",
  },

  // ── Product detail sheet ──────────────────────────────────────────────────
  product: {
    tastingNotes:   "Notes de dégustation",
    chooseSize:     "Choisir votre format",
    perKgBulk:      "/kg · sacs en vrac",
    quantity:       "Quantité",
    decreaseQty:    "Diminuer la quantité",
    increaseQty:    "Augmenter la quantité",
    lineTotal:      "Total de la ligne",
    added:          "Ajouté ✓",
    updateOrder:    "Mettre à jour la commande",
    addToOrder:     "Ajouter à la commande",
    roast:          "torréfaction",
    close:          "Fermer",
  },

  // ── Account page ──────────────────────────────────────────────────────────
  account: {
    myAccount:          "Mon compte",
    tabOrders:          "Commandes",
    tabProfile:         "Profil",
    tabAddresses:       "Adresses",
    sectionCompany:     "Entreprise",
    sectionContact:     "Contact",
    sectionLanguage:    "Langue",
    labelCommercialName:"Nom commercial",
    labelLegalName:     "Raison sociale",
    labelSiret:         "SIRET",
    labelVat:           "N° TVA",
    labelEmail:         "Email",
    labelPhone:         "Téléphone",
    editHint:           "Pour modifier ces informations, contactez votre chargé de compte.",
    addressesEditHint:  "Pour modifier vos adresses, contactez votre chargé de compte.",
    noAddress:          "Aucune adresse",
    noAddressHint:      "Vos adresses de livraison apparaîtront ici.",
    signOut:            "Se déconnecter",
  },

  // ── Global / Index ────────────────────────────────────────────────────────
  app: {
    loading:        "Chargement…",
    reloadPage:     "Recharger la page",
    authError:      "Erreur d'authentification. Veuillez rafraîchir et réessayer.",
    orderFailed:    "Échec de la commande",
    failedToCreate: "Impossible de créer la commande",
  },

  // ── 404 ───────────────────────────────────────────────────────────────────
  notFound: {
    title:  "Page introuvable",
    link:   "Retour à l'accueil",
  },
} as const;

const en: typeof fr = {
  login: {
    subtitleSignIn:       "Sign in to manage orders.",
    subtitleSignUp:       "Create your account to access the catalog.",
    subtitleForgot:       "Enter your email to receive a reset link.",
    fullName:             "Full Name",
    email:                "Email",
    password:             "Password",
    btnSignIn:            "Sign In",
    btnSignUp:            "Create Account",
    btnForgot:            "Send Reset Link",
    btnSigningIn:         "Signing in…",
    btnCreating:          "Creating account…",
    btnSending:           "Sending reset link…",
    linkForgot:           "Forgot password?",
    linkCreate:           "Need an account? Create one",
    linkBack:             "Back to sign in",
    msgResetSent:         "Password reset email sent. Check your inbox.",
    msgAccountCreated:    "Account created. Check your email to confirm your address, then sign in.",
    errAuthFailed:        "Authentication failed.",
    errRateLimit:         "Too many attempts. Please wait a few minutes before trying again.",
  },

  reset: {
    title:          "Reset password",
    subtitle:       "Choose a new password for your PluralRoaster account.",
    newPassword:    "New password",
    confirmPassword:"Confirm password",
    errMismatch:    "Passwords do not match.",
    errTooShort:    "Password must be at least 8 characters.",
    errInvalidLink: "This password reset link is invalid or expired.",
    errUnableToUpdate: "Unable to update password.",
    msgUpdated:     "Password updated. You can now return to the app and sign in.",
    btnUpdate:      "Update Password",
    btnUpdating:    "Updating password…",
    linkBack:       "Back to sign in",
  },

  catalog: {
    home:             "Home",
    shop:             "Shop",
    account:          "Account",
    refreshCatalog:   "Refresh catalog",
    searchPlaceholder:"Search by name, origin or tasting notes…",
    clearSearch:      "Clear search",
    filterAll:        "All",
    coffeeCount:      (n: number) => `${n} ${n === 1 ? "coffee" : "coffees"} available`,
    productCount:     (n: number) => `${n} ${n === 1 ? "product" : "products"}`,
    lastOrder:        "Last order",
    deliveryLabel:    (d: string) => `Delivery ${d}`,
    repeatOrder:      "Repeat order",
    history:          "History",
    noOrdersYet:      "No orders yet.",
    browseCatalog:    "Browse catalog",
    quickReorder:     "Quick reorder",
    reorderAll:       "Reorder all",
    lastQty:          (qty: number) => `Last: ×${qty}`,
    add:              "+ Add",
    ourCoffees:       "Our coffees",
    browseAll:        "Browse all",
    fromPrice:        (p: string) => `From ${p}`,
    couldntLoad:      "Couldn't load the catalog.",
    showingDefault:   "Showing default products.",
    retry:            "Retry",
    refresh:          "Refresh",
    noMatch:          "No coffees match your search",
    tryDifferent:     "Try a different name or filter",
    clearFilters:     "Clear filters",
    noProducts:       "No products available",
    askAdmin:         "Ask an admin to sync the catalog.",
  },

  checkout: {
    reviewOrder:      "Review Order",
    headerSubtitle:   (kg: string, ttc: string) => `${kg} kg · €${ttc} TTC`,
    orderItems:       "Order items",
    deliveryDate:     "Delivery date",
    notes:            "Notes",
    notesOptional:    "(optional)",
    notesPlaceholder: "Special instructions, delivery notes, or comments…",
    subtotalHT:       "Subtotal HT",
    vat:              "VAT (20%)",
    totalTTC:         "Total TTC",
    confirmOrder:     "Confirm Order",
    sendingOrder:     "Sending your order…",
    editOrder:        "Edit Order",
    basedOn:          "Based on your order",
    successTitle:     "Your order has been confirmed!",
    successSubtitle:  "Our team has received your order and will process it shortly.",
    orderRef:         "Order reference",
    placeNewOrder:    "Place a new order",
    share:            "Share",
    copy:             "Copy",
    copied:           "Copied!",
    pdf:              "PDF",
    errorTitle:       "Order failed",
    tryAgain:         "Try again",
    backToCart:       "Back to cart",
    errorGeneric:     "Something went wrong. Your cart has been preserved.",
  },

  cart: {
    itemCount:  (n: number) => n === 1 ? "1 item" : `${n} items`,
    viewOrder:  "View Order",
  },

  product: {
    tastingNotes:   "Tasting notes",
    chooseSize:     "Choose your size",
    perKgBulk:      "/kg · bulk bags",
    quantity:       "Quantity",
    decreaseQty:    "Decrease quantity",
    increaseQty:    "Increase quantity",
    lineTotal:      "Line total",
    added:          "Added ✓",
    updateOrder:    "Update order",
    addToOrder:     "Add to order",
    roast:          "roast",
    close:          "Close",
  },

  account: {
    myAccount:          "My account",
    tabOrders:          "Orders",
    tabProfile:         "Profile",
    tabAddresses:       "Addresses",
    sectionCompany:     "Company",
    sectionContact:     "Contact",
    sectionLanguage:    "Language",
    labelCommercialName:"Trade name",
    labelLegalName:     "Legal name",
    labelSiret:         "SIRET",
    labelVat:           "VAT number",
    labelEmail:         "Email",
    labelPhone:         "Phone",
    editHint:           "To update this information, contact your account manager.",
    addressesEditHint:  "To update your addresses, contact your account manager.",
    noAddress:          "No addresses",
    noAddressHint:      "Your delivery addresses will appear here.",
    signOut:            "Sign out",
  },

  app: {
    loading:        "Loading…",
    reloadPage:     "Reload page",
    authError:      "Authentication error. Please refresh and try again.",
    orderFailed:    "Order failed",
    failedToCreate: "Failed to create order",
  },

  notFound: {
    title:  "Oops! Page not found",
    link:   "Return to Home",
  },
} as const;

// ── Hook ──────────────────────────────────────────────────────────────────────

type Translations = typeof fr;

const dictionaries: Record<Lang, Translations> = { fr, en };

export function useT(): Translations {
  const { lang } = useLang();
  return useMemo(() => dictionaries[lang], [lang]);
}
