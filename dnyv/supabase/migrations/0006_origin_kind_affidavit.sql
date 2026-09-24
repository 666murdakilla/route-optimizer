-- Accept supporting affidavits as a proof-of-origin kind, alongside a
-- borough birth certificate and continuous NYC school-enrollment records.
alter table public.applications drop constraint if exists applications_origin_kind_check;
alter table public.applications add constraint applications_origin_kind_check
  check (origin_kind in ('birth_certificate', 'school_enrollment', 'affidavit'));

notify pgrst, 'reload schema';
