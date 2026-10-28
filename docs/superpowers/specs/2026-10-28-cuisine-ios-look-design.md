# Cuisine — iOS-native look, direction A "Papier discret"

Date: 2026-10-28 · Branch: `feat/cuisine-ios-look` (from `main` @ 3a4df62)
Preview of the chosen direction: https://claude.ai/artifact/BwaR2oYeRGhRUed2oGJRTx (section "Piste A").

## Intent

The owner wants PluralRoaster to feel like the new native Shopify iPhone app: elegant, calm, very
well laid out, with subtle motion. They also like that opening the menu switches to a black screen,
which tells you that you are in a private, important area. The look must carry the PLURAL brand
through colour and simple flat shapes rather than through typography.

This is the first of three phases, in the owner's order:

1. **Internal "Cuisine" module (`src/kitchen/**`), this document.**
2. Client coffee ordering (catalogue, cart, checkout, history, account). Separate spec later.
3. Admin. Separate spec later.

Phase 1 must set up the visual building blocks (tokens and a few shared components) so phases 2 and
3 can reuse them, but it must not change how the coffee or admin screens look.

## What the owner decided

- **Reference:** the native Shopify iPhone app (screenshots shared in conversation): a large title
  that shrinks into a frosted bar on scroll, flat lists grouped under headings, very rounded white
  cards only where content needs grouping, floating frosted pill buttons (top right, bottom tab bar),
  small solid status pills, one dark main button, and a full-screen black menu.
- **Direction A "Papier discret":** the Shopify structure on PLURAL warm paper. Colour appears only
  where it carries meaning: status pills, the selected tab, and a small flat shape next to section
  titles.
- **Colours:** the PLURAL brand guide values, unchanged (not the colours sampled from the poster):
  paper `#FBF8F1`, ink `#1C1A17`, coral `#F0605C` (accent), periwinkle `#7E9CD0`, marigold
  `#F0951F`, sand `#F1DDA9`, salmon `#EFA89E`, leaf green `#509040` (shade 600 `#3D7330`), plus the
  guide's 600/200/100 steps and ink greys.
- **Contrast:** "always super high contrast in texts, shapes, colours." Every text/background pair
  must reach at least 4.5:1, including small text in pills.
- **Typography:** a clean sans-serif like Shopify's. Colour and shapes carry the brand. No serif
  (no Averia, Leitura or Recoleta) in the app.
- **Shapes:** PLURAL's basic geometry (circle, semicircle, quarter circle, triangle), flat, no 3D,
  no gradients.
- **Language:** all user-facing copy stays French (the kitchen module also has English strings in
  `src/kitchen/i18n.ts`, which must be kept in step).
- **Process:** work on `feat/cuisine-ios-look`. No push, merge, deploy or live database change
  without the owner's OK. Never touch `.env`.

## Goals

- The three Cuisine roles (Responsable café, Responsable des boutiques, Responsable cuisine) get the
  new shell and the new look on every screen, sheet and dialog they use.
- Navigation moves from the top text links and underlined tabs to: a large title, a floating bottom
  tab bar, and a black full-screen menu that holds account actions.
- The visual tokens and shell components are reusable for phases 2 and 3.
- No behaviour change: same data, same actions, same rules, same French strings for existing
  actions. Existing tests keep passing.

## Non-goals

- No change to coffee client or admin screens (phases 2 and 3), except the app-wide status bar
  switch the owner chose.
- No new features. In particular: no search (the Shopify reference has one; Cuisine has nothing to
  search today), no new filters, no new order states.
- No database, API, Supabase or edge-function changes.
- No native wrapper and no real haptics. iPhone Safari and installed web apps cannot vibrate; the
  "haptic feel" comes from motion only.
- No Shopify logo, name, icons, colours or other brand assets.

## Anti-goals (failure even if it works)

- Any text that fails 4.5:1 contrast, e.g. white text on coral (3.2:1).
- Bouncy, slow or showy motion. The reference is subtle.
- Colour everywhere. Direction A is restrained; brand colour is for meaning, not decoration.
- A coffee or admin screen changing appearance because a global token changed.
- A screen that reads as a Shopify copy rather than PLURAL.

## Constraints

- Stack: React 18, Vite, TypeScript, Tailwind, shadcn/ui (Radix), TanStack Query v5,
  framer-motion ^12 and vaul ^0.9 already installed. Add no new dependencies unless unavoidable.
- Installed PWA on iPhone. Today `index.html` uses `black-translucent` (content under the status
  bar); this changes app-wide, see "Status bar". Bottom UI must clear
  `env(safe-area-inset-bottom)`.
