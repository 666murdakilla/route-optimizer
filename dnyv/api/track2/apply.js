import { getServiceClient, BUCKET, MAX_FILE_BYTES, HEADSHOT_MIME } from '../_supabase.js';
import { normalizeResponses } from '../_track2-scoring.js';

// Opens a Track 2 (Verification by Experience) application: validates the
// petitioner's identity + free-text answers + raw item responses, creates a
// draft row plus one headshot document row, and returns a short-lived signed
// upload URL so the browser sends the headshot straight to the private bucket.
// Track 2 is honor-system: the ONLY upload is the headshot (for the ID card).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BOROUGHS = new Set(['manhattan', 'brooklyn', 'queens', 'bronx', 'staten_island']);

// Open automatically on preview deployments (protected URLs, for review);
// stays closed on production until TRACK2_OPEN=true is set.
function isOpen() {
  return process.env.TRACK2_OPEN === 'true' || process.env.VERCEL_ENV === 'preview';
}

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
  if (!isOpen()) {
    return res.status(403).json({ error: 'Track 2 is not yet open.' });
  }

  const b = req.body ?? {};
  const given_names = str(b.given_names, 60);
  const surname = str(b.surname, 40);
  const full_name = given_names && surname ? `${given_names} ${surname}`.slice(0, 200) : null;
  const borough = BOROUGHS.has(b.borough) ? b.borough : null;
  const email = str(b.email, 320)?.toLowerCase() ?? null;
  const phone = b.phone == null || b.phone === '' ? null : str(b.phone, 40);
  const date_of_birth =
    typeof b.date_of_birth === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date_of_birth) &&
    !Number.isNaN(Date.parse(b.date_of_birth)) &&
    b.date_of_birth >= '1900-01-01' && Date.parse(b.date_of_birth) < Date.now()
      ? b.date_of_birth : null;
  const best_pizza = str(b.best_pizza, 300);
  const worst_subway_station = str(b.worst_subway_station, 300);
  const ny_story = str(b.ny_story, 4000);
  const comments = b.comments == null || b.comments === '' ? null : str(b.comments, 2000);
  const responses = normalizeResponses(b.responses);
  const headshot = b.headshot && typeof b.headshot === 'object' ? b.headshot : null;

  const headshotValid =
    headshot &&
    typeof headshot.name === 'string' && headshot.name.length >= 1 && headshot.name.length <= 300 &&
    typeof headshot.type === 'string' && HEADSHOT_MIME.has(headshot.type) &&
    Number.isInteger(headshot.size) && headshot.size > 0 && headshot.size <= MAX_FILE_BYTES;

  if (!given_names || !surname || !full_name || !borough || !email || !EMAIL_RE.test(email) ||
      !date_of_birth || !best_pizza || !worst_subway_station || !ny_story || ny_story.length < 20 ||
      (b.phone && phone === null) || (b.comments && comments === null) ||
      b.attested !== true || !headshotValid) {
    return res.status(400).json({ error: 'Incomplete petition' });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    console.error('track2/apply: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'Filing is temporarily unavailable' });
  }

  const { data: app, error: appError } = await supabase
    .from('track2_applications')
    .insert({ full_name, given_names, surname, borough, email, phone, date_of_birth,
              best_pizza, worst_subway_station, ny_story, comments, responses })
    .select('id')
    .single();
  if (appError) {
    console.error('track2/apply: insert failed', appError);
    return res.status(500).json({ error: 'Filing failed' });
  }

  try {
    const path = `track2/${app.id}/headshot/01_${safeName(headshot.name)}`;
    const { error: docError } = await supabase.from('track2_documents').insert({
      application_id: app.id,
      kind: 'headshot',
      storage_path: path,
      original_filename: String(headshot.name).slice(0, 300),
      mime_type: headshot.type,
      size_bytes: headshot.size,
    });
    if (docError) throw docError;

    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (signError) throw signError;

    return res.status(200).json({ application_id: app.id, upload: { url: signed.signedUrl } });
  } catch (err) {
    console.error('track2/apply: headshot setup failed', err);
    await supabase.from('track2_applications').delete().eq('id', app.id);
    return res.status(500).json({ error: 'Filing failed' });
  }
}
