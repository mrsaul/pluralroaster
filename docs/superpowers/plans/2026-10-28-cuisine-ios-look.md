# Cuisine iOS look (direction A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Cuisine module (`src/kitchen/**`) the "Papier discret" iOS-native look: large shrinking title, floating frosted tab bar, black private menu, PLURAL colours and flat shapes, high contrast. Also switch the whole app to the standard iOS status bar.

**Architecture:** A `theme-cuisine` class on `<html>` (set while `KitchenApp` is mounted) redefines the shadcn tokens and enables a Tailwind `cuisine:` variant, so shared shadcn components and portalled sheets, dialogs and toasts restyle only inside Cuisine. New primitives (`BrandShape`, `StatusPill`, `SectionHeading`) and a `CuisineShell` (large title, top actions, tab bar, private menu) live in `src/kitchen/ui/`. Each role's screens are then restyled with these, without changing behaviour or data.

**Tech Stack:** React 18, Vite, TypeScript, Tailwind 3 + shadcn/ui (Radix), framer-motion ^12 (already installed), lucide-react, vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-28-cuisine-ios-look-design.md` (read it first; it holds the colour, shape, status and screen tables this plan refers to).

## Global Constraints

- Branch `feat/cuisine-ios-look` only. No push, merge, deploy or live DB change without the owner's OK. Never touch `.env`. Never print secrets.
- No new dependencies.
- All new user-facing strings in French in `src/kitchen/i18n.ts` `fr`, with an English twin in `en` (type `KitchenStrings` enforces both).
- Colours, exactly: paper `#FBF8F1`, ink `#1C1A17`, ink-500 `#6B645B`, hairline `#E7E1D5`, coral `#F0605C`, coral-100 `#FDE4E3`, periwinkle `#7E9CD0`, periwinkle-600 `#5A7BB8`, marigold `#F0951F`, marigold-200 `#F8CA88`, sand `#F1DDA9`, salmon `#EFA89E`, green `#509040`, green-600 `#3D7330`, menu black `#0F0E0C`, menu selected `#2A2723`.
- Contrast: every text/background pair ≥ 4.5:1. Coral, periwinkle, marigold, sand, salmon and grey fills carry ink text; green-600 carries paper text. No coral or marigold text on paper.
- Font inside Cuisine: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`. No serif.
- Radii: cards 26px (`--radius: 1.625rem` in the theme), sheets/dialogs 28px, buttons/inputs/tabs full pill.
- Motion: ease `cubic-bezier(0.22, 1, 0.36, 1)`, press scale 0.96 / 120ms, tab glide ~200ms with no bounce, menu 240ms fade + 12px slide. All instant under `prefers-reduced-motion: reduce`.
- Keep every accessible name and test id the existing tests use ("Tournée précédente", "Tournée suivante", "Prochaine", "Nouvelle commande urgente", "Enregistrer", "Confirmer", `round-<id>`, `to-produce-<id>`, `order-cafe`, …).
- Quality gates: `npx vitest run` all green (baseline 150); `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"` ≤ 122; `npx eslint src/kitchen` clean; `npm run build` succeeds.

## Review Focus

1. Long café and product names (e.g. "Nouveau café de la Villette – comptoir") at 320px width: rows and pills wrap, nothing overflows sideways or hides under the right-hand figure. Test in Task 7.
2. The last row of every screen stays reachable above the floating tab bar (and above the café cart pill, which itself sits above the tab bar). Test in Task 5 (content bottom padding) and Task 8 (cart pill offset class).
3. Leaving Cuisine (switch to coffee, logout, unmount) removes `theme-cuisine`, so coffee/admin screens are untouched. Test in Task 2.
4. Opening the menu while a sheet is open, or pressing Escape: one overlay at a time, Escape closes only the top one, focus returns to the menu button. Test in Task 5.
5. Reduced motion: no transform/opacity animation runs. Test in Task 5 (MotionConfig `reducedMotion="user"` present) and CSS check in Task 3.

---

## File structure

