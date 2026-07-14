// Public browser config for the review page: the Supabase URL and the
// anon (publishable) key. Both are safe to expose — the anon key is
// designed to ship in browsers, and every table has RLS with no policies,
// so it can read nothing on its own. Auth flows use it to request and
// verify magic links.
export default function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return res.status(500).json({ error: 'Not configured' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ url, anonKey });
}
