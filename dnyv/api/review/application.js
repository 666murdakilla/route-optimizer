import { getServiceClient, BUCKET } from '../_supabase.js';
import { requireReviewer } from '../_auth.js';

// One application in full, with short-lived signed URLs for each document
// so the reviewer can view them inline. URLs expire in 5 minutes.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOC_URL_TTL = 300;

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
  const { data: application, error: appError } = await supabase
    .from('applications')
    .select('*')
    .eq('id', id)
    .single();
  if (appError || !application) {
    return res.status(404).json({ error: 'Unknown application' });
  }

  const { data: docs, error: docsError } = await supabase
    .from('application_documents')
    .select('id, kind, original_filename, mime_type, size_bytes, storage_path')
    .eq('application_id', id)
    .order('storage_path');
  if (docsError) {
    console.error('review/application: document query failed', docsError);
    return res.status(500).json({ error: 'Could not load documents' });
  }

  const documents = [];
  for (const d of docs ?? []) {
    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(d.storage_path, DOC_URL_TTL);
    documents.push({
      id: d.id,
      kind: d.kind,
      original_filename: d.original_filename,
      mime_type: d.mime_type,
      size_bytes: d.size_bytes,
      url: signError ? null : signed.signedUrl,
    });
  }

  return res.status(200).json({ application, documents });
}
