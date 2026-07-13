import { getServiceClient, BUCKET, MAX_FILE_BYTES, ALLOWED_MIME } from './_supabase.js';

// Opens a Track 1 application file: validates the applicant's answers,
// creates a draft application row plus one row per expected document, and
// returns short-lived signed upload URLs so the browser sends the documents
// straight to the private bucket (they never pass through this function).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KINDS = new Set(['high_school_record', 'origin_document']);
const ORIGIN_KINDS = new Set(['birth_certificate', 'school_enrollment']);

function str(v, max) {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null;
}

function safeName(name) {
  const base = String(name).split('/').pop().split('\\').pop();
  return base.replace(/[^\w.-]+/g, '_').slice(-80) || 'document';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const b = req.body ?? {};
  const full_name = str(b.full_name, 200);
  const email = str(b.email, 320)?.toLowerCase() ?? null;
  const phone = b.phone == null || b.phone === '' ? null : str(b.phone, 40);
  const mailing_address = str(b.mailing_address, 500);
  const date_of_birth = typeof b.date_of_birth === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date_of_birth) &&
    !Number.isNaN(Date.parse(b.date_of_birth)) &&
    b.date_of_birth >= '1900-01-01' && Date.parse(b.date_of_birth) < Date.now()
      ? b.date_of_birth : null;
  const high_school = str(b.high_school, 300);
  const best_pizza = str(b.best_pizza, 300);
  const comments = b.comments == null || b.comments === '' ? null : str(b.comments, 2000);
  const origin_kind = ORIGIN_KINDS.has(b.origin_kind) ? b.origin_kind : null;
  const files = Array.isArray(b.files) ? b.files : null;

  if (!full_name || !email || !EMAIL_RE.test(email) || !mailing_address || !date_of_birth ||
      !high_school || !best_pizza || !origin_kind ||
      b.attested !== true || (b.phone && phone === null) ||
      (b.comments && comments === null) || !files) {
    return res.status(400).json({ error: 'Incomplete application' });
  }

  const hsCount = files.filter((f) => f?.kind === 'high_school_record').length;
  const originCount = files.filter((f) => f?.kind === 'origin_document').length;
  const filesValid =
    files.length === hsCount + originCount &&
    hsCount >= 1 && hsCount <= 3 &&
    originCount >= 1 && originCount <= 10 &&
    files.every(
      (f) =>
        KINDS.has(f.kind) &&
        typeof f.name === 'string' && f.name.length >= 1 && f.name.length <= 300 &&
        typeof f.type === 'string' && ALLOWED_MIME.has(f.type) &&
        Number.isInteger(f.size) && f.size > 0 && f.size <= MAX_FILE_BYTES,
    );
  if (!filesValid) {
    return res.status(400).json({ error: 'Documents must be PDF or photographs, up to 20 MB each' });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    console.error('apply: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'Filing is temporarily unavailable' });
  }

  const { data: app, error: appError } = await supabase
    .from('applications')
    .insert({ full_name, email, phone, mailing_address, date_of_birth, high_school, best_pizza, comments, origin_kind })
    .select('id')
    .single();
  if (appError) {
    console.error('apply: application insert failed', appError);
    return res.status(500).json({ error: 'Filing failed' });
  }

  try {
    const uploads = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const path = `${app.id}/${f.kind}/${String(i + 1).padStart(2, '0')}_${safeName(f.name)}`;

      const { error: docError } = await supabase.from('application_documents').insert({
        application_id: app.id,
        kind: f.kind,
        storage_path: path,
        original_filename: String(f.name).slice(0, 300),
        mime_type: f.type,
        size_bytes: f.size,
      });
      if (docError) throw docError;

      const { data: signed, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUploadUrl(path);
      if (signError) throw signError;

      uploads.push({ url: signed.signedUrl });
    }
    return res.status(200).json({ application_id: app.id, uploads });
  } catch (err) {
    console.error('apply: document setup failed', err);
    await supabase.from('applications').delete().eq('id', app.id);
    return res.status(500).json({ error: 'Filing failed' });
  }
}
