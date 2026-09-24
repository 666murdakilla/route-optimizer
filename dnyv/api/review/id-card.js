import { getServiceClient, BUCKET } from '../_supabase.js';
import { requireReviewer } from '../_auth.js';
import { idTemplate } from '../_id-template.js';

// Generates the New Yorker ID card (front + back) for a verified applicant as a
// fully-filled HTML document. The reviewer console opens it and prints to PDF —
// the card's gradients, web fonts and auto-fit need a real browser to render.
// Reviewer-only; the 9-digit ID number is assigned on first issuance and stored.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BOROUGHS = {
  manhattan: { name: 'MANHATTAN', code: 'MAN' },
  brooklyn: { name: 'BROOKLYN', code: 'BKN' },
  queens: { name: 'QUEENS', code: 'QNS' },
  bronx: { name: 'THE BRONX', code: 'BRX' },
  staten_island: { name: 'STATEN IS.', code: 'STI' },
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ICAO 9303 check digit (weights 7,3,1). '<' = 0, A-Z = 10-35.
function checkDigit(strv) {
  const w = [7, 3, 1];
  let sum = 0;
  [...strv].forEach((ch, i) => {
    const v = ch === '<' ? 0 : /[0-9]/.test(ch) ? +ch : ch.charCodeAt(0) - 55;
    sum += v * w[i % 3];
  });
  return String(sum % 10);
}
const mrzText = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '<');
const pad = (s, n = 30) => (s + '<'.repeat(n)).slice(0, n);
const parseISO = (iso) => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; };
const usDate = ({ y, m, d }) => String(m).padStart(2, '0') + '/' + String(d).padStart(2, '0') + '/' + y;
const yymmdd = ({ y, m, d }) => String(y).slice(2) + String(m).padStart(2, '0') + String(d).padStart(2, '0');

function buildTokens(a) {
  const digits = String(a.id_number).replace(/\D/g, '');
  const b = BOROUGHS[a.borough];
  const t2 = Number(a.track) === 2;
  const dob = parseISO(a.dob), ver = parseISO(a.verified_date);
  const exp = t2 ? { ...ver, y: ver.y + 10 } : null;

  const l1 = pad('NYV9' + b.code + digits);
  const dobF = yymmdd(dob) + checkDigit(yymmdd(dob));
  const expF = exp ? yymmdd(exp) + checkDigit(yymmdd(exp)) : '<<<<<<<';
  const l2 = pad(dobF + '<' + expF + b.code, 29) + checkDigit(digits + dobF + expF);
  const l3 = pad(mrzText(a.surname) + '<<' + mrzText(a.given_names));

  return {
    id_display: 'NY' + digits[0] + ' · ' + digits.slice(1, 5) + ' · ' + digits.slice(5),
    id_compact: 'NY' + digits,
    borough_code: b.code,
    borough: b.name,
    surname: a.surname.toUpperCase(),
    given_names: a.given_names.toUpperCase(),
    signature_name: a.signature_name ?? (a.given_names.split(' ')[0] + ' ' + a.surname),
    dob: usDate(dob),
    verified_date: usDate(ver),
    expires: exp ? usDate(exp) : 'NEVER',
    basis: t2 ? 'EXPER.' : 'ORIGIN',
    track_chip: t2 ? 'Track 2' : 'Track 1',
    status: (a.status ?? 'verified').toUpperCase(),
    permanence: t2
      ? 'Track 2 status is renewable every ten years upon continued residence and Tribulation.'
      : 'Track 1 status is permanent and survives departure from the city.',
    mrz1: l1, mrz2: l2, mrz3: l3,
    photo_src: a.photo_src,
    hologram_display: a.hologram === false ? 'none' : 'flex',
  };
}
const fillTemplate = (tpl, tokens) => tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in tokens ? esc(tokens[k]) : m));

async function uniqueIdNumber(supabase) {
  for (let i = 0; i < 20; i++) {
    const n = String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
    const { data } = await supabase.from('applications').select('id').eq('id_number', n).maybeSingle();
    if (!data) return n;
  }
  throw new Error('could not allocate id_number');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const reviewer = await requireReviewer(req, res);
  if (!reviewer) return;

  const id = req.query?.id;
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    return res.status(400).json({ error: 'Unknown application' });
  }

  const supabase = getServiceClient();
  const { data: app, error: appErr } = await supabase.from('applications').select('*').eq('id', id).single();
  if (appErr || !app) return res.status(404).json({ error: 'Unknown application' });
  if (app.determination !== 'verified') {
    return res.status(409).json({ error: 'A card is issued only for a verified applicant.' });
  }
  if (!app.given_names || !app.surname || !app.borough || !BOROUGHS[app.borough]) {
    return res.status(409).json({ error: 'This record is missing a name or borough required for the card.' });
  }

  // Assign a stable 9-digit ID number on first issuance.
  let idNumber = app.id_number;
  if (!idNumber) {
    idNumber = await uniqueIdNumber(supabase);
    const { error: setErr } = await supabase.from('applications').update({ id_number: idNumber }).eq('id', id);
    if (setErr) { console.error('id-card: id_number assign failed', setErr); return res.status(500).json({ error: 'Could not assign an ID number' }); }
  }

  // Headshot -> data URI so the print window never waits on a remote fetch.
  let photo_src = 'https://placehold.co/512x640/dfe3ea/13306B?text=PHOTO';
  const { data: hsDoc } = await supabase
    .from('application_documents')
    .select('storage_path, mime_type')
    .eq('application_id', id).eq('kind', 'headshot').limit(1).single();
  if (hsDoc) {
    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(hsDoc.storage_path);
    if (!dlErr && blob) {
      const b64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
      photo_src = `data:${hsDoc.mime_type};base64,${b64}`;
    }
  }

  const applicant = {
    id_number: idNumber,
    surname: app.surname,
    given_names: app.given_names,
    dob: app.date_of_birth,
    verified_date: String(app.determined_at || app.submitted_at).slice(0, 10),
    borough: app.borough,
    track: 1,
    status: 'verified',
    hologram: true,
    photo_src,
  };

  const html = fillTemplate(idTemplate(), buildTokens(applicant));
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-DNYV-ID', 'NY' + idNumber);
  res.end(html);
}
