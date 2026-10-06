import { getServiceClient, BUCKET } from '../_supabase.js';
import { requireReviewer } from '../_auth.js';
import { explainResponses } from '../_track2-scoring.js';

// One Track 2 petition in full, with the stored score breakdown and a signed
// (thumbnailed) headshot URL. The score fields live on the row itself.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOC_URL_TTL = 300;

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  const reviewer = await requireReviewer(req, res);
  if (!reviewer) return;
  const id = req.query?.id;
  if (typeof id !== 'string' || !UUID_RE.test(id)) return res.status(400).json({ error: 'Unknown petition' });

  const supabase = getServiceClient();
  const { data: application, error: appErr } = await supabase.from('track2_applications').select('*').eq('id', id).single();
  if (appErr || !application) return res.status(404).json({ error: 'Unknown petition' });

  const { data: docs } = await supabase
    .from('track2_documents')
    .select('id, kind, original_filename, mime_type, size_bytes, storage_path')
    .eq('application_id', id);

  const documents = [];
  for (const d of docs ?? []) {
    const { data: signed, error: e1 } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_path, DOC_URL_TTL);
    let preview_url = null;
    if (!e1 && d.mime_type && d.mime_type.startsWith('image/')) {
      const { data: t, error: e2 } = await supabase.storage.from(BUCKET)
        .createSignedUrl(d.storage_path, DOC_URL_TTL, { transform: { width: 900, height: 900, resize: 'contain' } });
      preview_url = e2 ? null : t.signedUrl;
    }
    documents.push({ id: d.id, kind: d.kind, original_filename: d.original_filename, mime_type: d.mime_type, size_bytes: d.size_bytes, url: e1 ? null : signed.signedUrl, preview_url });
  }
  const answers = explainResponses(application.responses);
  return res.status(200).json({ application, documents, answers });
}
