import { getServiceClient } from './_supabase.js';
import { renderIdCardHtml, hasCardIdentity } from './_id-card.js';

// Public, token-gated New Yorker ID card. The link is emailed to a verified
// applicant and carries an unguessable per-file token (id_card_token). The card
// renders and prints from the recipient's own browser, exactly as the reviewer
// console does. No session required — the token is the credential.
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

function notFound(res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link not valid</title></head><body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;color:#111;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;"><div style="max-width:420px;text-align:center;"><div style="color:#050560;font-weight:600;font-size:18px;">Department of New Yorker Verification</div><p style="color:#555;line-height:1.6;margin-top:16px;">This identification-card link is not valid. It may have been mistyped or superseded. For assistance, write to <a href="mailto:verify@dnyv.nyc" style="color:#103FEF;">verify@dnyv.nyc</a>.</p></div></body></html>`);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.query?.t;
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return notFound(res);

  const supabase = getServiceClient();
  if (!supabase) { res.statusCode = 500; return res.end('Service unavailable'); }

  const { data: app } = await supabase
    .from('applications').select('*').eq('id_card_token', token).maybeSingle();
  if (!app || app.determination !== 'verified' || !hasCardIdentity(app)) return notFound(res);

  const { html } = await renderIdCardHtml(supabase, app);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.end(html);
}