| File | Responsibility |
|---|---|
| `index.html`, `public/manifest.json` | App-wide status bar and theme colours (Task 1) |
| `src/test/pwa-meta.test.ts` | Pins the status bar / theme colour values (Task 1) |
| `src/index.css` | `.theme-cuisine` token block, font, reduced-motion rule (Task 2) |
| `tailwind.config.ts` | `cuisine:` variant, `brand-*` colours (Task 2) |
| `src/kitchen/ui/useCuisineTheme.ts` | Adds/removes the `<html>` class (Task 2) |
| `src/components/ui/{button,input,textarea,sheet,alert-dialog,sonner}.tsx` | `cuisine:` classes only (Task 3) |
| `src/kitchen/ui/contrast.ts` | `contrastRatio()` used by tests (Task 4) |
| `src/kitchen/ui/BrandShape.tsx`, `StatusPill.tsx`, `SectionHeading.tsx` | Brand primitives (Task 4) |
| `src/kitchen/ui/CuisineShell.tsx`, `TabBar.tsx`, `PrivateMenu.tsx`, `LargeTitle.tsx` | Shell (Task 5) |
| `src/kitchen/KitchenApp.tsx`, `src/pages/Index.tsx`, `src/kitchen/i18n.ts` | Roles wired into the shell (Task 6) |
| `src/kitchen/components/RoundPicker.tsx`, `src/kitchen/stores/CapacityBar.tsx` | Shared kitchen widgets (Task 7) |
| `src/kitchen/kitchen/*.tsx` | Kitchen manager screens (Task 7) |
| `src/kitchen/cafe/*.tsx` | Café manager screens (Task 8) |
| `src/kitchen/stores/StoresReview.tsx`, `OrderReviewSheet.tsx` | Stores manager screens (Task 9) |
| `src/test/kitchen-ui.test.tsx`, `src/test/kitchen-shell.test.tsx` | New tests |

---

### Task 1: App-wide standard iOS status bar

**Files:**
- Modify: `index.html:10,13`
- Modify: `public/manifest.json` (`theme_color`, `background_color`)
- Create: `src/test/pwa-meta.test.ts`

**Interfaces:** none.

- [ ] **Step 1: Write the failing test** (read the files with `fs.readFileSync(path.resolve(__dirname, "../../index.html"), "utf8")`)

```ts
it("uses the standard iOS status bar", () => {
  expect(html).toMatch(/name="apple-mobile-web-app-status-bar-style" content="default"/);
});
it("uses paper as the browser and splash colour", () => {
  expect(html).toMatch(/name="theme-color" content="#FBF8F1"/);
  expect(manifest.theme_color).toBe("#FBF8F1");
  expect(manifest.background_color).toBe("#FBF8F1");
});
it("keeps viewport-fit=cover", () => {
  expect(html).toMatch(/viewport-fit=cover/);
});
```

- [ ] **Step 2: Run** `npx vitest run src/test/pwa-meta.test.ts` → FAIL (content is `black-translucent`, `#1a1a1a`).
- [ ] **Step 3: Change the two meta tags and the two manifest fields** to the values above.
- [ ] **Step 4: Run** `npx vitest run src/test/pwa-meta.test.ts` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(pwa): switch to the standard iOS status bar app-wide"`

---

### Task 2: Cuisine theme tokens, `cuisine:` variant and `<html>` class

**Files:**
- Modify: `src/index.css` (new `.theme-cuisine { … }` block inside `@layer base`, after `.dark`)
- Modify: `tailwind.config.ts` (plugin + colours)
- Create: `src/kitchen/ui/useCuisineTheme.ts`
- Test: `src/test/kitchen-ui.test.tsx`

**Interfaces:**
- Produces: `useCuisineTheme(): void` — on mount adds `theme-cuisine` to `document.documentElement.classList`, removes it on unmount. Ref-count with a module-level counter so two mounted users don't remove it early.
- Produces: Tailwind variant `cuisine:` = `.theme-cuisine &` (via `plugin(({ addVariant }) => addVariant("cuisine", ".theme-cuisine &"))` from `tailwindcss/plugin`).
- Produces: Tailwind colours `brand-coral`, `brand-coral-100`, `brand-blue`, `brand-blue-600`, `brand-orange`, `brand-orange-200`, `brand-sand`, `brand-salmon`, `brand-green`, `brand-green-600`, `brand-ink`, `brand-ink-500`, `brand-paper`, `brand-line`, `brand-night`, `brand-night-2` with the Global Constraints hex values.

