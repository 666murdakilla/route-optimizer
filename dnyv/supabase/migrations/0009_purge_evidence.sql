-- Evidence uploads (high-school record, proof of origin) are purged from
-- Storage once a determination is made — they serve no purpose after review.
-- The row is kept as a record that the document existed (and was later
-- purged); only the stored file is removed. purged_at marks when that
-- happened. The headshot and all written fields are never purged.
alter table public.application_documents
  add column if not exists purged_at timestamptz;
