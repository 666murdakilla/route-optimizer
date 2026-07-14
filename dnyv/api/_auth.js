import { getServiceClient } from './_supabase.js';

// Verifies the caller is a signed-in reviewer on the allowlist.
// Returns the user object, or null after writing a 401/403 response.
// Every /api/review/* route calls this first.
export async function requireReviewer(req, res) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }

  const supabase = getServiceClient();
  if (!supabase) {
    console.error('auth: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    res.status(500).json({ error: 'Authentication unavailable' });
    return null;
  }

  // Validates the JWT against Supabase (signature + expiry) and returns the user.
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.email) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }

  const allow = (process.env.REVIEWER_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allow.includes(data.user.email.toLowerCase())) {
    res.status(403).json({ error: 'Not authorized' });
    return null;
  }

  return data.user;
}
