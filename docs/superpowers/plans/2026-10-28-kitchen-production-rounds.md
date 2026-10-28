# Kitchen Production Rounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single weekly cutoff with kitchen-defined production rounds (mardi / vendredi), so each café orders per production date and the kitchen plans and measures capacity per round.

**Architecture:** A new `kitchen_rounds` table holds each round (production weekday, cutoff weekday + time, team hours). Orders move from `week_start` to `production_date` + `round_id`. Two new migrations on top of the 5 already live rewrite the order RPCs around rounds and drop the week functions. The frontend replaces the week model (`useCurrentWeek`, `useProductionWeek`, `WeekPicker`, `lib/weeks.ts`) with a round model (`useRoundOccurrences`, `RoundPicker`, `lib/rounds.ts`).

**Tech Stack:** Supabase Postgres (RLS, SECURITY DEFINER RPCs, pgTAP), React 18 + Vite + TS, TanStack Query v5, Vitest, Deno edge function `notify-kitchen`.

**Spec:** `docs/superpowers/specs/2026-10-26-kitchen-orders-design.md`, **Amendment A — Production rounds** (and the original sections it doesn't replace).

## Global Constraints

- Migrations `20261027000001`–`…005` are **live**; never edit them. New SQL goes only in `20261028000006_kitchen_rounds.sql` and `20261028000007_kitchen_orders_by_round.sql`.
- Local only while building: `supabase migration up --local` / `supabase db reset --local`. Applying to the live project and deploying functions are separate, owner-approved release steps (not tasks).
- Time zone `Europe/Paris` for every cutoff and date. Weekday numbers: `0 = dimanche … 6 = samedi`.
- Seed rounds: **Mardi** — production weekday 2, cutoff weekday 1 at **20:00**, **360 min**; **Vendredi** — production weekday 5, cutoff weekday 4 at **20:00**, **360 min**.
- A round's cutoff is strictly before its production day: cutoff date = production date − `((production_weekday − cutoff_weekday + 7) % 7, or 7 when that is 0)`.
- One regular order per café per production date. The `kind` values stay `'weekly' | 'urgent'`; `'weekly'` now means "regular round order" (no rename, to keep the live data and code stable).
- Kitchen UI is French-only (`useKitchenT()`); add any new copy to both `fr` and `en` blocks of `src/kitchen/i18n.ts`.
- tsc baseline 131 errors (no new ones); 0 new lint errors in touched files; all existing tests keep passing or are updated to the round model.

## Review Focus

1. **Round edited after orders exist** (kitchen changes Mardi's cutoff time): existing orders keep their `production_date`; their cutoff is recomputed from the round, and nothing crashes. Pinned in Task 2.
2. **Round deactivated or deleted while it has orders**: deleting a round with orders is refused (`round_in_use`); deactivating hides it from new orders but keeps existing orders visible and approvable. Pinned in Task 2.
3. **Monday 20:00:30 (just after Mardi's cutoff)**: café can no longer edit the Mardi order, the café screen moves to Vendredi, the stores manager still sees Mardi as the round to decide. Pinned in Task 2 and Task 3.
4. **No active rounds at all**: café screen shows "Aucune tournée de production configurée" instead of crashing; RPCs raise `no_round`. Pinned in Task 1 and Task 4.
5. **Urgent order needed on a non-production day (mercredi)**: attached to the next round after that date (vendredi), visible in that round's production. Pinned in Task 2.

---

## File Map

| File | Responsibility |
|---|---|
| `supabase/migrations/20261028000006_kitchen_rounds.sql` | `kitchen_rounds` table + RLS + seed, round date/cutoff functions, settings cleanup |
| `supabase/migrations/20261028000007_kitchen_orders_by_round.sql` | orders/reminders keyed by `production_date` + `round_id`, RPC rewrites, drop week functions/columns |
| `supabase/tests/kitchen_rounds.test.sql` | pgTAP for rounds |
| `supabase/tests/kitchen_{catalog,orders,review,reminders}.test.sql` | updated to the round model |
| `src/integrations/supabase/types.ts` | hand-splice kitchen type changes |
| `src/kitchen/lib/rounds.ts` (replaces `lib/weeks.ts`) | pure round helpers |
| `src/kitchen/api.ts` | round hooks, order filter by `productionDate` |
| `src/kitchen/types.ts` | `KitchenOrder.productionDate`, `roundId`; `KitchenRound`, `RoundOccurrence` |
| `src/kitchen/components/RoundPicker.tsx` (replaces `WeekPicker.tsx`) | previous/next round navigation |
| `src/kitchen/cafe/*`, `stores/*`, `kitchen/*` | screens per round |
| `src/kitchen/kitchen/KitchenSettings.tsx` + new `RoundsEditor.tsx` | rounds editor + reminder hours |
| `src/kitchen/lib/share.ts` | texts name the round |
| `supabase/functions/notify-kitchen/index.ts` | reminders per round, round named in messages |
| `scripts/kitchen-uat.mjs`, `docs/superpowers/kitchen-uat.md` | UAT steps for rounds |

---

### Task 1: Rounds table and round date functions

**Files:**
- Create: `supabase/migrations/20261028000006_kitchen_rounds.sql`
- Create: `supabase/tests/kitchen_rounds.test.sql`

**Interfaces:**
- Produces:
  - `kitchen_rounds(id uuid pk, name text not null, production_weekday int not null check 0..6 unique, cutoff_weekday int not null check 0..6, cutoff_time time not null, capacity_minutes int not null check > 0, is_active bool not null default true, created_at, updated_at)`. Seed rows `('Mardi',2,1,'20:00',360)` and `('Vendredi',5,4,'20:00',360)`.
  - RLS: select for any kitchen member or admin; insert/update/delete only `kitchen_manager`. (The "round in use" delete guard is added in Task 2, once orders reference rounds.)
  - `kitchen_round_cutoff(p_round_id uuid, p_production_date date) returns timestamptz` — `(p_production_date − days_before) + cutoff_time AT TIME ZONE 'Europe/Paris'` per Global Constraints. Raises `no_round` if the round doesn't exist.
  - `kitchen_round_occurrences(p_from date, p_to date) returns table(round_id uuid, round_name text, production_date date, cutoff_at timestamptz, capacity_minutes int)` — every active round's dates in `[p_from, p_to]`, ordered by `production_date`. Range capped at 70 days (`invalid_input` beyond).
  - `kitchen_next_open_rounds(p_count int default 2, p_now timestamptz default kitchen_now()) returns table(...same columns...)` — the next `p_count` occurrences with `cutoff_at > p_now`, ordered.
  - All three: `SECURITY DEFINER`, `SET search_path TO 'public'`, raise `not_kitchen_member` for authenticated non-members (non-admin), allowed for `auth.uid() IS NULL`; `REVOKE … FROM PUBLIC, anon`, `GRANT … TO authenticated, service_role`.
  - `kitchen_settings`: drop columns `cutoff_weekday`, `cutoff_time`, `weekly_capacity_minutes` **in Task 2** (still used by the old week functions until then). This migration only adds rounds.

- [ ] **Step 1: Write the failing pgTAP test** `supabase/tests/kitchen_rounds.test.sql` (pattern of the existing files: `begin; \ir support/kitchen_setup.psql; select plan(N); … rollback;`):
  - 2 seeded active rounds named Mardi and Vendredi.
  - `kitchen_round_cutoff(<mardi>, '2026-11-03')` = `'2026-11-02 20:00 Europe/Paris'`; `(<vendredi>, '2026-11-06')` = `'2026-11-05 20:00 Europe/Paris'`.
  - DST: `(<mardi>, '2026-03-31')` = `'2026-03-30 20:00 Europe/Paris'`.
  - A round with production weekday 2 and cutoff weekday 2 → cutoff 7 days before.
  - `kitchen_round_occurrences('2026-11-02','2026-11-08')` returns exactly 2026-11-03 (Mardi) and 2026-11-06 (Vendredi).
  - With `kitchen.now_override = '2026-11-02 19:59 Europe/Paris'`, `kitchen_next_open_rounds(2)` → 2026-11-03, 2026-11-06; at `'2026-11-02 20:00:30 Europe/Paris'` → 2026-11-06, 2026-11-10.
  - Deactivating Vendredi removes it from occurrences.
  - No active rounds → `kitchen_next_open_rounds` returns 0 rows.
  - Coffee manager cannot update a round (0 rows); kitchen manager can; stores manager can read; coffee-only client: 0 rows and `not_kitchen_member` from the functions.
  - `production_weekday` unique: inserting a second Tuesday round fails.
- [ ] **Step 2: Run** `export PATH="$HOME/.docker/bin:$PATH"; supabase db reset --local && supabase test db`. Expected: FAIL (relation `kitchen_rounds` missing).
- [ ] **Step 3: Write the migration** per Interfaces.
- [ ] **Step 4: Run** `supabase db reset --local && supabase test db`. Expected: all files PASS.
- [ ] **Step 5: Commit** `feat(kitchen): production rounds table and round date functions`

---

### Task 2: Orders keyed by production round

**Files:**
- Create: `supabase/migrations/20261028000007_kitchen_orders_by_round.sql`
- Modify: `supabase/tests/kitchen_catalog.test.sql`, `kitchen_orders.test.sql`, `kitchen_review.test.sql`, `kitchen_reminders.test.sql`

**Interfaces:**
- Consumes: Task 1 functions.
- Produces (all RPCs keep their error codes and security model from migrations 003/004):
  - `kitchen_orders`: add `production_date date`, `round_id uuid references kitchen_rounds(id)`; backfill regular orders to the **first active round on or after `week_start`** (the live ARTIVISTAS test order of week 2026-11-02 → Mardi 2026-11-03) and urgent orders by the urgent rule below; then `production_date` NOT NULL; drop index `kitchen_orders_weekly_unique` and column `week_start`; new unique index `(cafe_id, production_date) WHERE kind = 'weekly'`; index on `round_id`.
  - `kitchen_reminders_sent`: replace `week_start` with `production_date` (PK `(production_date, cafe_id)`).
  - `kitchen_settings`: drop `cutoff_weekday`, `cutoff_time`, `weekly_capacity_minutes` (keep `reminder_hours_before`).
  - `kitchen_order_cutoff(p_order_id uuid) returns timestamptz` (internal, not granted to authenticated) = `kitchen_round_cutoff(round_id, production_date)`; for urgent orders it returns NULL (no cutoff applies).
  - Drop and recreate with new signatures:
    - `kitchen_get_or_create_draft(p_cafe_id uuid DEFAULT NULL, p_production_date date DEFAULT NULL) returns uuid` — default = first of `kitchen_next_open_rounds(1)`; a given date must be an occurrence of an active round with `cutoff_at > kitchen_now()` for coffee managers (`cutoff_passed` otherwise), any active-round date for stores managers; `no_round` when none.
    - `kitchen_create_order_for_cafe(p_cafe_id uuid, p_production_date date DEFAULT NULL) returns uuid` — default = the round being decided (latest occurrence with `cutoff_at <= now` and `production_date >= Paris today`), else next open; explicit dates must be active-round occurrences not in the past (`invalid_input`).
    - `kitchen_create_urgent_order(...)` (same signature) — `production_date` = needed-by Paris date if an active round produces that weekday, else the next active round occurrence after it; `round_id` set accordingly; `no_round` when there are no active rounds.
  - Rewrite `kitchen_set_item`, `kitchen_send_order` to use `kitchen_order_cutoff(order.id)` instead of `kitchen_cutoff_for_week(week_start)`; keep every other rule.
  - Drop `kitchen_current_week(timestamptz)` and `kitchen_cutoff_for_week(date)`.
  - `BEFORE DELETE` trigger on `kitchen_rounds` raising `round_in_use` when any order references the round.

- [ ] **Step 1: Update the failing pgTAP tests.** Replace week-based assertions with round-based ones (same coverage, new dates). Add:
  - Café draft at `now_override '2026-11-01 12:00 Paris'` gets `production_date = '2026-11-03'` and `round_id` = Mardi. (The backfill of existing rows is verified on the live data in Release step 1.)
  - Draft for "following round" (`p_production_date = '2026-11-06'`) works for a coffee manager; `'2026-11-03'` at `'2026-11-02 20:00:30 Paris'` → `cutoff_passed`.
  - Second draft for the same café and date returns the same id; Mardi and Vendredi orders for the same café coexist.
  - `kitchen_set_item` on the Mardi order at `'2026-11-02 20:00:30 Paris'` → `cutoff_passed` for the café; succeeds for the stores manager.
  - Round edited (Mardi cutoff → 18:00) → `kitchen_set_item` at `'2026-11-02 19:00 Paris'` → `cutoff_passed`.
  - Deleting Mardi while an order references it → `round_in_use`; deactivating works and the order stays approvable.
  - `kitchen_create_order_for_cafe(café B)` at `'2026-11-02 21:00 Paris'` → `production_date '2026-11-03'`; at `'2026-11-04 10:00 Paris'` → `'2026-11-06'`.
  - Urgent order needed `'2026-11-04 10:00 Paris'` (mercredi) → `production_date '2026-11-06'`; needed `'2026-11-06 09:00'` → `'2026-11-06'`.
  - No active rounds → `kitchen_get_or_create_draft()` raises `no_round`.
  - `kitchen_reminders_sent` has PK `(production_date, cafe_id)`.
- [ ] **Step 2: Run** `supabase db reset --local && supabase test db`. Expected: FAIL.
- [ ] **Step 3: Write the migration** per Interfaces.
- [ ] **Step 4: Run** `supabase db reset --local && supabase test db`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(kitchen): orders keyed by production round`

---

### Task 3: Types, data layer and round helpers

**Files:**
- Modify: `src/integrations/supabase/types.ts` (hand-splice: `kitchen_rounds` table, new/changed functions and columns; remove dropped ones), `src/kitchen/types.ts`, `src/kitchen/api.ts`, `src/test/kitchen-fixtures.ts`
- Create: `src/kitchen/lib/rounds.ts`; delete `src/kitchen/lib/weeks.ts` and `src/test/kitchen-weeks.test.ts`
- Test: `src/test/kitchen-rounds.test.ts`, `src/test/kitchen-api.test.ts`

**Interfaces:**
- Produces (`src/kitchen/types.ts`):
  - `KitchenRound = { id: string; name: string; productionWeekday: number; cutoffWeekday: number; cutoffTime: string /* "HH:MM" */; capacityMinutes: number; isActive: boolean }`
  - `RoundOccurrence = { roundId: string; roundName: string; productionDate: string /* YYYY-MM-DD */; cutoffAt: string /* ISO */; capacityMinutes: number }`
  - `KitchenOrder`: `weekStart` → `productionDate: string`, add `roundId: string | null`.
- `src/kitchen/lib/rounds.ts`:
  - `parisDate(now: Date): string` (moved from weeks.ts)
  - `kitchenDefaultRound(occ: RoundOccurrence[], now: Date): RoundOccurrence | null` — earliest with `productionDate >= parisDate(now)`.
  - `storesDefaultRound(occ: RoundOccurrence[], now: Date): RoundOccurrence | null` — latest with `cutoffAt <= now` and `productionDate >= parisDate(now)`, else earliest with `cutoffAt > now`.
  - `isAfterCutoff(occ: RoundOccurrence, now: Date): boolean`
  - `formatRoundLabel(occ: Pick<RoundOccurrence, "productionDate">, lang: Lang): string` → fr `"Production du mardi 3 nov."`, en `"Production Tuesday 3 Nov"` (Paris date, no time).
  - `WEEKDAYS_FR: string[]` (`dimanche … samedi`), `WEEKDAYS_EN`.
- `src/kitchen/api.ts`:
  - Remove `useCurrentWeek`, `useProductionWeek`, settings fields `cutoffWeekday/cutoffTime/weeklyCapacityMinutes`.
  - `useKitchenRounds(): KitchenRound[]` (all rounds incl. inactive, ordered by production weekday Monday-first).
  - `useRoundOccurrences(from: string, to: string): RoundOccurrence[]` (RPC `kitchen_round_occurrences`).
  - `useNextOpenRounds(count = 2): RoundOccurrence[]` (RPC `kitchen_next_open_rounds`).
  - `useUpsertRound()`, `useDeleteRound()` (direct table writes through RLS; map `round_in_use` in `kitchenErrorMessage`).
  - `KitchenOrderFilter = { productionDate?: string; from?: string; to?: string; cafeId?: string; kind?: "weekly" | "urgent" }`.
  - `useGetOrCreateDraft().mutate({ cafeId?, productionDate? })`, `useCreateOrderForCafe().mutate({ cafeId, productionDate? })`.
  - `kitchenErrorMessage` maps new codes `no_round`, `round_in_use` (fr: "Aucune tournée de production configurée.", "Cette tournée a des commandes : désactivez-la plutôt que de la supprimer.").

- [ ] **Step 1: Write failing tests** `src/test/kitchen-rounds.test.ts`:
  - occurrences fixture: Mardi 2026-11-03 (cutoff 2026-11-02T19:00Z), Vendredi 2026-11-06 (cutoff 2026-11-05T19:00Z), Mardi 2026-11-10.
  - `kitchenDefaultRound(occ, 2026-11-04T09:00Z)` → 2026-11-06; at 2026-11-03T06:00Z → 2026-11-03.
  - `storesDefaultRound(occ, 2026-11-02T19:30Z)` → 2026-11-03 (decided round); at 2026-11-03T12:00Z → 2026-11-03; at 2026-11-04T09:00Z → 2026-11-06.
  - `formatRoundLabel({productionDate:"2026-11-03"}, "fr")` → `"Production du mardi 3 nov."`.
  - empty occurrences → both defaults `null`.
  And in `kitchen-api.test.ts`: `mapOrder` maps `production_date` → `productionDate`, `round_id` → `roundId`; `kitchenErrorMessage({message:"no_round"})` returns the French copy.
- [ ] **Step 2: Run** `npx vitest run src/test/kitchen-rounds.test.ts src/test/kitchen-api.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** types, helpers, hooks, types.ts splice (verify the spliced shapes against `supabase gen types typescript --local`).
- [ ] **Step 4: Run** the two test files. Expected: PASS. (Screen tests may fail until Tasks 4–6; note it in the report.)
- [ ] **Step 5: Commit** `feat(kitchen): round types, helpers and data hooks`

---

### Task 4: Café screens per round

**Files:**
- Modify: `src/kitchen/cafe/CafeHome.tsx`, `CafeCartBar.tsx`, `CafeOrders.tsx`, `UrgentOrderSheet.tsx`, `src/kitchen/i18n.ts`
- Test: `src/test/kitchen-cafe.test.tsx`

**Interfaces:** Consumes Task 3 (`useNextOpenRounds(2)`, `formatRoundLabel`, `isAfterCutoff`, order filter `productionDate`).

Behaviour:
- Header shows the next open round (`formatRoundLabel`) and the countdown to its `cutoffAt`. A two-option toggle (`round 1 | round 2` labels, e.g. "Mardi 3 nov." / "Vendredi 6 nov.") switches the cart between the two next open rounds; default is the first.
- The cart, send button, edit-after-approval confirm, pending-edit flush and revert-on-error keep working, scoped to the selected round's order (`useKitchenOrders({ cafeId, productionDate, kind: "weekly" })`, draft via `useGetOrCreateDraft({ productionDate })`).
- No open rounds → message "Aucune tournée de production configurée." and no cart.
- **Mes commandes** groups orders by production date, labelled with `formatRoundLabel`.
- The urgent entry stays always visible.

- [ ] **Step 1: Update tests** in `src/test/kitchen-cafe.test.tsx`: header shows "Production du mardi 3 nov."; switching to the second round loads the Vendredi order; empty rounds message; "Mes commandes" shows round labels; existing behaviours (flush, revert, urgent always visible, send only on draft) still pass with round fixtures.
- [ ] **Step 2: Run** `npx vitest run src/test/kitchen-cafe.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(kitchen): café ordering per production round`

---

### Task 5: Stores manager screens per round

**Files:**
- Create: `src/kitchen/components/RoundPicker.tsx`; delete `src/kitchen/components/WeekPicker.tsx`
- Modify: `src/kitchen/stores/StoresReview.tsx`, `OrderReviewSheet.tsx`, `CapacityBar.tsx` (unchanged API), `src/kitchen/i18n.ts`
- Test: `src/test/kitchen-stores.test.tsx`

**Interfaces:**
- `RoundPicker({ occurrences, value, onChange, defaultValue }: { occurrences: RoundOccurrence[]; value: string /* productionDate */; onChange: (productionDate: string) => void; defaultValue: string | null })` — previous / next occurrence buttons, label `formatRoundLabel`, a "Prochaine" button returning to `defaultValue`.
- Occurrences window: `useRoundOccurrences(today − 28 days, today + 28 days)`.

Behaviour:
- Default round = `storesDefaultRound`. Sections per selected round: urgent waiting (all rounds, oldest needed-by first, as today), to review, approved, cafés not sent. "Not sent" / "not approved, not counted" flags appear once `isAfterCutoff`.
- Capacity bar: needed minutes for the round's approved orders vs `occurrence.capacityMinutes`.
- Review sheet preview uses the opened order's own `productionDate` and that occurrence's capacity.
- "Créer une commande" for a café passes the selected `productionDate`. New urgent order (café picker) unchanged.
- Urgent badge: urgent orders in the last 8 weeks by `productionDate`.

- [ ] **Step 1: Update tests** (`kitchen-stores.test.tsx`): default round at Monday 2026-11-02 21:30 Paris → Mardi 3 nov.; Wednesday 2026-11-04 → Vendredi 6 nov.; capacity uses 360 min of the selected round ("dépassement de 1 h" when 420 min needed); picker next/previous/Prochaine; urgent preview uses its own round. Keep the existing lock/flush/abort tests passing.
- [ ] **Step 2: Run** `npx vitest run src/test/kitchen-stores.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(kitchen): stores manager review per production round`

---

### Task 6: Kitchen manager screens and rounds editor

**Files:**
- Create: `src/kitchen/kitchen/RoundsEditor.tsx`
- Modify: `src/kitchen/kitchen/ProductionView.tsx`, `KitchenOrdersList.tsx`, `KitchenSettings.tsx`, `src/kitchen/i18n.ts`
- Test: `src/test/kitchen-kitchen.test.tsx`

**Interfaces:** Consumes Tasks 3 and 5 (`RoundPicker`, `kitchenDefaultRound`, `useKitchenRounds`, `useUpsertRound`, `useDeleteRound`).

Behaviour:
- Production and Commandes: one round at a time via `RoundPicker`, default `kitchenDefaultRound`; capacity vs the round's `capacityMinutes`; header "Production du mardi 3 nov.".
- Réglages: **Tournées de production** list (name, production day, cutoff day + time, team hours, active toggle), "Ajouter une tournée", edit inline, delete (shows the mapped `round_in_use` error). Validation: name non-empty; hours > 0 (entered in hours, saved as minutes like today); production weekday unique (error "Une tournée existe déjà ce jour-là."). Plus **Rappel avant la date limite (heures)** (0–48). The old weekly cutoff and weekly hours fields are removed.

- [ ] **Step 1: Update tests**: production defaults to the next round not yet produced (Wednesday 2026-11-04 → Vendredi 6 nov.); capacity uses the round's hours; rounds editor lists Mardi and Vendredi, saves "6 h" as 360, refuses 0 h, refuses a second Tuesday, shows the `round_in_use` message on delete failure; reminder hours round-trip.
- [ ] **Step 2: Run** `npx vitest run src/test/kitchen-kitchen.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run`. Expected: whole suite PASS.
- [ ] **Step 5: Commit** `feat(kitchen): kitchen manager per round and rounds editor`

---

### Task 7: Notifications and share texts name the round

**Files:**
- Modify: `supabase/functions/notify-kitchen/index.ts`, `src/kitchen/lib/share.ts`
- Test: `src/test/kitchen-share.test.ts`

Behaviour:
- `handleCutoffReminder`: for each occurrence from `kitchen_next_open_rounds(4)` whose window `[cutoff − reminder_hours_before, cutoff)` contains now, remind coffee managers of active cafés with no sent/approved/ready/received regular order for that `production_date`, once per `(production_date, cafe_id)` via `kitchen_reminders_sent`. Message: "ARTIVISTAS : commande pour la production du mardi 3 nov. à envoyer avant lundi 20:00."
- Order notifications add the round: "ARTIVISTAS a envoyé sa commande pour mardi 3 nov." (order's `production_date`, formatted in Paris time, French).
- `share.ts`: order header fr "Commande pour la production du mardi 3 nov." (en "Order for production on Tuesday 3 Nov"); production summary header "Production du mardi 3 nov."; packing list header likewise. Signatures change from `weekStart` to `productionDate`.

- [ ] **Step 1: Update tests** in `kitchen-share.test.ts` for the three headers (fr and en).
- [ ] **Step 2: Run** `npx vitest run src/test/kitchen-share.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** share changes and the function changes; `npx esbuild supabase/functions/notify-kitchen/index.ts --bundle=false --log-level=error` must succeed.
- [ ] **Step 4: Run** the full suite and `supabase test db`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(kitchen): round-aware notifications and share texts`

---

### Task 8: UAT script, docs and final checks

**Files:**
- Modify: `scripts/kitchen-uat.mjs`, `docs/superpowers/kitchen-uat.md`

- [ ] **Step 1:** Update the UAT script to the round model and add steps: café orders Mardi and Vendredi separately; Monday 20:01 (move the Mardi cutoff to just before now via `kitchen_rounds`, restore in `finally`) café locked on Mardi but can still order Vendredi; stores manager approves Mardi after cutoff; kitchen sees Mardi production with the round's capacity; urgent order on a Wednesday lands in Vendredi; deleting a used round fails, deactivating works.
- [ ] **Step 2: Run** `node scripts/kitchen-uat.mjs`. Expected: `SUMMARY … fail=0`.
- [ ] **Step 3:** Full checks: `npm test`, `supabase test db`, tsc count (131), eslint on touched files (0 errors), `npm run build` + bundle grep (no kitchen code in main chunk).
- [ ] **Step 4:** Update `docs/superpowers/kitchen-uat.md`: rounds rows in the UAT table, and the **release steps** below.
- [ ] **Step 5: Commit** `test(kitchen): UAT for production rounds`

---

## Release steps (owner approval before each — not for subagents)

1. Apply `20261028000006` then `20261028000007` to the live project (record versions in `schema_migrations`). Verify with a query that the live ARTIVISTAS test order now has `production_date = 2026-11-03` and the Mardi `round_id`.
2. Redeploy `notify-kitchen`.
3. Build a fresh Vercel preview and retest with the three test accounts.
