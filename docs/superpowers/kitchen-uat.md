# Kitchen orders: UAT results

Branch `feat/kitchen-orders-design`, run 2026-10-27 against the local Supabase stack.

## Automated checks

| Check | Result | Evidence |
|---|---|---|
| `npx vitest run` | pass | 16 files, 119 tests (after the final-review fixes) |
| `supabase test db` | pass | 5 files, 140 tests (access, catalog, orders, review, reminders), after `supabase db reset --local` |
| `npx tsc --noEmit -p tsconfig.app.json` | no new errors | 131 = main baseline, stale generated types |
| `npm run lint` on files added/changed by the branch | no new errors | 7 pre-existing in `src/pages/Index.tsx` on main; 5 pre-existing in `src/test/stock.test.ts`; 1 react-refresh warning in `SpaceSwitch.tsx`. 0 errors in `src/kitchen`, `src/test/kitchen-*` and the touched components |
| Bundle check (`npm run build`) | pass | Kitchen UI is in its own `KitchenApp-*.js` chunk (60.8 kB), lazy-loaded from `Index`. The only Kitchen reference in the main/Index chunks is the `get_my_kitchen_access` RPC call; no `kitchen_orders` or other table strings outside the Kitchen chunk |

## Manual UAT

Items 1 to 9 were run with a script (`scripts/kitchen-uat.mjs`). It uses `@supabase/supabase-js`, reads the local keys at runtime and refuses non-local hosts. Re-run: `export PATH="$HOME/.docker/bin:$PATH"; node scripts/kitchen-uat.mjs` (latest run, after the final-review fixes: `SUMMARY pass=65 fail=0`; the script exits non-zero if any step fails and restores the cutoff settings even on failure). It creates eight test users with passwords through the admin API (coffee-only, café Artivistas, café Nouveau café, stores manager, kitchen manager, admin, roaster, packaging). It signs in as each and walks the flows through the same RPCs the UI calls. The cutoff was moved by updating `kitchen_settings` (not by faking time) and restored afterwards. Stock was seeded on two products. The first run printed 58 PASS and 0 FAIL; steps 3a', 4a and F1 to F5 were added for the final-review fixes (set_item `flipped`, stores manager drafting a hidden product, lock refresh, Kitchen push subscription). The script then deleted every user, café, order and member row and reset stock. Afterwards the local DB had 0 users, orders and cafés, and the cutoff was back to Sunday 20:00.

Browser-only parts (network tab, push, actual rendering) were not run. They are listed as owner to verify.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1a | Coffee-only user: `get_my_kitchen_access()` empty; every kitchen table returns 0 rows; every kitchen RPC rejected with `not_kitchen_member`; `ensure_current_user_role()` = `user` | pass | script steps 1a to 1e |
| 1b | Coffee login, catalog and checkout work as before (needs coffee tables that are remote-only locally) | owner to verify on staging | local DB lacks companies, contacts, delivery_dates, shopify_orders, etc. |
| 1c | No switch shown, no request to `kitchen_*` tables, no Kitchen chunk for a coffee-only user (network tab) | owner to verify on staging | Code evidence: Kitchen is a lazy chunk, and the RPC returns no rows so it is never loaded. `space-switch.test.tsx` and `landing.test.ts` pass |
| 2 | Admin, roaster and packaging logins land where they did | partial: data/API pass; landing for admin/roaster/packaging owner to verify | `ensure_current_user_role()` returns admin, roaster, packaging and user as before. Kitchen-only user gets NULL and no `user_roles` row. `landing.test.ts` passes |
| 3 | Café drafts over two sessions and sends; stores manager locks, adjusts 1 to 0, approves; change list returned; café sees `1 -> 0` | pass | steps 3a to 3i. A second session resumes the same draft with its items. A café edit while stores holds the lock is rejected with `order_locked`. Approve returned `[{Banana bread, from 1, to 0}]` |
| 3b | Café receives the push on approval | owner to verify after deploy | needs the deployed `notify-kitchen` function and VAPID keys |
| 4 | Café edits after approval, order goes back to `sent` ("to review") | pass | steps 4 to 4d: status `sent`, history note "edited by café", hidden from the kitchen manager until re-approved |
| 5 | After cutoff the café is locked; stores manager adds an order for a café and approves it; kitchen sees it in production | partial: data/API pass; production view rendering owner to verify | steps 5a to 5k. Both cafés get `cutoff_passed`. `kitchen_create_order_for_cafe` targets the locked week (2026-11-02). Stores adds lines, sends and approves after cutoff. The kitchen manager sees 2 approved orders and production totals Banana 0, Pandebono 5, Empanadas 1, Cookies 1 (adjusted units respected). Rendering of the production view: owner to verify |
| 6 | Urgent: café creates, stores approves, kitchen sets ETA, ready, café confirms received | partial: data/API pass; capacity preview and UI owner to verify | steps 6a to 6g. The kitchen cannot see the urgent order before approval. Another café cannot confirm someone else's order. The capacity preview is UI only: owner to verify |
| 7 | Mark ready subtracts stock | partial: data/API pass; production view refresh owner to verify | steps 7a to 7e. Banana stock 3 to 1 after a 2-unit urgent order; a weekly order wanting 2 with stock 1 serves 1 and stock goes to 0, never negative; a double mark-ready is rejected. Production view refresh: owner to verify |
| 8 | Cutoff reminder fires once for a café with no sent order | owner to verify after deploy | `kitchen_send_cutoff_reminders()` is a safe no-op locally without Vault secrets (pass). pg_cron is not on the local stack and the window and once-per-week logic lives in the `notify-kitchen` function (Deno not installed). `kitchen_reminders` pgTAP passes |
| 9 | Stores manager switches Coffee and Kitchen; carts stay separate | partial: data/API pass; switcher and separate carts in the browser owner to verify | Stores manager has a kitchen role and the coffee role `user`. `space-switch.test.tsx` passes |

