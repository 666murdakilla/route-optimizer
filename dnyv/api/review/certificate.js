import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { getServiceClient } from '../_supabase.js';
import { requireReviewer } from '../_auth.js';
import { SEAL_PNG_B64, FONT_DISPLAY_B64, FONT_BODY_B64, b64ToBytes } from '../_pdf-assets.js';

// Generates the Certificate of Verification + identification card (one PDF)
// for a verified applicant. Reviewer-only; regenerated on demand.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NAVY = rgb(0x05 / 255, 0x05 / 255, 0x60 / 255);
const BLUE = rgb(0x10 / 255, 0x3f / 255, 0xef / 255);
const INK = rgb(0.06, 0.06, 0.06);
const GRAY = rgb(0.42, 0.42, 0.42);

function fileNumber(app) {
  const y = new Date(app.submitted_at || app.determined_at || Date.now()).getFullYear();
  return `DNYV-${y}-${String(app.file_number).padStart(6, '0')}`;
}
function longDate(s) {
  return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
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

  const pdfBytes = await pdf.save();
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileNo}.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  res.end(Buffer.from(pdfBytes));
}
