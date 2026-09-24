-- Two additional required questions in the application's "Additional
-- information" section: the worst subway station, and a quintessential
-- New York story from the applicant's life.
alter table public.applications add column if not exists worst_subway_station text;
alter table public.applications add column if not exists ny_story text;

notify pgrst, 'reload schema';