- Radix sheets, dialogs and the sonner/shadcn toasts render in portals outside the Cuisine
  root, so a theme scoped to a wrapper `div` will not reach them (see "Theme scoping").
- Tests: vitest baseline 150 passing. Kitchen tests query by accessible name and test ids
  (for example buttons "Tournée suivante", "Prochaine", "Enregistrer", "Confirmer", role
  `alertdialog`, test ids `round-<id>`, `to-produce-<id>`, `order-cafe`). These names and ids
  must keep working. Baseline `tsc` has 122 errors; do not add new ones. `eslint` is clean on
  `src/kitchen` and must stay clean.

## Design

### Status bar (app-wide, owner's decision)

With `black-translucent`, iOS draws the status bar text in white over the page, which is unreadable
on paper. The owner chose to fix this for the whole app, not only Cuisine: switch to iOS's standard
status bar (dark text on a light bar, content starting below it, like the Shopify reference).

- `index.html`: `apple-mobile-web-app-status-bar-style` becomes `default`; `theme-color` becomes a
  light colour (my call: paper `#FBF8F1`). `public/manifest.json` `theme_color` and
  `background_color` follow (the latter is the launch splash colour).
- `viewport-fit=cover` stays. With the standard bar, `env(safe-area-inset-top)` should be 0 in
  the installed app; the existing `max(…, env(safe-area-inset-top) + …)` paddings already handle
  that. Bottom insets (home indicator) are unchanged.
- This is the one deliberate change outside Cuisine. Coffee and admin screens must be checked on an
  iPhone after it (headers, sticky bars, sheets, toasts) so nothing gains or loses a gap.
- If the service worker (`public/sw.js`) caches `index.html`, make sure the new meta tags reach
  installed users.

### Theme scoping

The Cuisine look is a theme that applies only while `KitchenApp` is mounted. My call for how:
`KitchenApp` adds a class (for example `theme-cuisine`) to `document.documentElement` on mount and
removes it on unmount. CSS in `src/index.css` redefines the shadcn tokens under
`.theme-cuisine` and adds the brand tokens. Because the class sits on `<html>`, portalled sheets,
dialogs and toasts pick it up too. The coffee and admin sides keep `:root` as is. A builder may
choose another mechanism if it gives the same result: Cuisine and its portals themed, everything
else untouched.

### Tokens (inside `.theme-cuisine`)

| Token | Value | Notes |
|---|---|---|
| `--background` | paper `#FBF8F1` | page |
| `--card`, `--popover` | white `#FFFFFF` | cards, sheets, menus |
| `--foreground` | ink `#1C1A17` | all main text |
| `--muted-foreground` | ink-500 `#6B645B` | secondary text (5.4:1 on paper) |
| `--border`, `--input` | warm hairline, about `#E7E1D5` | |
| `--primary` / `--primary-foreground` | ink / paper | default solid button is ink |
| `--ring` | periwinkle 600 `#5A7BB8` | visible focus ring |
| `--destructive` / `--destructive-foreground` | coral `#F0605C` / ink | ink text, never white |
| brand tokens | coral, blue, orange, sand, salmon, green, green-600 and their 100/200 tints | new `--brand-*` names |
| `--radius` | 26px for cards | buttons, inputs and tabs are full pills |

The shadcn `--accent` token (used for ghost-button hover) stays a neutral warm grey, not coral.

**Contrast rules (must hold everywhere):**

- Coral, periwinkle, marigold, sand and salmon fills carry **ink** text (5.4:1 to 13:1).
- Green fills use green-600 `#3D7330` with **paper** text (5.4:1).
- Errors and warnings are never coral or orange text on paper (both fail). Use ink text with a
  coral or orange fill, pill, bar or shape next to it.

### Typography

