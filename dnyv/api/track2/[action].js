// Single catch-all serverless function for the entire Track 2 surface.
//
// All Track 2 handlers live under api/_track2/ (an underscore folder Vercel
// does not turn into functions) and are dispatched here by the `action` path
// segment. This keeps the whole project at or under the Hobby-plan ceiling of
// 12 Serverless Functions per deployment while leaving Track 1 untouched.
//
//   POST /api/track2/apply               -> intake step 1 (draft + upload URL)
//   POST /api/track2/finalize            -> intake step 2 (seal + score + email)
//   GET  /api/track2/card                -> public token-gated ID card
//   GET  /api/track2/review-list         -> reviewer queue
//   GET  /api/track2/review-application  -> one petition in full
//   GET  /api/track2/review-id-card      -> reviewer ID-card render
//   GET  /api/track2/review-certificate  -> reviewer certificate PDF
//   POST /api/track2/review-determine    -> record determination + notify
import apply from '../_track2/apply.js';
import finalize from '../_track2/finalize.js';
import card from '../_track2/card.js';
import reviewList from '../_track2/review-list.js';
import reviewApplication from '../_track2/review-application.js';
import reviewIdCard from '../_track2/review-id-card.js';
import reviewCertificate from '../_track2/review-certificate.js';
import reviewDetermine from '../_track2/review-determine.js';

const ROUTES = {
  apply,
  finalize,
  card,
  'review-list': reviewList,
  'review-application': reviewApplication,
  'review-id-card': reviewIdCard,
  'review-certificate': reviewCertificate,
  'review-determine': reviewDetermine,
};

export default function handler(req, res) {
  const fn = ROUTES[req.query?.action];
  if (!fn) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Not found' }));
  }
  return fn(req, res);
}
