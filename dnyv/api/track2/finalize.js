import { getServiceClient, BUCKET } from '../_supabase.js';
import { computeScore } from '../_track2-scoring.js';
import { sendTrack2ApplicationReceived } from '../_email.js';

// Seals a Track 2 petition: confirms the headshot arrived, recomputes the score
// server-side from the stored raw answers (authoritative — the client number is
// never trusted), stores the score + provisional determination, marks the file
// submitted, and sends the confirmation email. Idempotent.
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
    return res.status(400).json({ error: 'Unknown petition' });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    console.error('track2/finalize: missing service credentials');
    return res.status(500).json({ error: 'Filing is temporarily unavailable' });
  }

  const { data: app, error: appError } = await supabase
    .from('track2_applications')
    .select('id, status, file_number, submitted_at, created_at, full_name, email, responses')
    .eq('id', id)
    .single();
  if (appError || !app) {
    return res.status(404).json({ error: 'Unknown petition' });
  }
  if (app.status === 'submitted') {
    const year = new Date(app.submitted_at ?? app.created_at).getFullYear();
    return res.status(200).json({ ok: true, file_number: fileNumber(app.file_number, year) });
  }

  // Confirm the headshot actually landed in the bucket.
  const { data: docs, error: docsError } = await supabase
    .from('track2_documents')
    .select('id, storage_path')
    .eq('application_id', id);
  if (docsError || !docs?.length) {
    console.error('track2/finalize: document lookup failed', docsError);
    return res.status(500).json({ error: 'Filing failed' });
  }
  const folder = docs[0].storage_path.split('/').slice(0, -1).join('/');
  const { data: objects, error: listError } = await supabase.storage.from(BUCKET).list(folder, { limit: 100 });
  if (listError) {
    console.error('track2/finalize: storage list failed', listError);
    return res.status(500).json({ error: 'Filing failed' });
  }
  const present = new Set((objects ?? []).map((o) => `${folder}/${o.name}`));
  if (!docs.every((d) => present.has(d.storage_path))) {
    return res.status(409).json({ error: 'Your photograph did not finish uploading. Try again.' });
  }

  // Authoritative score from the stored raw answers.
  const s = computeScore(app.responses || {});
  const now = new Date().toISOString();

  await supabase.from('track2_documents').update({ uploaded: true }).eq('application_id', id);
  const { error: sealError } = await supabase
    .from('track2_applications')
    .update({
      status: 'submitted',
      submitted_at: now,
      score: s.total,
      suffering_total: s.sufferingTotal,
      tenure_contribution: s.tenureContribution,
      soft_counted: s.softCounted,
      gates: s.gates,
      provisional_determination: s.provisional,
    })
    .eq('id', id);
  if (sealError) {
    console.error('track2/finalize: seal failed', sealError);
    return res.status(500).json({ error: 'Filing failed' });
  }

  const fileNo = fileNumber(app.file_number, new Date(now).getFullYear());

  // Confirmation email — best-effort; never fails the filing. Applicant sees no
  // score or verdict, only that the petition entered the queue.
  try {
    await sendTrack2ApplicationReceived({ to: app.email, name: app.full_name, fileNumber: fileNo });
  } catch (err) {
    console.error('track2/finalize: confirmation email threw', err);
  }

  return res.status(200).json({ ok: true, file_number: fileNo });
}
