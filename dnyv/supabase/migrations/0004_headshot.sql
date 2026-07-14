-- Allows a 'headshot' document on Track 1 applications: a photograph of the
-- applicant's face, used to produce the identification card if verified.

alter table public.application_documents
  drop constraint if exists application_documents_kind_check;

alter table public.application_documents
  add constraint application_documents_kind_check
  check (kind in ('high_school_record', 'origin_document', 'headshot'));

notify pgrst, 'reload schema';
