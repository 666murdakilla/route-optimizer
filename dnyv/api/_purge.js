import { BUCKET } from './_supabase.js';

// Evidence kinds that are purged from Storage once a determination is made.
// The headshot is NOT in this list — it is kept (the ID card renders from it),
// and no written field is ever touched.
export const EVIDENCE_KINDS = ['high_school_record', 'origin_document'];

// Deletes the stored evidence files for one application and marks their rows
// purged. Keeps the document rows (so the reviewer can still see that, e.g.,
// two origin documents were uploaded) and never touches the headshot or any
// application field. Best-effort: logs and returns on failure, never throws,
// so a determination/email is never undone by a storage hiccup. Idempotent —
// rows already purged are skipped, so re-running (or a re-determination) is safe.
export async function purgeEvidence(supabase, applicationId) {
  try {
    const { data: docs, error: selErr } = await supabase
      .from('application_documents')
      .select('id, storage_path')
      .eq('application_id', applicationId)
      .in('kind', EVIDENCE_KINDS)
      .is('purged_at', null);
    if (selErr) throw selErr;
    if (!docs || docs.length === 0) return { purged: 0 };

    const paths = docs.map((d) => d.storage_path);
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
    // A missing object is fine (already gone); only a real failure should stop us.
    if (rmErr) throw rmErr;

    const { error: updErr } = await supabase
      .from('application_documents')
      .update({ purged_at: new Date().toISOString() })
      .in('id', docs.map((d) => d.id));
    if (updErr) throw updErr;

    return { purged: docs.length };
  } catch (err) {
    console.error('purgeEvidence: failed for application', applicationId, err);
    return { purged: 0, error: true };
  }
}
