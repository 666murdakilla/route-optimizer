-- Per-file, unguessable token for the public "view your ID card" link emailed
-- to verified applicants. Assigned when the verified determination is recorded.
alter table public.applications add column if not exists id_card_token text;
create unique index if not exists applications_id_card_token_key
  on public.applications (id_card_token) where id_card_token is not null;

notify pgrst, 'reload schema';
