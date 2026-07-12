import { createClient } from '@supabase/supabase-js';

// Files in api/ starting with "_" are not exposed as routes by Vercel.
export const BUCKET = 'applicant-documents';
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
