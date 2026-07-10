-- Waitlist signups for the "Notify me" form on the informational site.
-- Written only by the Vercel serverless function using the service role key.

create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);

-- One row per address, case-insensitive.
create unique index if not exists waitlist_signups_email_idx
  on public.waitlist_signups (lower(email));

-- RLS on with NO policies: anon and authenticated clients can neither read
-- nor write this table. The service role key (server-side only) bypasses RLS.
alter table public.waitlist_signups enable row level security;

revoke all on public.waitlist_signups from anon, authenticated;
