import { getServiceClient } from '../_supabase.js';
import { requireReviewer } from '../_auth.js';

// Track 2 review queue: every submitted petition, newest first.
export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  const reviewer = await requireReviewer(req, res);
  if (!reviewer) return;
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('track2_applications')
    .select('id, file_number, full_name, submitted_at, status, score, provisional_determination, determination, determined_at')
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false });
  if (error) { console.error('track2/list: query failed', error); return res.status(500).json({ error: 'Could not load the queue' }); }
  return res.status(200).json({ applications: data });
}
