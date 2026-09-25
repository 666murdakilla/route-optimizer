import { getServiceClient } from '../_supabase.js';
import { requireReviewer } from '../_auth.js';
import { renderCertificatePdf, certificateFileNumber } from '../_certificate.js';

// Reviewer-only: the one-page Certificate of Verification for a verified
// applicant. PDF generation lives in _certificate.js, shared with the
// verified-determination email, which attaches the same document.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    return res.status(409).json({ error: 'A certificate is issued only for a verified application.' });
  }

  const fileNo = certificateFileNumber(app);
  const pdfBytes = await renderCertificatePdf(app);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileNo}.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  res.end(Buffer.from(pdfBytes));
}
