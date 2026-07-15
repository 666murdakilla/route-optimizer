# DNYV — Data Handling & Retention Notes

The Track 1 application flow collects **government-ID-grade personal records** about
real people: full name, date of birth, mailing address, email/phone, a headshot
photograph, and uploaded documents (borough birth certificates, NYC school
enrollment/transcript records). Treat this data as sensitive PII regardless of the
site's satirical framing — the documents are real.

This document describes where the data lives, how it's protected today, and what you
should decide about retention.

## Where the data lives

| Data | Location | Access |
|---|---|---|
| Applicant fields (name, DOB, address, email, phone, pizza, comments, determination) | Supabase Postgres, `public.applications` | Service-role key only (server-side). RLS on, no policies → not readable with the public/anon key. |
| Document metadata (filenames, types, storage paths) | Supabase Postgres, `public.application_documents` | Same as above. |
| Uploaded documents + headshots | Supabase Storage, private bucket `applicant-documents` | Private bucket, no public URLs. Reviewer views them only through short-lived signed URLs (5-min expiry). |
| Waitlist emails | Supabase Postgres, `public.waitlist_signups` | Service-role key only; RLS on, no policies. |

Nothing in the applicant or document tables is queryable by the public anon key — I
verified this against production (an anon read returns `permission denied`, and a
public fetch of a document URL returns an error, not the file).

## Who can access it

- **The serverless functions** (Vercel), via the `SUPABASE_SERVICE_ROLE_KEY`. This key
  bypasses all row-level security and can read/write everything. It exists only as an
  encrypted environment variable in Vercel — never ship it to the browser.
- **The reviewer** (you), via magic-link login to `/review`. Open sign-ups are
  disabled and you are the only pre-registered reviewer, so no one else can log in.
- **Anyone with dashboard access** to the Supabase project or the Vercel project.
  Guard those logins (use a strong password + 2FA on both accounts).
- **Personal access tokens** (Supabase/Vercel/Resend) used to build this. Treat these
  as keys to the whole system — see "Token hygiene" below.

## Retention policy (decided)

Every application is kept for **at least 90 days**. After a determination is reached and
90 days have passed:

- **Delete the source documents and the headshot** the applicant uploaded (birth
  certificate / enrollment records / high school record / photo).
- **Retain a minimal register entry:** name, file number, date, and outcome.
- **Retain the issued certificate and DNYV identification card** for verified applicants.
- **Waitlist emails:** kept until Track 2 opens or until someone asks to be removed.
- **Abandoned drafts** (`status='draft'`, documents never finished uploading): delete
  periodically; they hold no readable documents.

The public Privacy Notice on the site states this policy to applicants.

### Implementation note — required before the purge can run

The certificate and ID card are currently generated **on demand** from the applicant's
data **and their headshot**; nothing is stored. To satisfy "retain the certificate and
ID after deleting the photograph," the system must **persist the generated certificate
PDF at the moment of verification** (the headshot is baked into that PDF), so the source
photo can then be safely deleted while the ID lives on inside the stored certificate.

So the retention automation has two parts, neither built yet:
1. **On `Verified`:** generate and store the certificate PDF in a private bucket keyed to
   the application, so it survives source-document deletion.
2. **A scheduled purge job** (e.g. a daily Vercel Cron or Supabase scheduled function)
   that finds applications determined more than 90 days ago, deletes their source
   documents + headshot from storage, clears the document rows, and keeps the register
   fields + stored certificate.

Until that automation exists, apply the policy **manually** using the two-step deletion
below. Data minimization is the principle: keep the least you need, for the shortest time.

## Deleting data correctly (two steps)

Deleting a database row does **not** delete the files in storage — they are separate
systems. To fully remove an application you must delete both:

1. Remove the objects from the `applicant-documents` bucket (by their storage paths).
2. Delete the row(s) from `applications` (a cascade removes `application_documents`).

(The build/test process used exactly this two-step cleanup after every live test.)

**Backups:** Supabase keeps automated backups of the database. After you delete a row,
copies may persist in those backups for the backup retention window (plan-dependent)
before aging out. Factor this in if someone requests full erasure — plan to confirm
once backups have rotated.

## Handling & privacy practices

- **Publish a privacy notice.** If real people submit real documents, tell them what
  you collect, why, how long you keep it, and how to request deletion. The site
  currently has no privacy policy; add one before promoting the application flow widely.
- **Honor deletion requests.** Be ready to remove an individual's data on request
  (both DB rows and storage objects, per above).
- **Signed URLs are short-lived (5 min)** and reviewer-only — don't paste them into
  places where they'd be logged or shared; they grant temporary read access to a
  private document.
- **Least-privilege dashboards.** Only you should have Supabase/Vercel access. If you
  ever add a helper, give them the narrowest role that works.
- **Breach basics.** A leak of this bucket would expose government IDs. The private
  bucket + RLS + service-role-only design is specifically to prevent that. The main
  residual risks are (a) the service-role key leaking, and (b) someone gaining dashboard
  access — protect both.

## Token hygiene

The Supabase/Vercel/Resend personal access tokens used during the build are full-power
credentials. Once you're done making changes:

- **Supabase access token:** revoke it at supabase.com/dashboard/account/tokens. The
  live site keeps running — it uses its own scoped keys stored in Vercel, not this token.
- **Vercel tokens:** short-lived ones expire on their own; delete any others at
  vercel.com/account/tokens.
- **Resend API key:** it was pasted in chat, so consider rolling it (delete + recreate)
  and updating `RESEND_API_KEY` in Vercel once email work is settled.
- The **service-role key** and **anon key** live only in Vercel env vars and are what
  the running site actually uses. If the service-role key is ever exposed, rotate it in
  Supabase and update the Vercel env var.

## What's NOT in place (future hardening, if you want it)

- Automatic retention/expiry (a scheduled job to purge old documents) — not built.
- An audit log of which documents the reviewer viewed and when — not built.
- A public privacy policy page — not built.
- Encryption of documents at rest beyond Supabase's own storage encryption — not built
  (Supabase encrypts at rest by default; add application-level encryption only if you
  have a specific threat model that needs it).

None of these are required for the system to work; they're the difference between "works
and is reasonably locked down" (where it is now) and "run like a records office."
