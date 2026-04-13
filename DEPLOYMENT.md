# Pluralroaster — Vercel Deployment

## Build settings (auto-detected by Vercel)

| Setting | Value |
|---|---|
| Framework | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm install` |

---

## Required environment variables

Set these in the Vercel dashboard:
**Project → Settings → Environment Variables**

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API → anon / public key |

Apply to: **Production**, **Preview**, and **Development** environments.

---

## Supabase Auth — redirect URLs to whitelist

In the Supabase dashboard:
**Authentication → URL Configuration → Redirect URLs**

Add all of the following:

```
# Production
https://pluralroaster.vercel.app/**

# Vercel preview deployments (branch/PR previews)
https://*-yourteam.vercel.app/**

# Local development
http://localhost:5173/**
http://localhost:8080/**
```

Replace `yourteam` with your Vercel team slug (visible in your Vercel URL).

Also set the **Site URL** to your production domain:
```
https://pluralroaster.vercel.app
```

---

## Edge Functions

Both Supabase Edge Functions are deployed independently and require no
changes for this Vercel deployment:

- `sellsy-sync` — handles Sellsy API sync (products, clients, orders)
- `invite-user` — handles user invitations and role management

Secrets required on the Supabase side (set via Supabase dashboard →
Project Settings → Edge Functions → Secrets):

```
SELLSY_CLIENT_ID
SELLSY_CLIENT_SECRET
SELLSY_API_BASE_URL   # optional, defaults to https://api.sellsy.com
```

---

## First deploy checklist

- [ ] `VITE_SUPABASE_URL` set in Vercel
- [ ] `VITE_SUPABASE_ANON_KEY` set in Vercel
- [ ] Supabase redirect URLs whitelisted
- [ ] Supabase Site URL set to production domain
- [ ] Sellsy secrets set in Supabase Edge Functions