System font stack inside Cuisine: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter",
system-ui, sans-serif`. On iPhone this is SF Pro, like the reference. Scale (my call, adjust by
eye on device):

- Large title 30px, weight 800, letter-spacing about -0.025em.
- Compact bar title 16px, weight 700.
- Section heading 16px, weight 700. Group label (day or status group) 13px, weight 700, muted.
- Row title 15px, weight 700. Body 14px. Details 12.5px muted. Pills 11.5px, weight 700.
- Numbers use tabular figures.

### Shapes

A small flat shape (14 to 26px) sits before section headings and group labels, in a fixed
colour per meaning, so it doubles as a signpost. My call for the mapping:

| Where | Shape | Colour |
|---|---|---|
| Urgent group / urgent sections | triangle | coral |
| Weekly / regular groups | circle | periwinkle |
| Capacity | semicircle | marigold |
| To produce / production list | circle | periwinkle |
| To review | quarter circle | sand |
| Approved | semicircle | periwinkle (matches the "Approuvée" pill) |
| Not sent | quarter circle | marigold |

The black menu has one larger coral semicircle in a corner. Shapes are decorative
(`aria-hidden`), never inside buttons or text, never with gradients or shadows.

### Status pills

Solid, fully rounded, 11.5px bold. Mapping for kitchen order statuses (labels from
`cafeApp.status` and existing strings):

| Status | Fill | Text |
|---|---|---|
| Brouillon | warm grey `#E7E1D5` | ink |
| Envoyée | sand | ink |
| Approuvée | periwinkle | ink |
| Prête | green-600 | paper |
| Reçue | warm grey | ink |
| Refusée | coral | ink |
| Urgente (kind tag) | coral | ink |
| Non envoyée / Non approuvée flags | marigold | ink |

### Shell (shared by all three roles)

- **Large title** at the top: the current tab's name ("Commander", "Mes commandes", "Production",
  "Commandes", "Produits", "Réglages"). For the stores manager, who has a single screen, the
  title is that screen's name (a new French string; my suggestion: "Commandes des cafés").
- **Shrinking title:** when the page scrolls past the large title, a compact bar fades in at the
  top with the title centred, on a frosted background (`backdrop-filter: blur(18px)
  saturate(1.6)` over semi-transparent paper), padded for the status bar.
- **Top-right pill group:** frosted white pill with the screen's main secondary actions as icons
  (for example Share on Production). Every icon button has a French `aria-label`. If a screen has
  no such action, there is no pill.
- **Bottom tab bar:** floating pill island(s), 12px from the screen sides and above the home
  indicator. Frosted white, hairline border, soft shadow. Icon-only tabs (my call, matching the
  approved mockup) with the French tab name as `aria-label`; the selected tab is an ink circle with
  a paper icon that glides between tabs. The last item is the menu button (≡). Roles:
  - Responsable café: Commander, Mes commandes, Menu.
  - Responsable cuisine: Production, Commandes, Produits, Réglages, Menu.
  - Responsable des boutiques: Menu only, next to a primary floating pill "Nouvelle commande
    urgente" that opens the existing urgent-order sheet (today an outline button on the page). The
    button stays rendered inside `StoresReview` with that exact accessible name (a test clicks it);
    only its position and style change.
- Page content gets bottom padding so the last row is never hidden under the bar.
- **Black menu ("espace privé"):** full screen, near-black `#0F0E0C`, paper text. Contents:
  the role name ("Responsable cuisine", etc.) and café name if any; the role's tabs as large rows
  (selected one on a dark grey rounded block); a "Compte" group with Notifications (the existing
  toggle), "Retour au café" (only when switching is allowed) and "Se déconnecter". A floating
  round close button (×) at the bottom, `aria-label` "Fermer le menu". Opening: fade plus a short
  upward slide; closing reverses. Escape and the close button close it; focus moves into it on
  open and back to the menu button on close.
- **Space switch:** today `Index.tsx` floats the coffee/kitchen switch pill at the top right over
  the kitchen view. Inside Cuisine it would collide with the top-right pill group, and the black
  menu now offers "Retour au café". My call: do not render the floating switch over the kitchen
  view; keep it on the coffee side. `showsSpaceSwitch` and its tests may stay as they are if the
  change is made at the render site.

### Screens

Shared patterns:

- **Round picker** becomes a chip under the large title: "‹  Production du vendredi 6 nov.  ›".
  The previous/next controls are round pill buttons that keep the accessible names "Tournée
  précédente" and "Tournée suivante"; the reset "Prochaine" becomes a small text pill shown only
  when away from the default round. The label text stays the same.
- **Capacity bar:** a section with the semicircle shape, "Capacité de production" heading, the
  figures on the right (tabular), a 10px fully rounded track. Normal fill marigold. Over capacity:
  coral fill, and the "Dépassement de …" message as ink text on a coral-100 pill with a coral
  triangle. The preview fill ("… si approuvée") is a lighter marigold-200.
- **Lists of orders** follow the reference orders list: no card per row. Rows are separated by
  hairlines inside a group, under a group label with its shape. Each row: line 1 café name (bold)
  and the key figure or time on the right; line 2 muted details separated by thin bars; line 3
  status pills. Tapping a row opens its sheet where one exists today.
- **Cards** (26px radius, white, hairline, almost invisible shadow) only group content that
  belongs together: the production list, an order's items, a product being edited, a round being
  edited, settings blocks.
