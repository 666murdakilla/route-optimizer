import { createClient } from '@supabase/supabase-js';

// Server-side only: the service role key bypasses RLS and must never be
// shipped to the browser. The waitlist table has RLS enabled with no
// policies, so this function is the only write path.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email || email.length > 320 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('notify: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'Signup is temporarily unavailable' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { error } = await supabase.from('waitlist_signups').insert({ email });

  // 23505 = unique violation: already signed up. Treat as success so the
  // visitor sees the same confirmation instead of an error.
  if (error && error.code !== '23505') {
    console.error('notify: insert failed', error);
    return res.status(500).json({ error: 'Signup failed' });
  }

  return res.status(200).json({ ok: true });
}
