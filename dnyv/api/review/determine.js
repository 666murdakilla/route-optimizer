import { getServiceClient } from '../_supabase.js';
import { requireReviewer } from '../_auth.js';

// Records a determination against a submitted application. The three
// outcomes match the site's official copy.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OUTCOMES = new Set(['verified', 'denied', 'returned_for_insufficient_suffering']);

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
    .select('id, determination, determined_at')
    .single();
  if (error || !data) {
    console.error('review/determine: update failed', error);
    return res.status(500).json({ error: 'Could not record the determination' });
  }

  return res.status(200).json({ ok: true, determination: data.determination, determined_at: data.determined_at });
}
