import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { certTemplate } from './_certificate-template.js';

// Renders the Certificate of Verification (Claude Design's landscape US-Letter
// design) to a PDF for a verified applicant. The design needs a real browser
// (gradients, a sunburst, script fonts, an auto-fit name), so it is rendered
// with headless Chromium. Shared by the reviewer download endpoint and the
// verified-determination email, which attaches the same document.
//
// This only runs when a reviewer records a "verified" determination — never on
// public or submission traffic — so its cost and latency stay negligible.
const BOROUGHS = {
  manhattan: { name: 'Manhattan', code: 'MAN' },
  brooklyn: { name: 'Brooklyn', code: 'BKN' },
  queens: { name: 'Queens', code: 'QNS' },
  bronx: { name: 'The Bronx', code: 'BRX' },
  staten_island: { name: 'Staten Island', code: 'STI' },
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const longDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };

export function certificateFileNumber(app) {
  const y = new Date(app.submitted_at || app.determined_at || Date.now()).getFullYear();
  return `DNYV-${y}-${String(app.file_number).padStart(6, '0')}`;
}

// Maps an application record to the certificate template's tokens. Track 1 only
// for now; Track 2 wording is here for when it opens.
export function buildCertificateTokens(app) {
  const b = BOROUGHS[app.borough];
  if (!b) throw new Error('certificate: unknown borough ' + app.borough);
  const t2 = false;
  const dateIso = String(app.determined_at || app.submitted_at).slice(0, 10);
  return {
    holder_name: app.full_name,
    file_number: certificateFileNumber(app),
    date_of_determination: longDate(dateIso),
    borough: b.name,
    borough_code: b.code,
    borough_signature: 'Elsa von Freytag',
    track_chip: t2 ? 'Track 2' : 'Track 1',
    basis: t2 ? 'EXPERIENCE' : 'ORIGIN',
    basis_long: t2 ? 'Verification by Experience' : 'Verification by Origin',
  };
}

const fillTemplate = (tpl, tokens) => tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in tokens ? esc(tokens[k]) : m));

export async function renderCertificatePdf(app) {
  const html = fillTemplate(certTemplate(), buildCertificateTokens(app));
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1056, height: 816, deviceScaleFactor: 2 },
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    // Fonts are embedded as data URIs, so there is no network to wait on; the
    // template sets body[data-ready] once fonts load and the name auto-fit runs.
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForSelector('body[data-ready="1"]', { timeout: 20000 });
    return await page.pdf({ width: '11in', height: '8.5in', printBackground: true, pageRanges: '1' });
  } finally {
    await browser.close();
  }
}
