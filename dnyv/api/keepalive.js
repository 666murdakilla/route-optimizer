import { getServiceClient } from './_supabase.js';

// Daily Vercel Cron ping (see vercel.json "crons"). A trivial query keeps the
// Supabase project from auto-pausing after inactivity on the free tier.
// Returns no data. Safe to remove once the project is on a paid plan.
export default async function handler(req, res) {
  const supabase = getServiceClient();
  if (!supabase) {
    console.error('keepalive: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ ok: false });
  }
  const { error } = await supabase
    .from('waitlist_signups')
    .select('email', { count: 'exact', head: true });
  if (error) {
    console.error('keepalive: query failed', error);
    return res.status(500).json({ ok: false });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, ts: new Date().toISOString() });
}