- **Primary action** inside a screen or card: full-width ink pill, 48px tall, paper text. Secondary:
  warm-grey filled pill with ink text. Destructive: coral pill with ink text.
- **Inputs:** 48px tall, white, hairline, fully rounded single-line fields; 18px radius for
  multi-line. Labels 12.5px muted above.
- **Banners** (cutoff passed, missed order): sand card with ink text and a marigold triangle, in
  place of today's amber box.
- **Sheets** (urgent order, order review): bottom sheet, 28px top corners, grabber, white, max
  height leaves the status bar visible. Keep the existing Radix `Sheet` behaviour; restyle only.
- **Dialogs** (AlertDialog): 28px radius, white, pill buttons, cancel as secondary pill.
- **Toasts:** ink pill with paper text, clear of the status bar (existing safe-area fix kept).
- **Empty and loading states:** muted text centred in the group, unchanged strings.

Per role:

- **Responsable café: Commander.** Products as rows inside one card (name bold, unit and pieces
  muted, stock line), stepper on the right as a pill. "Plus disponible" lines: same row with a
  marigold pill and a "Retirer" secondary pill. The cart bar becomes a floating frosted pill above
  the tab bar: total and status text on the left, ink "Envoyer" pill on the right. It must sit
  above the tab bar, not under it. The "Commande urgente" entry keeps its current place in the
  flow, styled as a secondary pill.
- **Responsable café: Mes commandes.** Orders list pattern, grouped by round or week as today,
  with status pills; existing actions ("Confirmer la réception", "Partager") as pills in the row
  or sheet where they live today.
- **Responsable des boutiques.** Round chip, capacity section, then groups "Urgences en
  attente", "À examiner", "Approuvées", "Cafés sans commande envoyée" in the orders list pattern.
  "Créer la commande pour ce café" / "Modifier le brouillon" become secondary pills on their row.
  The order review sheet and urgent sheet are restyled as above.
- **Responsable cuisine: Production.** Round chip, capacity section, then "À produire" card:
  each product row shows name, per-café breakdown and stock muted, and the quantity to produce as
  a large number on the right with its unit (pieces as a muted second line). "Commandé" and
  "Stock" figures stay visible on the row (smaller), so no information is lost. Share moves to the
  top-right pill and also stays as the full-width ink button at the end.
- **Responsable cuisine: Commandes.** Orders list pattern: urgent group first, then weekly, as
  today's sort. Each order keeps its items list, ready-time field (urgent approved orders),
  "Marquer prête" ink pill or "Prête" pill, and the packing-list share icon button.
- **Responsable cuisine: Produits** and **Réglages.** Each product and each round is a card with
  the existing fields restyled; "Nouveau produit" / "Ajouter une tournée" as secondary pills.

### Motion

Short and soft, no bounce. Use framer-motion where state changes, CSS transitions elsewhere.

- Press: scale to about 0.96 over 120ms on pills, rows and tab icons.
- Tab change: the selected-tab circle glides (shared layout animation, about 200ms, ease-out
  `cubic-bezier(0.22, 1, 0.36, 1)`, spring with no bounce if a spring is used); content cross-fades
  over about 150ms.
- Large title to compact bar: driven by scroll position, opacity and slight scale.
- Menu: about 240ms fade and 12px slide up on open.
- Sheets: keep the current slide-up.
- `prefers-reduced-motion: reduce` turns all of these into instant changes.

## Mockup vs this document

The preview page shows a search field, filter segments, a user avatar and a "Nouvelle tournée"
button in the menu. Those were illustration only. Where the mockup and this text differ, this
text wins.

## Left to the builder

- Component boundaries and names (for example a `CuisineShell`, `TabBar`, `PrivateMenu`,
  `LargeTitle`, `StatusPill`, `BrandShape`), and whether they live in `src/kitchen/components` or
  a shared folder for phases 2 and 3.
- Exact spacing, icon choices (Lucide, already installed) and per-tab icons.
- Exact English strings for new labels (the French ones are the reference).
- How to test the new shell (keyboard and accessible names, menu open/close, role tabs) in the
  existing vitest + Testing Library setup.

## Risks and checks

- **Status bar:** see "Status bar (app-wide)" above. Existing installs may need to be removed and
  re-added to the home screen before iOS shows the new status bar; check this on a device and tell
  the owner what users must do.
- `backdrop-filter` cost on older iPhones: keep the frosted surfaces few (top bar, tab bar, cart
  pill).
- Portalled sheets and toasts must show the Cuisine theme (verify by opening each).
- Verify on a real iPhone PWA before asking to deploy: safe areas, keyboard over inputs in sheets,
  tab bar above the home indicator.