- [ ] **Step 1: Write failing tests** in `src/test/kitchen-ui.test.tsx`:

```ts
it("adds theme-cuisine to <html> while mounted and removes it after", () => {
  const { unmount } = render(<Probe />);           // Probe calls useCuisineTheme()
  expect(document.documentElement).toHaveClass("theme-cuisine");
  unmount();
  expect(document.documentElement).not.toHaveClass("theme-cuisine");
});
it("keeps the class until the last user unmounts", () => {
  const a = render(<Probe />); const b = render(<Probe />);
  a.unmount(); expect(document.documentElement).toHaveClass("theme-cuisine");
  b.unmount(); expect(document.documentElement).not.toHaveClass("theme-cuisine");
});
```

- [ ] **Step 2: Run** `npx vitest run src/test/kitchen-ui.test.tsx` → FAIL (module missing).
- [ ] **Step 3: Implement `useCuisineTheme`** with `useLayoutEffect`.
- [ ] **Step 4: Add the token block** to `src/index.css`. HSL values must equal the hex values from the spec's token table: `--background` paper, `--card`/`--popover` white, `--foreground`/`--card-foreground`/`--popover-foreground` ink, `--muted` and `--secondary` hairline grey `#E7E1D5` (with ink foreground), `--muted-foreground` ink-500, `--accent` `#F4EFE3` (neutral, not coral) with ink foreground, `--border`/`--input` `#E7E1D5`, `--primary` ink / `--primary-foreground` paper, `--ring` periwinkle-600, `--destructive` coral / `--destructive-foreground` ink, `--radius: 1.625rem`. Also `.theme-cuisine body { font-family: <Cuisine stack>; }` and a `@media (prefers-reduced-motion: reduce)` rule under `.theme-cuisine` setting `animation-duration` and `transition-duration` to `0.01ms !important`.
- [ ] **Step 5: Add the variant and colours** to `tailwind.config.ts`.
- [ ] **Step 6: Run** `npx vitest run src/test/kitchen-ui.test.tsx` → PASS; `npm run build` → succeeds.
- [ ] **Step 7: Commit** `git commit -m "feat(kitchen): Cuisine theme tokens and cuisine: variant"`

---

### Task 3: Shared shadcn components restyled under `cuisine:` only

**Files:**
- Modify: `src/components/ui/button.tsx`, `input.tsx`, `textarea.tsx`, `sheet.tsx`, `alert-dialog.tsx`, `sonner.tsx`
- Test: `src/test/kitchen-ui.test.tsx`

**Interfaces:**
- Consumes: `cuisine:` variant (Task 2).
- Produces: no new exports. Only `cuisine:`-prefixed classes are added, so coffee/admin rendering is byte-identical outside Cuisine.

