import { getServiceClient, BUCKET } from './_supabase.js';

// Seals a Track 1 application: verifies that every expected document actually
// arrived in the private bucket, then marks the file submitted and returns
// the official file number. Idempotent — retrying a sealed file returns the
// same file number.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fileNumber(n, year) {
  return `DNYV-${year}-${String(n).padStart(6, '0')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = req.body?.application_id;
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    return res.status(400).json({ error: 'Unknown application' });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    console.error('apply-finalize: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'Filing is temporarily unavailable' });
  }

  const { data: app, error: appError } = await supabase
    .from('applications')
    .select('id, status, file_number, submitted_at, created_at')
    .eq('id', id)
    .single();
  if (appError || !app) {
    return res.status(404).json({ error: 'Unknown application' });
  }
  if (app.status === 'submitted') {
    const year = new Date(app.submitted_at ?? app.created_at).getFullYear();
    return res.status(200).json({ ok: true, file_number: fileNumber(app.file_number, year) });
  }

  const { data: docs, error: docsError } = await supabase
    .from('application_documents')
    .select('id, kind, storage_path')
    .eq('application_id', id);
  if (docsError || !docs?.length) {
    console.error('apply-finalize: document lookup failed', docsError);
    return res.status(500).json({ error: 'Filing failed' });
  }

  // The storage list API is per-folder; each application has at most two.
  const present = new Set();
  for (const folder of new Set(docs.map((d) => d.storage_path.split('/').slice(0, -1).join('/')))) {
    const { data: objects, error: listError } = await supabase.storage
      .from(BUCKET)
      .list(folder, { limit: 100 });
    if (listError) {
      console.error('apply-finalize: storage list failed', listError);
      return res.status(500).json({ error: 'Filing failed' });
    }
    for (const o of objects ?? []) present.add(`${folder}/${o.name}`);
  }

  const missing = docs.filter((d) => !present.has(d.storage_path));
  if (missing.length > 0) {
    return res.status(409).json({ error: 'Some documents did not finish uploading. Try again.' });
  }

  const now = new Date().toISOString();
  const { error: sealDocsError } = await supabase
    .from('application_documents')
    .update({ uploaded: true })
    .eq('application_id', id);
  const { error: sealError } = await supabase
    .from('applications')
    .update({ status: 'submitted', submitted_at: now })
    .eq('id', id);
  if (sealDocsError || sealError) {
    console.error('apply-finalize: seal failed', sealDocsError || sealError);
    return res.status(500).json({ error: 'Filing failed' });
  }

  return res.status(200).json({
    ok: true,
    file_number: fileNumber(app.file_number, new Date(now).getFullYear()),
  });
}
