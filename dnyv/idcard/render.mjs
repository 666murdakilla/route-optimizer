// DNYV New Yorker ID — reference renderer.
// Usage:  node render.mjs sample-applicant.json out/
// Writes out/<id>.html, plus out/<id>-front.png, -back.png and .pdf if puppeteer is installed.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BOROUGHS = {
  manhattan:     { name: 'MANHATTAN', code: 'MAN' },
  brooklyn:      { name: 'BROOKLYN',  code: 'BKN' },
  queens:        { name: 'QUEENS',    code: 'QNS' },
  bronx:         { name: 'THE BRONX', code: 'BRX' },
  staten_island: { name: 'STATEN IS.', code: 'STI' },
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

// ICAO 9303 check digit (weights 7,3,1). '<' = 0, A-Z = 10-35.
function checkDigit(str) {
  const w = [7, 3, 1];
  let sum = 0;
  [...str].forEach((ch, i) => {
    const v = ch === '<' ? 0 : /[0-9]/.test(ch) ? +ch : ch.charCodeAt(0) - 55;
    sum += v * w[i % 3];
  });
  return String(sum % 10);
}

const mrzText = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '<');
const pad = (s, n = 30) => (s + '<'.repeat(n)).slice(0, n);
const parseISO = (iso) => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; };
const us = ({ y, m, d }) => String(m).padStart(2, '0') + '/' + String(d).padStart(2, '0') + '/' + y;
const yymmdd = ({ y, m, d }) => String(y).slice(2) + String(m).padStart(2, '0') + String(d).padStart(2, '0');

/**
 * applicant -> token map for dnyv-id-template.html
 * Required: id_number (9 digits), surname, given_names, dob (YYYY-MM-DD),
 *           verified_date (YYYY-MM-DD), borough (key of BOROUGHS), track (1|2), photo_src
 * Optional: status ('verified'|'provisional'), signature_name, hologram (bool)
 */
function buildTokens(a) {
  const digits = String(a.id_number).replace(/\D/g, '');
  if (digits.length !== 9) throw new Error('id_number must be 9 digits');
  const b = BOROUGHS[a.borough];
  if (!b) throw new Error('borough must be one of ' + Object.keys(BOROUGHS).join(', '));
  if (![1, 2].includes(Number(a.track))) throw new Error('track must be 1 or 2');
  const t2 = Number(a.track) === 2;
  const dob = parseISO(a.dob), ver = parseISO(a.verified_date);
  const exp = t2 ? { ...ver, y: ver.y + 10 } : null;

  const l1 = pad('NYV9' + b.code + digits);
  const dobF = yymmdd(dob) + checkDigit(yymmdd(dob));
  const expF = exp ? yymmdd(exp) + checkDigit(yymmdd(exp)) : '<<<<<<<';
  const l2 = pad(dobF + '<' + expF + b.code, 29) + checkDigit(digits + dobF + expF);
  const l3 = pad(mrzText(a.surname) + '<<' + mrzText(a.given_names));

  return {
    id_display: 'NY' + digits[0] + ' · ' + digits.slice(1, 5) + ' · ' + digits.slice(5),
    id_compact: 'NY' + digits,
    borough_code: b.code,
    borough: b.name,
    surname: a.surname.toUpperCase(),
    given_names: a.given_names.toUpperCase(),
    signature_name: a.signature_name ?? (a.given_names.split(' ')[0] + ' ' + a.surname),
    dob: us(dob),
    verified_date: us(ver),
    expires: exp ? us(exp) : 'NEVER',
    basis: t2 ? 'EXPER.' : 'ORIGIN',
    track_chip: t2 ? 'Track 2' : 'Track 1',
    status: (a.status ?? 'verified').toUpperCase(),
    permanence: t2
      ? 'Track 2 status is renewable every ten years upon continued residence and Tribulation.'
      : 'Track 1 status is permanent and survives departure from the city.',
    mrz1: l1, mrz2: l2, mrz3: l3,
    photo_src: a.photo_src,
    hologram_display: a.hologram === false ? 'none' : 'flex',
  };
}

function fillTemplate(template, tokens) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!(k in tokens)) throw new Error('Missing token: ' + k);
    return esc(tokens[k]);
  });
}

export { buildTokens, fillTemplate, checkDigit, BOROUGHS };

const here = path.dirname(fileURLToPath(import.meta.url));

export async function renderApplicant(applicant, outDir) {
  const template = await fs.readFile(path.join(here, 'dnyv-id-template.html'), 'utf8');
  const tokens = buildTokens(applicant);
  const html = fillTemplate(template, tokens);
  await fs.mkdir(outDir, { recursive: true });
  const base = path.join(outDir, tokens.id_compact);
  await fs.writeFile(base + '.html', html);

  let puppeteer;
  try { puppeteer = (await import('puppeteer')).default; } catch { return { html: base + '.html' }; }
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1012, height: 638, deviceScaleFactor: 1 }); // CR80 @ 300dpi
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.body.classList.add('render'));
  await page.waitForSelector('body[data-ready="1"]');
  for (const side of ['front', 'back']) {
    const el = await page.$('#' + side);
    await el.screenshot({ path: base + '-' + side + '.png', omitBackground: true });
  }
  await page.pdf({ path: base + '.pdf', width: '1012px', height: '638px', printBackground: true });
  await browser.close();
  return { html: base + '.html', front: base + '-front.png', back: base + '-back.png', pdf: base + '.pdf' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [input, out = 'out'] = process.argv.slice(2);
  const applicant = JSON.parse(await fs.readFile(input, 'utf8'));
  console.log(await renderApplicant(applicant, out));
}
