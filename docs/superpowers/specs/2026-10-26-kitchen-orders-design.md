# Plural Kitchen — Internal Food Orders — Design

> **For agentic workers:** Use `superpowers:writing-plans` to turn this spec into an implementation plan before touching code.

**Status:** Draft for approval
**Date:** 2026-10-26
**Lives in:** this repo (`pluralroaster`), as a separate "Kitchen" space next to the existing coffee B2B app.

Marked **[Claude's call]** = decided by Claude during brainstorming, not confirmed by the owner. Marked **[TO CONFIRM]** = a question put to the owner that hasn't been answered yet. Claude's suggested answer is written in and the plan should assume it until the owner says otherwise. Everything else was said or chosen by the owner.

### Open questions for the owner
1. **[TO CONFIRM]** Can a café edit its order after sending it, before the cutoff? Suggested: yes. See section 7, step 2.
2. **[TO CONFIRM]** Is it OK to change the existing login/invite code so kitchen-only people don't get coffee access? Suggested: yes, with tests for existing clients. See section 4.
3. **[TO CONFIRM]** Is the stores manager kitchen-only? Suggested: yes. See section 4.

---

## 1. Why

Plural is opening its second café. For the first time, food is made in one place (**Plural Kitchen**) and sold in several cafés (**Plural Artivistas** and the new café). Nothing is broken yet. The goal is to set up a clear flow before "who makes what, how much, and by when?" becomes a daily problem handled in WhatsApp.

A typical order: *Artivistas orders 1 banana bread, 1 batch of cookies and 1 batch of pandebonos for next week.*

## 2. What success looks like

1. The **kitchen manager** sees in one place what was ordered (by café), what is in stock, and what she has to produce. No adding up in her head or in WhatsApp.
2. The app answers **"what and how much to prepare this week"**.
3. The **stores manager** stays calm: every café's order in one place, adjusted in seconds, nothing lost in chats.
4. **Capacity is visible ahead of time**: the stores manager can see whether the week's production fits the kitchen's hours, or whether extra production help is needed.
5. **Ordering is easy, even at the last minute.** This includes the stores manager ordering.

**Failure, even if the app technically works** [Claude's call, from the owner's goals]: the kitchen still works from WhatsApp messages next to the app; the numbers on screen don't match what she actually makes; texting the stores manager is quicker than using the app.

## 3. Scope

### In version one
- New **Kitchen** space inside the existing app, same login and same UI style.
- Three kitchen roles: coffee manager, stores manager, kitchen manager.
- Food catalog with batch units, stock, visibility and production time, all managed by the kitchen manager.
- Weekly order with a draft cart and a configurable cutoff.
- Urgent (mid-week) orders.
- Stores manager review: adjust and approve.
- Production view: ordered − stock = to produce, by product, broken down by café.
- Capacity view: production hours needed vs. hours available.
- Notifications through what the app already has (web push, email) plus WhatsApp **share buttons**.
- Admin invites people to the Kitchen space and assigns their kitchen role.

### Not in version one
- **No prices, costs or invoicing** on food. Quantities only.
- **No WhatsApp Business account / automatic WhatsApp messages.** WhatsApp is share buttons only.
- **No delivery logistics.** Delivery is handled by a delivery company outside the app. The kitchen's job ends at "ready".
- **No recipes or ingredients.**
- **No migration from the old "Resto app".** It is dropped. Anything useful is rebuilt here.
- **No change to the coffee B2B flow** (catalog, roaster, packaging, Sellsy, Shopify).

### Anti-goals
- A coffee B2B client must **never** see or reach the Kitchen space unless the admin explicitly gives them access.
- The kitchen manager must **never** see coffee orders. The roaster and packaging must **never** see food orders. Coffee and food belong to **two different companies**.
- The Kitchen work must not risk the live B2B app: no changes to existing coffee tables, invoicing or Shopify sync behavior.

## 4. People and access

| Person | Coffee side (existing) | Kitchen side (new) |
|---|---|---|
| B2B coffee client (e.g. Les Crèmes) | ✅ as today | ❌ never, unless invited by admin |
| **Coffee manager** (one per café) | ✅ orders coffee exactly like any B2B client | ✅ orders food for **their café** |
| **Stores manager** | ❌ [TO CONFIRM: assumed kitchen-only. If they also order coffee, they get both sides with the switch] | ✅ sees and approves all cafés' food orders, can order for any café, approves urgent orders |
| **Kitchen manager** | ❌ never | ✅ catalog, stock, settings, production, marks orders ready |
| Roaster / packaging | ✅ as today | ❌ never |
| Admin (owner) | ✅ | ✅ invites people, assigns kitchen roles and cafés |

**Cafés** are a list managed by the admin (Artivistas, new café, more later). Each coffee manager is linked to one café. [Claude's call:] cafés are **their own Kitchen records**, not linked to the B2B client companies in the coffee tables, even if Artivistas is also a coffee client. This keeps the two companies' data fully apart, at the cost of entering café names twice.

**Coffee orders from Plural's own cafés** follow the existing B2B flow unchanged: roaster, packaging, invoicing as today. They never pass through the stores manager or the kitchen.

### Access model — important for the builder
Today each user has **one** `app_role` (`admin`, `user`, `roaster`, `packaging`), and `ensure_current_user_role` routes each role to one dedicated view. A coffee manager is **both** a coffee client (`user`) **and** a kitchen member. So kitchen access must be **separate from `app_role`** [Claude's call]: a kitchen membership record (user → kitchen role → café, when relevant), managed by the admin. Adding kitchen roles to the `app_role` enum would break the one-role routing.

- Users with kitchen access get a simple **Coffee / Kitchen switch**. Users without it see no menu, no route and no data.
- **Enforcement must be in the database (RLS)**, not only in the UI. A coffee client calling the API directly must get nothing from kitchen tables.
- Kitchen manager and stores manager may have **no coffee access at all**. They land straight in the Kitchen space.
- **[TO CONFIRM] Touching existing login code.** Today `ensure_current_user_role` gives every new login the `user` (coffee client) role, and `invite-user` only accepts the four coffee roles. For kitchen-only users to stay out of the coffee catalog, both need a small change: the invite gets kitchen options, and a kitchen-only invitee does not get the `user` role by default. Suggested: allowed, as long as existing coffee clients behave exactly as before, with tests covering existing client, admin, roaster and packaging logins.

## 5. Food catalog (kitchen manager owns it)

Each product has its own details, all editable by the kitchen manager:

- Name (and optional photo)
- **Ordering unit** and **pieces per unit** (e.g. "batch of 50")
- **Stock**, counted in ordering units
- **Visible / hidden**
- **Production time per unit** (e.g. pandebono batch ≈ 1h30)

Starting placeholder data. The kitchen edits it in the app:

| Product | Ordering unit | Pieces per unit | Production time (placeholder) |
|---|---|---|---|
| Banana bread | Whole cake | 1 | 1h |
| Pandebono | Batch | 50 | 1h30 |
| Empanadas | Batch | 30 | 2h |
| Cookies | Batch | 50 | 1h |

**Ordering is by unit (batch).** The café picks "2 batches". The app also shows "= 100 pieces".
If the kitchen changes pieces-per-unit or production time, **past orders keep the values they were placed with** [Claude's call].

### Stock and availability
Three states:
- **Visible, in stock:** orderable, served from stock.
- **Visible, out of stock:** **still orderable**. It shows "0 in stock, will be produced". Demand tells the kitchen what to make.
- **Hidden:** not shown to cafés, not orderable.

Stock is **updated by hand** by the kitchen manager (after a production run or a count). [Claude's call:] when an order is marked **ready**, the quantity served from stock is subtracted automatically. Produced quantities are not added automatically. The kitchen sets stock after producing.

## 6. Kitchen settings (kitchen manager)

- **Weekly cutoff:** day and time (default: **Sunday 20:00**). It locks the order for the coming week's production.
- **Available production hours per week** (one number, e.g. 30h) [Claude's call: the owner confirmed production time per product; the weekly hours figure is Claude's addition to make capacity work].
- Product details and stock (section 5).

## 7. Weekly order flow

1. **Coffee manager: draft cart.** During service, they add items whenever they notice a need. The cart **saves automatically** and is **not sent**. It works well on a phone behind the counter. It can stay open for hours or days until the cutoff. One draft per café per week [Claude's call].
2. **Coffee manager: send.** Usually at closing. Before sending, the cart shows the cutoff countdown ("Deadline: Sun 20:00, in 1 day 4h").
   **[TO CONFIRM] Editing after sending.** Suggested: the café can reopen and edit its sent order **until the cutoff**. That stays **one order per café per week**. If the order was already approved, editing sends it back to the stores manager as "sent", and the stores manager's earlier adjustments stay visible. While the stores manager is editing an order, the café's edit is blocked with a clear message, so they never edit at the same time. After the cutoff, cafés can only add through an urgent order.
3. **Reminder** before the cutoff if a café hasn't sent its order (push, falling back to email) [Claude's call: 2 hours before].
4. **Stores manager: review.** Sees all cafés' sent orders for the week. Can **change quantities, add or remove lines, and approve**. The stores manager can also **create an order for any café** directly.
5. **Changes are applied and notified, not negotiated** (owner's choice). The coffee manager gets a notification listing what changed. The order shows **original → adjusted** quantities (e.g. "50 → 40") so the delivery is no surprise.
6. **Cutoff.** At cutoff time the week locks **for cafés**: coffee managers can no longer send or edit that week's order. Approved orders feed the production view. [Claude's call, following "the stores manager can order easily even at last minute":] the **stores manager is not locked**. Orders still unapproved at the cutoff are flagged "not approved". The stores manager can still edit and approve them, or create new ones, after the cutoff, and they then count toward that week's production. The kitchen only counts approved orders, so the production numbers can still move after the cutoff, but only through the stores manager.
7. **Kitchen: produce and mark ready.** The kitchen manager marks each café's order **ready**. Delivery happens outside the app.
8. **Coffee manager: confirm received** [Claude's call, light touch].

**Late orders** (after the cutoff) go through the **urgent order** flow (section 8) [Claude's call].

Statuses [Claude's call]: `draft → sent → approved (possibly adjusted) → ready → received`, plus `declined` for urgent orders.

## 8. Urgent orders (mid-week)

For when a café runs out before the next weekly order.

1. The coffee manager uses the same cart, marks it **urgent**, adds a **reason** and a **needed-by** date/time.
2. The **stores manager** is notified immediately and **approves, adjusts or declines** (owner's choice: the stores manager decides, not the kitchen). The stores manager can also create an urgent order directly.
3. Once approved, the **kitchen manager** is notified and replies with when it will be ready (e.g. "tomorrow 10:00").
4. The café sees each step: *waiting for approval → approved → kitchen: ready tomorrow 10:00 → ready*.
5. Urgent orders **add to the week's production and capacity numbers**. The stores manager sees the capacity impact **before** approving.
6. Urgent orders are **tagged and countable**, so the stores manager can spot cafés that often run short and raise their weekly order.
7. No limits on urgent orders in version one [Claude's call].

## 9. Production and capacity views

### Kitchen manager: production of the week
For each product: **total ordered** (approved, weekly + urgent) − **in stock** = **to produce**, with the per-café breakdown.

> Pandebono — ordered 3 batches (Artivistas 1 · New café 2) · stock 1 · **to produce 2**

Plus the list of each café's order to mark ready one by one. A **per-café packing list** (shareable / printable) for the delivery driver [Claude's call, small].

### Capacity (stores manager and kitchen manager)
**Hours needed** = Σ (units to produce × production time per unit), compared with **available hours per week**:

> This week: 34h of production / 30h available — **over by 4h**

Visible to the stores manager while reviewing and approving, and updated live as orders change. This is the "do we need extra help?" signal.

## 10. Notifications and WhatsApp

No WhatsApp Business. Two channels:

- **Automatic:** the existing **web push** (`push_subscriptions`, `usePushNotifications`) and **email** (Resend), used for: cutoff reminder, new order to review (stores manager), order adjusted/approved (coffee manager), urgent order waiting (stores manager), urgent order approved (kitchen manager), order ready (coffee manager).
- **WhatsApp share buttons:** the app writes a compact plain-text message and the person taps to share it in WhatsApp (same approach as the existing order-confirmation share, `buildPlainTextSummary`). Useful on: a sent order, an adjusted order, the week's production summary, the packing list.

## 11. UI

- Same look, components and patterns as the existing B2B app (shadcn/Tailwind, cart bar, draft banner, status badges, quantity stepper).
- Mobile-first for coffee managers (behind the counter) and the kitchen. The stores manager's review screen should also work well on a phone.
- French by default, English available, like the rest of the app.
- A flow mockup from the brainstorming (café → stores manager → kitchen → café) illustrates the intended feel: draft cart with cutoff countdown, review with "50 → 40" edits, production totals with café breakdown.

## 12. Constraints

- Existing stack: React + Vite + TypeScript, shadcn/ui + Tailwind, TanStack Query, Supabase (Postgres, Auth, RLS, Edge Functions), Vercel.
- Kitchen data in **its own tables**. Existing coffee tables, Sellsy and Shopify are untouched.
- Kitchen code kept in its own area of the codebase, so it could be moved out later if the kitchen company ever needs its own app.
- `main` is live with B2B clients. The Kitchen space must be invisible to anyone without kitchen access from the first deploy.

## 13. Left to the builder

- Exact table and column design, RLS policies, and how cutoff locking is computed (time zone: Europe/Paris).
- Week window definition and how urgent orders attach to a week. "To produce" excludes orders already marked ready, since marking ready already subtracts stock.
- How the scheduled cutoff reminder runs (e.g. Supabase cron + Edge Function).
- Screen layouts within the existing UI patterns.
- How the Coffee/Kitchen switch is placed in navigation.
- Test strategy, matching the repo's existing Vitest/Playwright setup.
