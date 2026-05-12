# Parallel Claude Account Collaboration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable two contributors (Saul on Plural account, collaborator on Perso account) to code in parallel on `github.com/mrsaul/pluralroaster` without creating git conflicts.

**Architecture:** Each contributor owns named branches (`saul/*`, `collab/*`), never touches `main` directly, and merges via PR. Migrations are the highest-risk conflict zone and require coordination before writing.

**Tech Stack:** Git, GitHub, Supabase migrations (SQL), Vite/React/TypeScript

---

## Ground Rules (read once, enforce always)

| Rule | Why |
|---|---|
| Never commit directly to `main` | Protects the stable deployment branch |
| One branch per task, not per session | Keeps PRs small and reviewable |
| Always `git pull origin main` before branching | Prevents diverged base |
| Coordinate before writing a migration | Two migrations with same timestamp = silent data corruption |
| Push your branch at end of every session | Backup + visibility for the other person |

---

## Task 1: Session Start — Plural account (Saul)

Run these commands at the start of every coding session.

**Files:** none — git workflow only

- [ ] **Step 1: Switch to main and pull**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/pluralroaster"
git checkout main
git pull origin main
```

Expected output: `Already up to date.` or a list of new commits.

- [ ] **Step 2: Create a task branch from main**

Name it `saul/<short-description>`. Keep it one concern per branch.

```bash
git checkout -b saul/your-task-name
```

Examples:
- `saul/fix-invoice-total`
- `saul/add-delivery-date-filter`
- `saul/migration-add-payment-status`

- [ ] **Step 3: Verify you're on the right branch**

```bash
git branch --show-current
```

Expected: `saul/your-task-name`

- [ ] **Step 4: Push the branch immediately (even empty)**

This makes it visible to the collaborator before you start, so they know not to touch the same files.

```bash
git push origin -u saul/your-task-name
```

---

## Task 2: Session Start — Perso account (collaborator)

Run these commands at the start of every coding session on the second machine/account.

- [ ] **Step 1: Pull main**

```bash
git checkout main
git pull origin main
```

- [ ] **Step 2: Create a task branch**

```bash
git checkout -b collab/your-task-name
```

- [ ] **Step 3: Push immediately**

```bash
git push origin -u collab/your-task-name
```

- [ ] **Step 4: Check what Saul is working on (avoid same files)**

```bash
git fetch origin
git branch -r
```

Look for `origin/saul/*` branches. If one exists for a task that overlaps yours, coordinate before proceeding.

---

## Task 3: During Coding — Commit Often

Frequent small commits = smaller conflicts if they happen at all.

- [ ] **Step 1: After each logical unit of work, stage and commit**

```bash
git add src/components/YourComponent.tsx
git commit -m "feat: describe what you just did"
```

Never use `git add .` — it risks committing `.env`, `package-lock.json` churn, or unrelated files.

- [ ] **Step 2: Push at least once per hour**

```bash
git push
```

- [ ] **Step 3: At end of session, push everything**

```bash
git push
```

---

## Task 4: Migrations — Coordination Protocol

Supabase migrations are the highest-conflict zone. Two people adding migrations simultaneously = wrong order, wrong timestamps, broken DB.

- [ ] **Step 1: Before writing any migration, check if the other person has pending migrations**

```bash
git fetch origin
git log --oneline origin/main.. -- supabase/migrations/
git log --oneline --remotes -- supabase/migrations/ | head -10
```

If you see a migration on another branch that hasn't merged yet, **wait** or coordinate on order.

- [ ] **Step 2: Use a timestamp that's clearly yours**

Migration filenames use `YYYYMMDDHHMMSS_description.sql`. Use the current real time:

```bash
date +%Y%m%d%H%M%S
```

This minimises collision risk.

- [ ] **Step 3: After writing the migration, apply it locally via Supabase CLI**

```bash
supabase db push
```

Or paste it into the Supabase dashboard SQL editor if not using the CLI.

- [ ] **Step 4: Commit the migration file on its own commit**

```bash
git add supabase/migrations/20260512XXXXXX_your-migration.sql
git commit -m "feat(db): describe what the migration does"
git push
```

---

## Task 5: Finishing a Task — Open a PR

When your task is done, open a PR from your branch to `main`.

- [ ] **Step 1: Make sure your branch is up to date with main**

```bash
git fetch origin
git rebase origin/main
```

If there are conflicts, resolve them file by file. Migrations conflicts are the trickiest — see Task 4.

- [ ] **Step 2: Push the rebased branch**

```bash
git push --force-with-lease
```

(`--force-with-lease` is safe — it refuses to push if someone else pushed to the same branch since your last pull.)

- [ ] **Step 3: Open the PR on GitHub**

```bash
gh pr create \
  --base main \
  --title "Your PR title" \
  --body "What this does and why. Tag the other person for review."
```

Or open it manually at: `https://github.com/mrsaul/pluralroaster/compare/main...saul/your-task-name`

- [ ] **Step 4: The other person reviews and merges**

Never merge your own PR without the other person at least seeing it. Even a quick "LGTM" prevents surprises.

---

## Task 6: After a PR Merges — Sync Everyone

After any PR merges to `main`, both contributors must sync before branching again.

- [ ] **Step 1: On both machines, pull main**

```bash
git checkout main
git pull origin main
```

- [ ] **Step 2: Delete the merged branch locally and remotely**

```bash
# On the machine that owned the branch:
git branch -d saul/your-task-name
git push origin --delete saul/your-task-name
```

- [ ] **Step 3: If the other person had a branch open, rebase it onto new main**

```bash
git checkout collab/their-task-name
git fetch origin
git rebase origin/main
git push --force-with-lease
```

---

## Task 7: Conflict Prevention — File Ownership Heuristics

When in doubt, one person owns one area at a time:

| Area | Natural owner | Why |
|---|---|---|
| `supabase/migrations/` | Coordinate explicitly | Order matters for DB integrity |
| `supabase/functions/` | One function per branch | Functions are independent units |
| `src/pages/` | One page per branch | Pages change often and are large |
| `src/components/` | One component per branch | Components shared across pages = risky |
| `src/hooks/`, `src/lib/` | One file per branch | Utility files touched by many features |
| `package.json` / `package-lock.json` | One person at a time | Lock file conflicts are noisy |
| `README.md`, `DEPLOYMENT.md` | One person at a time | Docs rarely need parallel editing |

---

## Task 8: Conflict Resolution — When It Happens

If you do get a conflict during rebase:

- [ ] **Step 1: See which files conflict**

```bash
git status
```

Look for `both modified:` lines.

- [ ] **Step 2: Open each conflicted file and resolve**

Conflict markers look like:
```
<<<<<<< HEAD (their version — main)
their code
=======
your code
>>>>>>> your-branch
```

Keep whichever version is correct, or combine both. Delete the markers.

- [ ] **Step 3: Stage the resolved file**

```bash
git add src/path/to/resolved-file.tsx
```

- [ ] **Step 4: Continue the rebase**

```bash
git rebase --continue
```

- [ ] **Step 5: If completely stuck, abort and ask**

```bash
git rebase --abort
```

Then paste the conflict in chat and discuss.

---

## Quick Reference Card

```bash
# START OF SESSION
git checkout main && git pull origin main
git checkout -b saul/task-name
git push origin -u saul/task-name

# DURING WORK
git add specific/file.tsx
git commit -m "feat: what you did"
git push

# END OF TASK
git fetch origin
git rebase origin/main
git push --force-with-lease
gh pr create --base main --title "..." --body "..."

# AFTER PR MERGES
git checkout main && git pull origin main
git branch -d saul/task-name
git push origin --delete saul/task-name
```
