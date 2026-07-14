-- Adds applicant fields collected on the Track 1 form: mailing address,
-- date of birth, best pizza, and free-text comments.
--
-- Idempotent and ordering-safe: on a fresh database migration 0002 already
-- declares these columns and each ADD COLUMN IF NOT EXISTS is a no-op; on a
-- database created from an earlier 0002 (before these fields existed) this
-- backfills them. NOT NULL is applied after the columns are added so the
-- statement succeeds whether or not rows are present.

alter table public.applications add column if not exists mailing_address text;
alter table public.applications add column if not exists date_of_birth date;
alter table public.applications add column if not exists best_pizza text;
alter table public.applications add column if not exists comments text;

do $$
begin
  if not exists (select 1 from public.applications) then
    alter table public.applications alter column mailing_address set not null;
    alter table public.applications alter column date_of_birth set not null;
    alter table public.applications alter column best_pizza set not null;
  end if;
end $$;

notify pgrst, 'reload schema';