Classes to add (exact intent; Tailwind spelling is the builder's):
- Button base: `cuisine:rounded-full cuisine:font-semibold cuisine:active:scale-[0.96] cuisine:transition-transform cuisine:duration-[120ms]`; sizes `default` → `cuisine:h-12 cuisine:px-5`, `lg` → `cuisine:h-12`, `icon` → `cuisine:h-11 cuisine:w-11`; `outline` → `cuisine:border-0 cuisine:bg-secondary` (secondary pill, ink text).
- Input: `cuisine:h-12 cuisine:rounded-full cuisine:bg-card cuisine:px-4`. Textarea: `cuisine:rounded-[18px] cuisine:bg-card`.
- Sheet `side="bottom"`: `cuisine:rounded-t-[28px] cuisine:max-h-[calc(100dvh-2rem)]` plus a grabber `<div aria-hidden className="hidden cuisine:block mx-auto mb-2 h-1.5 w-10 rounded-full bg-border" />` as the first child; close button `cuisine:rounded-full`.
- AlertDialog content: `cuisine:rounded-[28px]`; footer buttons inherit Button.
- Sonner toast: `cuisine:group-[.toaster]:bg-[#1C1A17] cuisine:group-[.toaster]:text-[#FBF8F1] cuisine:group-[.toaster]:rounded-full cuisine:group-[.toaster]:border-0`.

- [ ] **Step 1: Write failing tests**

```ts
it("button gets pill classes only under the cuisine variant", () => {
  const cls = buttonVariants({});
  expect(cls).toContain("cuisine:rounded-full");
  expect(cls).toContain("rounded-md"); // coffee/admin unchanged
});
it("bottom sheet shows a grabber", () => {
  render(<Sheet open><SheetContent side="bottom"><SheetTitle>T</SheetTitle></SheetContent></Sheet>);
  expect(document.querySelector('[data-grabber]')).not.toBeNull();
});
```

(Add `data-grabber` to the grabber div.)

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Add the classes** listed above.
- [ ] **Step 4: Run** `npx vitest run` (whole suite, these components are shared) → all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(ui): Cuisine-only pill styling for shared components"`

---

### Task 4: Brand primitives and contrast check

**Files:**
- Create: `src/kitchen/ui/contrast.ts`, `src/kitchen/ui/BrandShape.tsx`, `src/kitchen/ui/StatusPill.tsx`, `src/kitchen/ui/SectionHeading.tsx`
- Test: `src/test/kitchen-ui.test.tsx`

**Interfaces:**
- Produces: `contrastRatio(fg: string, bg: string): number` (WCAG 2.x relative luminance, `#RRGGBB` input).
- Produces: `type BrandColor = "coral" | "blue" | "orange" | "sand" | "salmon" | "green600"`; `type ShapeKind = "circle" | "semi" | "quarter" | "triangle"`.
- Produces: `<BrandShape kind={ShapeKind} color={BrandColor} size?: number /* px, default 16 */ className?: string />` — inline SVG, `aria-hidden="true"`, flat fill.
- Produces: `type PillTone = "grey" | "sand" | "blue" | "green" | "coral" | "orange"`; `PILL_COLORS: Record<PillTone, { bg: string; fg: string }>` (hex); `<StatusPill tone={PillTone}>{children}</StatusPill>`; `toneForStatus(status: KitchenOrder["status"]): PillTone` mapping draft→grey, sent→sand, approved→blue, ready→green, received→grey, declined→coral (spec "Status pills" table). Urgent tag uses `coral`, "Non envoyée"/"Non approuvée" flags use `orange`.
- Produces: `<SectionHeading shape={ShapeKind} color={BrandColor} title={string} action?: ReactNode level?: "section" | "group" />` — `section` = 16px bold ink, `group` = 13px bold muted; renders an `h2`/`h3` respectively.
- Spec meaning→shape mapping as a constant `SECTION_SHAPES` in `SectionHeading.tsx`: `urgent: triangle/coral`, `weekly: circle/blue`, `capacity: semi/orange`, `toProduce: circle/blue`, `toReview: quarter/sand`, `approved: semi/blue`, `notSent: quarter/orange`.

- [ ] **Step 1: Write failing tests**

```ts
it("computes WCAG contrast", () => {
  expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  expect(contrastRatio("#FFFFFF", "#F0605C")).toBeLessThan(4.5); // why coral carries ink
});
it.each(Object.entries(PILL_COLORS))("pill %s reaches 4.5:1", (_tone, { bg, fg }) => {
  expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
});
it("muted text on paper reaches 4.5:1", () => {
  expect(contrastRatio("#6B645B", "#FBF8F1")).toBeGreaterThanOrEqual(4.5);
});
it("maps order statuses to tones", () => {
  expect(toneForStatus("approved")).toBe("blue");
  expect(toneForStatus("ready")).toBe("green");
  expect(toneForStatus("declined")).toBe("coral");
});
it("shapes are hidden from screen readers", () => {
  const { container } = render(<BrandShape kind="triangle" color="coral" />);
  expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the four files.
- [ ] **Step 4: Run** `npx vitest run src/test/kitchen-ui.test.tsx` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(kitchen): brand shapes, status pills and contrast check"`

---

### Task 5: Cuisine shell — large title, tab bar, private menu, motion

**Files:**
- Create: `src/kitchen/ui/LargeTitle.tsx`, `src/kitchen/ui/TabBar.tsx`, `src/kitchen/ui/PrivateMenu.tsx`, `src/kitchen/ui/CuisineShell.tsx`
- Test: `src/test/kitchen-shell.test.tsx`

**Interfaces:**
- Consumes: `useCuisineTheme` (Task 2), `BrandShape` (Task 4).
- Produces:

```ts
export type ShellTab = { key: string; label: string; icon: LucideIcon };
export type MenuStrings = { menu: string; closeMenu: string; account: string; nav: string; backToCoffee: string; logout: string };
type CuisineShellProps = {
  title: string;                         // large title, also the compact bar title
  tabs: ShellTab[];                      // may be empty (stores manager)
  activeTab?: string;
  onTabChange?: (key: string) => void;
  topActions?: ReactNode;                // icon buttons inside the frosted top-right pill
  floatingAction?: ReactNode;            // pill shown left of the menu island (stores "Nouvelle commande urgente")
  roleLabel: string;                     // e.g. "Responsable cuisine"
  cafeName?: string | null;
  notifications?: ReactNode;             // existing <NotificationsToggle />
  onSwitchToCoffee?: () => void;         // "Retour au café" shown only if set
  onLogout: () => void;
  strings: MenuStrings;
  children: ReactNode;
};
export default function CuisineShell(props: CuisineShellProps): JSX.Element;
```

Behaviour:
- Calls `useCuisineTheme()`. Wraps children in framer-motion `<MotionConfig reducedMotion="user">`.
- `LargeTitle`: `h1` 30px/800, tracking -0.025em. Compact bar: fixed top, frosted (`backdrop-blur-[18px] backdrop-saturate-150 bg-background/80`), centred 16px/700 title, shown (`data-compact="true"`) when `window.scrollY > 44`; listener is passive.
- `TabBar`: `nav` with `aria-label={strings.nav}` ("Navigation"), fixed `bottom: calc(env(safe-area-inset-bottom) + 12px)`, left/right 12px. Each tab is a `button` with `aria-label={tab.label}` and `aria-current="page"` when active; selected indicator is a `motion.span` with `layoutId="cuisine-tab"` (ink circle, paper icon). Last island: menu button `aria-label={strings.menu}`, `aria-haspopup="dialog"`, `aria-expanded`.
- Main content gets `pb-[calc(env(safe-area-inset-bottom)+7rem)]` (`data-testid="cuisine-content"`).
- `PrivateMenu`: `role="dialog" aria-modal="true" aria-label={strings.menu}`, fixed inset, bg `brand-night`, paper text, coral semicircle `BrandShape` top-right (large). Rows: role label + café name; one `button` per tab (selected row bg `brand-night-2`, `aria-current="page"`), choosing one calls `onTabChange` and closes; "Compte" heading; `notifications`; "Retour au café" button if `onSwitchToCoffee`; "Se déconnecter" button. Floating round close button `aria-label={strings.closeMenu}`. Escape closes. Focus moves to the first row on open and back to the menu button on close. Animation: opacity 0→1 and y 12→0 over 240ms with the ease constant.
- If a Radix sheet/dialog is open, the menu button is not reachable (Radix makes the rest inert), so only one overlay can be open; Escape is handled by the top one only (the menu's handler checks `event.defaultPrevented`).

- [ ] **Step 1: Write failing tests** in `src/test/kitchen-shell.test.tsx` (render `CuisineShell` with three tabs and a stub child):

```ts
it("marks the active tab and switches on click", () => {
  fireEvent.click(screen.getByRole("button", { name: "Commandes" }));
  expect(onTabChange).toHaveBeenCalledWith("orders");
  expect(screen.getByRole("button", { name: "Production" })).toHaveAttribute("aria-current", "page");
});
it("opens the black menu and closes it with Escape, returning focus", async () => {
  const menuBtn = screen.getByRole("button", { name: "Menu" });
  fireEvent.click(menuBtn);
  expect(screen.getByRole("dialog", { name: "Menu" })).toBeInTheDocument();
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull());
  expect(menuBtn).toHaveFocus();
});
it("shows Retour au café only when switching is allowed", () => {
  // render without onSwitchToCoffee
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  expect(screen.queryByRole("button", { name: "Retour au café" })).toBeNull();
});
it("logs out from the menu", () => {
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
  expect(onLogout).toHaveBeenCalled();
});
it("choosing a tab in the menu switches and closes it", async () => { /* … */ });
it("pads content so the last row clears the tab bar", () => {
  expect(screen.getByTestId("cuisine-content").className).toMatch(/pb-\[calc\(env\(safe-area-inset-bottom\)\+7rem\)\]/);
});
it("shows the compact title after scrolling", () => {
  Object.defineProperty(window, "scrollY", { value: 120, configurable: true });
  fireEvent.scroll(window);
  expect(screen.getByTestId("compact-title")).toHaveAttribute("data-compact", "true");
});
```

- [ ] **Step 2: Run** `npx vitest run src/test/kitchen-shell.test.tsx` → FAIL.
- [ ] **Step 3: Implement** the four components.
- [ ] **Step 4: Run** → PASS. `npx eslint src/kitchen` → clean.
- [ ] **Step 5: Commit** `git commit -m "feat(kitchen): Cuisine shell with tab bar and private menu"`

---

### Task 6: Wire the three roles into the shell

**Files:**
- Modify: `src/kitchen/KitchenApp.tsx` (replace the three header blocks)
- Modify: `src/kitchen/i18n.ts` (`fr` and `en`)
- Modify: `src/pages/Index.tsx:627-635` (kitchen view)
- Test: `src/test/kitchen-shell.test.tsx`

**Interfaces:**
- Consumes: `CuisineShell`, `ShellTab`, `MenuStrings` (Task 5).
- New strings (fr / en): `menu: "Menu" / "Menu"`, `closeMenu: "Fermer le menu" / "Close menu"`, `account: "Compte" / "Account"`, `nav: "Navigation" / "Navigation"`, `stores.title: "Commandes des cafés" / "Café orders"`.

Wiring:
- Café manager: tabs `order` (`cafeApp.tabOrder`, icon `ShoppingBasket`) and `orders` (`cafeApp.tabOrders`, icon `ListOrdered`); title = active tab label.
- Kitchen manager: tabs `production` (`Flame`), `orders` (`ListOrdered`), `products` (`Package`), `settings` (`Settings`); title = active tab label. Production passes a Share icon button as `topActions` (Task 7 exposes it).
- Stores manager: no tabs, title `stores.title`, `floatingAction` left empty here (Task 9 renders the urgent pill inside `StoresReview`).
- All roles: `roleLabel = t.roles[access.role]`, `cafeName = access.cafeName`, `notifications = <NotificationsToggle />`, `onSwitchToCoffee`, `onLogout`.
- Placeholder role (no known role): keep today's centred block, but inside the theme (call `useCuisineTheme()`).
- `Index.tsx`: render the kitchen view without `withSpaceSwitch(...)` (the menu's "Retour au café" replaces it). `showsSpaceSwitch` and `landing.test.ts` stay unchanged.

- [ ] **Step 1: Write failing tests** (mock the screen modules with `vi.mock("@/kitchen/kitchen/ProductionView", () => ({ default: () => <p>PRODUCTION</p> }))` etc.):

```ts
it("kitchen manager sees four tabs and Production first", () => {
  render(<KitchenApp access={{ role: "kitchen_manager" } as KitchenAccess} onLogout={vi.fn()} />);
  for (const n of ["Production", "Commandes", "Produits", "Réglages"]) expect(screen.getByRole("button", { name: n })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1, name: "Production" })).toBeInTheDocument();
  expect(screen.getByText("PRODUCTION")).toBeInTheDocument();
});
it("café manager has Commander and Mes commandes", () => { /* … */ });
it("stores manager gets the Commandes des cafés title and no tabs", () => {
  expect(screen.getByRole("heading", { level: 1, name: "Commandes des cafés" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Production" })).toBeNull();
});
it("menu shows the role label", () => {
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  expect(within(screen.getByRole("dialog", { name: "Menu" })).getByText("Responsable cuisine")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the wiring, strings and `Index.tsx` change.
- [ ] **Step 4: Run** `npx vitest run` → all PASS (incl. `space-switch` and `landing` tests).
- [ ] **Step 5: Commit** `git commit -m "feat(kitchen): roles use the Cuisine shell; menu replaces top links"`

---

### Task 7: Round picker, capacity and kitchen manager screens

**Files:**
- Modify: `src/kitchen/components/RoundPicker.tsx`, `src/kitchen/stores/CapacityBar.tsx`
- Modify: `src/kitchen/kitchen/ProductionView.tsx`, `KitchenOrdersList.tsx`, `ProductsEditor.tsx`, `RoundsEditor.tsx`, `KitchenSettings.tsx`
- Test: `src/test/kitchen-kitchen.test.tsx`, `src/test/kitchen-ui.test.tsx`

**Interfaces:**
- Consumes: `BrandShape`, `StatusPill`, `toneForStatus`, `SectionHeading`, `SECTION_SHAPES` (Task 4).
- RoundPicker: same props. Renders a pill chip: icon-only round `Button`s (`ChevronLeft`/`ChevronRight`) with `aria-label` "Tournée précédente"/"Tournée suivante", the existing label text between them, and "Prochaine" as a small secondary pill only off the default round.
- CapacityBar: same props and `data-over`. `SectionHeading` with `SECTION_SHAPES.capacity`; track 10px pill; fill `brand-orange`, preview fill `brand-orange-200`, over fill `brand-coral`; over message `role="alert"` as ink text on a `brand-coral-100` pill with a coral triangle `BrandShape`. No coral/destructive text colour.
- ProductionView: per spec "Responsable cuisine: Production". Keep `data-testid="to-produce-<id>"` on the large to-produce number. Wrap rows in one card under `SectionHeading` toProduce. Share stays as the full-width ink button.
- KitchenOrdersList: group label "Urgente" rows first then "Hebdomadaire" (`SectionHeading level="group"` with urgent/weekly shapes), rows in the flat list pattern; urgent tag `StatusPill tone="coral"`; ready state `StatusPill tone="green"` with the existing "Prête" text; "Marquer prête" stays a full-width ink `Button`.
- ProductsEditor, RoundsEditor, KitchenSettings: each item a card (`rounded-[26px] bg-card border`), existing fields and buttons unchanged apart from inherited `cuisine:` styles; "Nouveau produit"/"Ajouter une tournée" use `variant="outline"` (secondary pill).

- [ ] **Step 1: Write failing tests**

```ts
// kitchen-ui.test.tsx
it("capacity overrun is ink text on a coral pill, not red text", () => {
  render(<CapacityBar neededMinutes={400} availableMinutes={300} />);
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("Dépassement de 1 h 40") // formatMinutes(100) === "1 h 40";
  expect(alert.className).not.toMatch(/text-destructive/);
});
it("long names wrap instead of overflowing", () => {
  // render KitchenOrdersList row with cafeName "Nouveau café de la Villette – comptoir"
  expect(screen.getByTestId("order-cafe").className).toMatch(/break-words|min-w-0/);
});
```


- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Restyle** the listed files.
- [ ] **Step 4: Run** `npx vitest run src/test/kitchen-kitchen.test.tsx src/test/kitchen-ui.test.tsx src/test/kitchen-stores.test.tsx` → PASS (existing names and test ids unchanged).
- [ ] **Step 5: Commit** `git commit -m "feat(kitchen): restyle round picker, capacity and kitchen screens"`

---

### Task 8: Café manager screens

**Files:**
- Modify: `src/kitchen/cafe/CafeHome.tsx`, `CafeCartBar.tsx`, `CafeOrders.tsx`, `UrgentOrderSheet.tsx`
- Test: `src/test/kitchen-cafe.test.tsx`

**Interfaces:**
- Consumes: Task 4 primitives.
- CafeHome: products as rows inside one card (spec "Responsable café: Commander"); hidden lines show `StatusPill tone="orange"` "Plus disponible" and a secondary "Retirer" pill (keep its `aria-label`). Cutoff banner: sand card, ink text, marigold triangle (`role="status"` kept).
- CafeCartBar: floating frosted pill, `fixed`, `left-3 right-3`, `bottom: calc(env(safe-area-inset-bottom) + 5.25rem)` (above the tab bar), `data-testid="cafe-cart-bar"`, "Envoyer" as ink pill. Same props.
- CafeOrders: `StatusSteps` keeps its `ol aria-label="status"` and `aria-current="step"`; current step rendered with `StatusPill tone={toneForStatus(status)}`; declined uses `tone="coral"` with ink text.
- UrgentOrderSheet: inherits the bottom sheet style; fields use pill inputs.

- [ ] **Step 1: Write failing tests**

```ts
it("cart pill floats above the tab bar", () => {
  expect(screen.getByTestId("cafe-cart-bar").getAttribute("style") ?? screen.getByTestId("cafe-cart-bar").className)
    .toMatch(/5\.25rem/);
});
it("declined status is ink on coral, not destructive text", () => {
  // render CafeOrders with a declined order
  expect(screen.getByText("Refusée").className).not.toMatch(/text-destructive/);
});
```

- [ ] **Step 2: Run** `npx vitest run src/test/kitchen-cafe.test.tsx` → FAIL.
- [ ] **Step 3: Restyle** the four files.
- [ ] **Step 4: Run** → PASS (all existing café tests too).
- [ ] **Step 5: Commit** `git commit -m "feat(kitchen): restyle café manager screens"`

---

### Task 9: Stores manager screens

**Files:**
- Modify: `src/kitchen/stores/StoresReview.tsx`, `src/kitchen/stores/OrderReviewSheet.tsx`
- Test: `src/test/kitchen-stores.test.tsx`

**Interfaces:**
- Consumes: Task 4 primitives, `CapacityBar`/`RoundPicker` from Task 7.
- StoresReview: groups with `SectionHeading` (urgent, toReview, approved, notSent), flat rows; flags `StatusPill tone="orange"`; row actions as secondary pills. The "Nouvelle commande urgente" button stays inside `StoresReview` with that exact name, restyled as a primary ink floating pill: `fixed`, `left-3`, `bottom: calc(env(safe-area-inset-bottom) + 12px)`, height 54px, so it sits left of the menu island; `data-testid="urgent-fab"`.
- OrderReviewSheet: inherits sheet style; capacity preview uses the new CapacityBar; "Approuver" ink pill, "Refuser" coral pill with ink text (`variant="destructive"`).

- [ ] **Step 1: Write failing test**

```ts
it("urgent order button floats as a pill and keeps its name", () => {
  const b = screen.getByRole("button", { name: "Nouvelle commande urgente" });
  expect(b).toHaveAttribute("data-testid", "urgent-fab");
});
```

- [ ] **Step 2: Run** `npx vitest run src/test/kitchen-stores.test.tsx` → FAIL.
- [ ] **Step 3: Restyle** both files.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(kitchen): restyle stores manager review"`

---

### Task 10: Verification and device check list

**Files:** none (unless fixes are needed).

- [ ] **Step 1:** `npx vitest run` → all pass (≥ 150 + new).
- [ ] **Step 2:** `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"` → ≤ 122.
- [ ] **Step 3:** `npx eslint src/kitchen src/components/ui` → no new errors.
- [ ] **Step 4:** `npm run build` → succeeds.
- [ ] **Step 5:** Run the dev server and check each role at 375×812 in the browser pane: tab bar, menu, every sheet and dialog themed, toasts ink pills, last row reachable, a coffee page after "Retour au café" looks exactly as before.
- [ ] **Step 6:** Write the owner's iPhone check list into the PR/hand-over (no deploy): status bar dark text on light bar on coffee, admin and Cuisine screens; whether an existing install needs remove + re-add to pick it up; safe areas; keyboard over inputs in sheets; tab bar above the home indicator; frosted surfaces smooth on an older iPhone.
- [ ] **Step 7:** Stop. Ask the owner before any push, merge or deploy.
