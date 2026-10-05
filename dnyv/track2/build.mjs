// Builds public/track2.html from page.template.html + items.json.
// The template embeds the item/scoring data at __ITEMS_JSON__ (a <script
// type="application/json">), so the page is fully self-contained and the
// same data file is the single source of truth for later server-side scoring.
//   run:  node track2/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const tpl = fs.readFileSync(path.join(dir, 'page.template.html'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(dir, 'items.json'), 'utf8'));
const js = JSON.stringify(data).replace(/<\//g, '<\\/');
const out = tpl.replace('__ITEMS_JSON__', js);
const dest = path.join(dir, '..', 'public', 'track2.html');
fs.writeFileSync(dest, out);
console.log(`built ${dest} (${data.items.length} items, ${out.length} bytes)`);
