import { randomBytes } from 'node:crypto';
import { getServiceClient } from '../_supabase.js';
import { requireReviewer } from '../_auth.js';
import { renderCertificatePdf, certificateFileNumber } from '../_certificate.js';
import { ensureIdNumber } from '../_id-card.js';
import { sendVerified, sendDenied, sendReturned } from '../_email.js';

// Records a determination against a submitted application and notifies the
// applicant. The three outcomes match the site's official copy.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OUTCOMES = new Set(['verified', 'denied', 'returned_for_insufficient_suffering']);
const BASE = process.env.PUBLIC_BASE_URL || 'https://dnyv.nyc';

// Best-effort notification for a determination. Never throws — a mail failure
// must not undo a recorded determination.
async function notify(supabase, app) {
  const fileNumber = certificateFileNumber(app);
  try {
    if (app.determination === 'verified') {
      await ensureIdNumber(supabase, app); // assigns app.id_number if missing
      let token = app.id_card_token;
      if (!token) {
        token = randomBytes(24).toString('base64url');
        const { error } = await supabase.from('applications').update({ id_card_token: token }).eq('id', app.id);
        if (error) throw new Error('id_card_token assign failed: ' + error.message);
        app.id_card_token = token;
      }
      const certPdf = await renderCertificatePdf(app);
      await sendVerified({ to: app.email, name: app.full_name, fileNumber, cardUrl: `${BASE}/id/${token}`, certPdf });
    } else if (app.determination === 'denied') {
      await sendDenied({ to: app.email, name: app.full_name, fileNumber, note: app.determination_notes });
    } else if (app.determination === 'returned_for_insufficient_suffering') {
      await sendReturned({ to: app.email, name: app.full_name, fileNumber, note: app.determination_notes });
    }
  } catch (err) {
    console.error('review/determine: notification failed', err);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const reviewer = await requireReviewer(req, res);
  if (!reviewer) return;

  const id = req.body?.application_id;
  const determination = req.body?.determination;
  const notesRaw = req.body?.notes;
  if (typeof id !== 'string' || !UUID_RE.test(id) || !OUTCOMES.has(determination)) {
    return res.status(400).json({ error: 'Invalid determination' });
  }
  const notes = typeof notesRaw === 'string' && notesRaw.trim() ? notesRaw.trim().slice(0, 4000) : null;

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('applications')
    .update({
      determination,
      determination_notes: notes,
      determined_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'submitted')
    .select('*')
    .single();
  if (error || !data) {
    console.error('review/determine: update failed', error);
    return res.status(500).json({ error: 'Could not record the determination' });
  }

  await notify(supabase, data);

  return res.status(200).json({ ok: true, determination: data.determination, determined_at: data.determined_at });
}
