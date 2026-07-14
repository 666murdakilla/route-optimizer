import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { getServiceClient, BUCKET } from '../_supabase.js';
import { requireReviewer } from '../_auth.js';
import { SEAL_PNG_B64, FONT_DISPLAY_B64, FONT_BODY_B64, b64ToBytes } from '../_pdf-assets.js';

// Generates the Certificate of Verification + identification card (one PDF)
// for a verified applicant. Reviewer-only; regenerated on demand.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NAVY = rgb(0x05 / 255, 0x05 / 255, 0x60 / 255);
const BLUE = rgb(0x10 / 255, 0x3f / 255, 0xef / 255);
const INK = rgb(0.06, 0.06, 0.06);
const GRAY = rgb(0.42, 0.42, 0.42);
const WHITE = rgb(1, 1, 1);

function fileNumber(app) {
  const y = new Date(app.submitted_at || app.determined_at || Date.now()).getFullYear();
  return `DNYV-${y}-${String(app.file_number).padStart(6, '0')}`;
}
function longDate(s) {
  return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
}
function dob(s) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

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

  // headshot bytes from the private bucket
  let headshot = null;
  const { data: hsDoc } = await supabase
    .from('application_documents')
    .select('storage_path, mime_type')
    .eq('application_id', id).eq('kind', 'headshot').limit(1).single();
  if (hsDoc) {
    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(hsDoc.storage_path);
    if (!dlErr && blob) headshot = { bytes: new Uint8Array(await blob.arrayBuffer()), mime: hsDoc.mime_type };
  }

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const display = await pdf.embedFont(b64ToBytes(FONT_DISPLAY_B64));
  const body = await pdf.embedFont(b64ToBytes(FONT_BODY_B64));
  const seal = await pdf.embedPng(b64ToBytes(SEAL_PNG_B64));

  const fileNo = fileNumber(app);

  // ---- helpers ----
  const centerText = (page, text, y, font, size, color) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (page.getWidth() - w) / 2, y, size, font, color });
  };
  const wrapCenter = (page, text, yStart, font, size, color, lineH, maxW) => {
    const words = text.split(' ');
    let line = '', y = yStart;
    const flush = () => { if (line) { centerText(page, line, y, font, size, color); y -= lineH; line = ''; } };
    for (const word of words) {
      const trial = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(trial, size) > maxW && line) { flush(); line = word; }
      else line = trial;
    }
    flush();
    return y;
  };

  // ================= PAGE 1 — CERTIFICATE =================
  const c = pdf.addPage([612, 792]);
  const W = 612;
  c.drawRectangle({ x: 34, y: 34, width: W - 68, height: 792 - 68, borderColor: NAVY, borderWidth: 2 });
  c.drawRectangle({ x: 42, y: 42, width: W - 84, height: 792 - 84, borderColor: NAVY, borderWidth: 0.8 });

  const sealSize = 116;
  c.drawImage(seal, { x: (W - sealSize) / 2, y: 792 - 78 - sealSize, width: sealSize, height: sealSize });

  let y = 792 - 78 - sealSize - 26;
  centerText(c, 'CITY OF NEW YORK', y, body, 10, GRAY); y -= 15;
  centerText(c, 'DEPARTMENT OF NEW YORKER VERIFICATION', y, display, 12.5, NAVY); y -= 40;
  centerText(c, 'Certificate of Verification', y, display, 30, INK); y -= 22;
  c.drawLine({ start: { x: W / 2 - 40, y }, end: { x: W / 2 + 40, y }, thickness: 2, color: BLUE }); y -= 42;

  y = wrapCenter(c, 'This certifies that', y, body, 13, GRAY, 18, 380); y -= 14;
  centerText(c, app.full_name, y, display, 26, NAVY); y -= 34;

  const para = 'has satisfied the requirements of Verification by Origin under Local Law 77 of 2026, and is hereby recognized and recorded as a Verified New Yorker, with all the standing the Title confers.';
  y = wrapCenter(c, para, y, body, 13, INK, 20, 430); y -= 30;

  centerText(c, 'The Title is held in good standing subject to the Code of Conduct.', y, body, 10.5, GRAY);

  // file no + date row
  const rowY = 150;
  c.drawText('FILE NUMBER', { x: 92, y: rowY + 16, size: 8.5, font: body, color: GRAY });
  c.drawText(fileNo, { x: 92, y: rowY, size: 13, font: display, color: INK });
  const dateStr = longDate(app.determined_at || app.submitted_at);
  const dLabelW = body.widthOfTextAtSize('DATE OF DETERMINATION', 8.5);
  const dValW = display.widthOfTextAtSize(dateStr, 13);
  c.drawText('DATE OF DETERMINATION', { x: W - 92 - dLabelW, y: rowY + 16, size: 8.5, font: body, color: GRAY });
  c.drawText(dateStr, { x: W - 92 - dValW, y: rowY, size: 13, font: display, color: INK });

  // signature line
  c.drawLine({ start: { x: W / 2 - 110, y: 108 }, end: { x: W / 2 + 110, y: 108 }, thickness: 0.8, color: INK });
  centerText(c, 'Borough Verifier', 94, body, 10, GRAY);
  centerText(c, 'Issued by the Department of New Yorker Verification · City of New York', 62, body, 8.5, GRAY);

  // ================= PAGE 2 — IDENTIFICATION CARD =================
  const p2 = pdf.addPage([612, 792]);
  centerText(p2, 'IDENTIFICATION CARD', 792 - 80, body, 11, GRAY);
  centerText(p2, 'Cut along the border. Fold or laminate as needed.', 792 - 96, body, 9, GRAY);

  // ID-1 ratio card, 2x scale
  const cw = 460, ch = 290, cx = (612 - cw) / 2, cy = (792 - ch) / 2 + 10;
  p2.drawRectangle({ x: cx, y: cy, width: cw, height: ch, borderColor: NAVY, borderWidth: 1.5, color: WHITE });
  // header band
  const bandH = 52;
  p2.drawRectangle({ x: cx, y: cy + ch - bandH, width: cw, height: bandH, color: NAVY });
  p2.drawText('CITY OF NEW YORK', { x: cx + 18, y: cy + ch - 22, size: 9, font: body, color: rgb(0.75, 0.8, 1) });
  p2.drawText('VERIFIED NEW YORKER', { x: cx + 18, y: cy + ch - 40, size: 15, font: display, color: WHITE });
  p2.drawImage(seal, { x: cx + cw - 44, y: cy + ch - bandH + 6, width: 40, height: 40, opacity: 0.9 });

  // photo box
  const px = cx + 18, pw = 120, phh = 150, py = cy + ch - bandH - 18 - phh;
  p2.drawRectangle({ x: px, y: py, width: pw, height: phh, borderColor: GRAY, borderWidth: 1, color: rgb(0.94, 0.94, 0.94) });
  if (headshot) {
    try {
      const img = headshot.mime === 'image/png' ? await pdf.embedPng(headshot.bytes) : await pdf.embedJpg(headshot.bytes);
      const scale = Math.max(pw / img.width, phh / img.height); // cover
      const dw = img.width * scale, dh = img.height * scale;
      // center-crop by clipping via a rectangle is unavailable; draw contained instead to avoid overflow
      const cscale = Math.min(pw / img.width, phh / img.height);
      const cdw = img.width * cscale, cdh = img.height * cscale;
      p2.drawImage(img, { x: px + (pw - cdw) / 2, y: py + (phh - cdh) / 2, width: cdw, height: cdh });
    } catch {
      p2.drawText('photo on file', { x: px + 20, y: py + phh / 2, size: 9, font: body, color: GRAY });
    }
  } else {
    p2.drawText('photo on file', { x: px + 22, y: py + phh / 2, size: 9, font: body, color: GRAY });
  }

  // fields
  const fx = px + pw + 24;
  let fy = cy + ch - bandH - 30;
  const field = (label, value) => {
    p2.drawText(label, { x: fx, y: fy, size: 7.5, font: body, color: GRAY }); fy -= 13;
    p2.drawText(value || '—', { x: fx, y: fy, size: 13, font: display, color: INK }); fy -= 24;
  };
  field('NAME', app.full_name);
  field('DATE OF BIRTH', dob(app.date_of_birth));
  field('FILE NUMBER', fileNo);
  field('CLASS', 'Verification by Origin (Track 1)');
  field('ISSUED', longDate(app.determined_at || app.submitted_at));

  const pdfBytes = await pdf.save();
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileNo}.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  res.end(Buffer.from(pdfBytes));
}
