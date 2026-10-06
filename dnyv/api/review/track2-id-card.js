import { getServiceClient } from '../_supabase.js';
import { requireReviewer } from '../_auth.js';
import { renderTrack2IdCardHtml, hasCardIdentity } from '../_id-card.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  const reviewer = await requireReviewer(req, res);
  if (!reviewer) return;
  const id = req.query?.id;
  if (typeof id !== 'string' || !UUID_RE.test(id)) return res.status(400).json({ error: 'Unknown petition' });
  const supabase = getServiceClient();
  const { data: app, error } = await supabase.from('track2_applications').select('*').eq('id', id).single();
  if (error || !app) return res.status(404).json({ error: 'Unknown petition' });
  if (app.determination !== 'verified') return res.status(409).json({ error: 'A card is issued only for a verified petitioner.' });
  if (!hasCardIdentity(app)) return res.status(409).json({ error: 'This record is missing a name or borough required for the card.' });
  const { html, idNumber } = await renderTrack2IdCardHtml(supabase, app);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-DNYV-ID', 'NY' + idNumber);
  res.end(html);
}
