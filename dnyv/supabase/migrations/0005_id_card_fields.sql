-- Fields the New Yorker ID card needs that the application didn't collect:
-- a first/last name split, borough, and a unique 9-digit ID number
-- (assigned when a card is first issued).

alter table public.applications add column if not exists given_names text;
alter table public.applications add column if not exists surname text;
alter table public.applications add column if not exists borough text
  check (borough in ('manhattan','brooklyn','queens','bronx','staten_island'));
alter table public.applications add column if not exists id_number text;
create unique index if not exists applications_id_number_key
  on public.applications (id_number) where id_number is not null;

-- Backfill the name split on existing rows: last whitespace token = surname, rest = given names.
update public.applications
set given_names = coalesce(given_names,
      case when position(' ' in btrim(full_name)) > 0
           then btrim(substring(btrim(full_name) from 1 for length(btrim(full_name)) - position(' ' in reverse(btrim(full_name)))))
           else btrim(full_name) end),
    surname = coalesce(surname,
      case when position(' ' in btrim(full_name)) > 0
           then btrim(substring(btrim(full_name) from length(btrim(full_name)) - position(' ' in reverse(btrim(full_name))) + 2))
           else btrim(full_name) end)
where full_name is not null and (given_names is null or surname is null);

notify pgrst, 'reload schema';
