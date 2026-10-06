import { randomBytes } from 'node:crypto';
import { getServiceClient } from '../_supabase.js';
import { requireReviewer } from '../_auth.js';
import { renderCertificatePdf, certificateFileNumber } from '../_certificate.js';
import { ensureTrack2IdNumber } from '../_id-card.js';
import { sendTrack2Verified, sendTrack2Denied, sendTrack2Returned, sendTrack2Disqualified } from '../_email.js';

// Records a determination on a submitted Track 2 petition and notifies the
// petitioner. Four outcomes (Track 2 adds Disqualified, from a flag item).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OUTCOMES = new Set(['verified', 'denied', 'returned_for_insufficient_suffering', 'disqualified']);

// On preview the card link must point at this (protected) deployment so it
// can be reviewed end-to-end; on production it uses the public domain.
function baseUrl() {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  if (process.env.VERCEL_ENV !== 'production' && process.env.VERCEL_URL) return 'https://' + process.env.VERCEL_URL;
  return 'https://dnyv.nyc';
}

async function notify(supabase, app) {
  const fileNumber = certificateFileNumber(app);
  try {
    if (app.determination === 'verified') {
      await ensureTrack2IdNumber(supabase, app);
      let token = app.id_card_token;
      if (!token) {
        token = randomBytes(24).toString('base64url');
        const { error } = await supabase.from('track2_applications').update({ id_card_token: token }).eq('id', app.id);
        if (error) throw new Error('id_card_token assign failed: ' + error.message);
        app.id_card_token = token;
      }
      app.track = 2;
      const certPdf = await renderCertificatePdf(app);
      await sendTrack2Verified({ to: app.email, name: app.full_name, fileNumber, cardUrl: `${baseUrl()}/t2/id/${token}`, certPdf });
    } else if (app.determination === 'denied') {
      await sendTrack2Denied({ to: app.email, name: app.full_name, fileNumber, note: app.determination_notes });
    } else if (app.determination === 'returned_for_insufficient_suffering') {
      await sendTrack2Returned({ to: app.email, name: app.full_name, fileNumber, note: app.determination_notes });
    } else if (app.determination === 'disqualified') {
      await sendTrack2Disqualified({ to: app.email, name: app.full_name, fileNumber, note: app.determination_notes });
    }
  } catch (err) {
    console.error('track2/determine: notification failed', err);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
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
    .from('track2_applications')
    .update({ determination, determination_notes: notes, determined_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'submitted')
    .select('*')
    .single();
  if (error || !data) {
    console.error('track2/determine: update failed', error);
    return res.status(500).json({ error: 'Could not record the determination' });
  }

  await notify(supabase, data);
  return res.status(200).json({ ok: true, determination: data.determination, determined_at: data.determined_at });
}
