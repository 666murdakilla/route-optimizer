# Department of New Yorker Verification — site

Informational site + waitlist for the DNYV launch (July 18). Static single-page
site served by Vercel, with one serverless function that writes waitlist
signups to Supabase.

```
dnyv/
├── public/               # the site, served as-is (design and copy are final)
│   ├── index.html
│   └── assets/fonts/     # self-hosted Noto Sans + Space Grotesk (woff2)
├── api/
│   └── notify.js         # POST /api/notify → insert into waitlist_signups
├── supabase/
│   └── migrations/
│       └── 0001_waitlist.sql
├── vercel.json
└── .env.example
```

## One-time setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) (any region; `us-east-1` is closest to NYC).
2. Open **SQL Editor** and run the contents of `supabase/migrations/0001_waitlist.sql`
   (or use the Supabase CLI: `supabase db push`).
3. Grab from **Project Settings → API**:
   - Project URL → `SUPABASE_URL`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`

The `waitlist_signups` table has RLS enabled with **no policies**, so it is not
readable or writable with the public `anon` key — only the serverless function
(service role) can touch it. Read signups via the Supabase dashboard
(Table Editor) or SQL.

### 2. Vercel

1. **Add New → Project**, import this GitHub repo.
2. Set **Root Directory** to `dnyv` (Project Settings → General). Framework
   preset: **Other**. No build command — `vercel.json` handles it.
3. Add the two environment variables from `.env.example`
   (Project Settings → Environment Variables, Production + Preview).
4. Deploy. The site is served from `public/`, the API from `api/notify.js`.

### 3. Custom domain (dnyv.nyc / nyverification.org)

1. Vercel → Project → Settings → Domains → add the domain.
2. At the registrar, add the DNS records Vercel shows:
   - Apex (`dnyv.nyc`): `A` record → `76.76.21.21`
   - `www` (optional): `CNAME` → `cname.vercel-dns.com`
3. Vercel provisions TLS automatically once DNS propagates.

Note: `.nyc` domains require a New York City nexus (a physical NYC address) to
register — appropriate, given the subject matter.

## Waitlist data

- Stored: email address + signup timestamp, one row per address
  (repeat signups are treated as success, no duplicate rows, no error shown).
- The site promises: "It will not otherwise write to you or share your
  address." Honor that — use the list only for launch notifications.

## Local development

```
cd dnyv && npm install
vercel dev        # or any static server for public/ if you only need the UI
```