## Bugs found

None.

## Spec deviations

None. The spec is unchanged.

## Deploy checklist

Do these in order. Nothing below has been run from this branch. Use a staging project (or a Supabase branch) first, then production.

### Before migration 001

1. **`ensure_current_user_role`.** Migration `20261027000001` redefines it. In the remote SQL editor run `select pg_get_functiondef('public.ensure_current_user_role'::regproc);` and diff the result against the repo version. If the remote one has changes that are not in the repo, fold them into migration 001 before applying it.
2. **No auth trigger creating coffee roles.** Confirm nothing on `auth.users` inserts into `user_roles`: `select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;` and read each trigger function. If one does, Kitchen-only invitees would also get a coffee role; fix that before inviting anyone.
3. **RLS on remote-only coffee tables.** Kitchen-only users are `authenticated` but have no coffee role. Any policy `TO authenticated USING (true)` now exposes that table to them. List candidates with `select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public' and 'authenticated' = any(roles) and (qual = 'true' or qual is null);` and tighten each one (for example, require a `user_roles` row) before inviting Kitchen-only users.
4. **How to apply the migrations.** The remote migration history includes migrations that only exist remotely, so `supabase db push` will not line up as is. Recommended: paste `20261027000001` to `20261027000005` into the SQL editor in order, on staging first. Alternative: `supabase migration repair` the remote-only versions, check `supabase migration list`, then `supabase db push`.

### Deploy, in this order

5. Apply migrations `20261027000001` to `20261027000005` (kitchen_access, kitchen_catalog, kitchen_orders, kitchen_review, kitchen_reminders), staging first.
6. Regenerate `src/integrations/supabase/types.ts` from the remote schema (the local file is stale, which is the cause of the 131 baseline tsc errors) and re-run `tsc`.
7. Deploy the edge functions `invite-user` (changed), `notify-kitchen` (new) and `notify-new-order` (changed: coffee-order push now goes only to admins' subscriptions). `supabase/config.toml` already has `[functions.notify-kitchen] verify_jwt = false`; the function authenticates callers itself (user JWT or cron secret).
8. Set the function secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `RESEND_API_KEY`, `FROM_EMAIL`, `KITCHEN_CRON_SECRET`.
9. Add the Vault secrets `kitchen_notify_url` (`https://<project>.supabase.co/functions/v1/notify-kitchen`) and `kitchen_cron_secret` (same value as `KITCHEN_CRON_SECRET`). Until both exist, `kitchen_send_cutoff_reminders()` does nothing.
10. Enable `pg_cron` and `pg_net`. The migration creates `pg_net` and schedules `kitchen-cutoff-reminder` every 15 minutes only if the `cron` schema exists; if pg_cron was enabled after the migration, schedule it by hand: `select cron.schedule('kitchen-cutoff-reminder', '*/15 * * * *', 'select public.kitchen_send_cutoff_reminders()');`
11. Seed the cafés (`kitchen_cafes`: Artivistas, Nouveau café).
12. On staging, exercise the server side before any frontend goes live: invite a Kitchen-only user and a coffee client with Kitchen access, change access with set-kitchen-access, and trigger `notify-kitchen` (send an order, approve it) to check push and email delivery.
13. Merge the frontend last. Merging to `main` deploys the live app.
14. Invite the first Kitchen users from the admin UI and run the owner-to-verify items above: coffee login and checkout, landing for admin/roaster/packaging, push on approval, cutoff reminder firing once, and the browser rendering of the production view.

Note (pre-existing, not changed by this branch): "Remove user" does not ban the account. A removed user who still has a valid login gets the coffee role `user` again on next sign-in via `ensure_current_user_role`.
