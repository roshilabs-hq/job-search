// Renders a CV (cv/base-cv.json format) to a one-column HTML page and a PDF.
// One column, no tables or icons: recruiting systems (ATS) read it in the right order.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA_DIR, readJson, htmlToPdf } from './util.mjs';

export const CV_FILE = path.join(ROOT, 'cv', 'base-cv.json');
export const OUT_DIR = path.join(ROOT, 'cv', 'out');

export const loadBaseCv = () => {
  if (!fs.existsSync(CV_FILE)) throw new Error('cv/base-cv.json is missing: run /start in Claude Code first');
  return JSON.parse(fs.readFileSync(CV_FILE, 'utf8'));
};

// Finds a stored match by job key, job number or id.
export function findJob(query) {
  const matches = readJson(path.join(DATA_DIR, 'matches.json'), []);
  return matches.find(m => m.key === query || String(m.ref) === query || String(m.id) === query);
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
// File names keep Hebrew, but lose characters Windows does not allow.
export const safeName = s => String(s || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, '_').slice(0, 60);

export function renderCvHtml(cv, lang = 'he') {
  const H = lang === 'en'
    ? { dir: 'ltr', summary: 'Professional Summary', ach: 'Key Achievements', exp: 'Professional Experience', edu: 'Education', skills: 'Skills', mil: 'Military / National Service', lang: 'Languages' }
    : { dir: 'rtl', summary: 'תקציר מקצועי', ach: 'הישגים מרכזיים', exp: 'ניסיון מקצועי', edu: 'השכלה', skills: 'כישורים', mil: 'שירות צבאי / לאומי', lang: 'שפות' };
  const list = (title, items) => (items?.length ? `<h2>${title}</h2><ul>${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  return `<!doctype html><html lang="${lang}" dir="${H.dir}"><head><meta charset="utf-8"><title>${esc(cv.name)}</title><style>
@page{size:A4;margin:14mm 16mm}
body{font-family:Arial,Helvetica,sans-serif;color:#222;font-size:10.5pt;line-height:1.45;margin:0}
h1{color:#0f5f7c;font-size:24pt;margin:0}
.headline{font-weight:bold;font-size:11.5pt;margin:2px 0}
.contact{color:#555;font-size:10pt;padding-bottom:6px;border-bottom:2px solid #0f5f7c;margin-bottom:8px}
h2{color:#0f5f7c;font-size:12.5pt;margin:12px 0 4px;padding-bottom:2px;border-bottom:1px solid #ccc}
.role{font-weight:bold;margin-top:6px}
.role .meta{font-weight:normal;color:#555}
ul{margin:2px 0 4px;padding-inline-start:18px}li{margin:1px 0}
p{margin:2px 0}
</style></head><body>
<h1>${esc(cv.name)}</h1>
${cv.headline ? `<div class="headline">${esc(cv.headline)}</div>` : ''}
<div class="contact">${esc(cv.contact)}</div>
${cv.summary ? `<h2>${H.summary}</h2><p>${esc(cv.summary)}</p>` : ''}
${list(H.ach, cv.achievements)}
<h2>${H.exp}</h2>
${(cv.experience || []).map(e => `<div class="role">${esc(e.title)}<span class="meta">${e.place ? ` | ${esc(e.place)}` : ''}${e.years ? ` | ${esc(e.years)}` : ''}</span></div>
${e.bullets?.length ? `<ul>${e.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}`).join('')}
${list(H.edu, cv.education)}
${cv.military ? `<h2>${H.mil}</h2><p>${esc(cv.military)}</p>` : ''}
${cv.skills?.length ? `<h2>${H.skills}</h2><p>${cv.skills.map(esc).join(', ')}</p>` : ''}
${list(H.lang, cv.languages)}
</body></html>`;
}

// Writes <name>.html and <name>.pdf into cv/out and returns the PDF path.
export function writeCvPdf(cv, fileBase, lang = 'he') {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const htmlFile = path.join(OUT_DIR, `${fileBase}.html`);
  const pdfFile = path.join(OUT_DIR, `${fileBase}.pdf`);
  fs.writeFileSync(htmlFile, renderCvHtml(cv, lang), 'utf8');
  htmlToPdf(htmlFile, pdfFile);
  return pdfFile;
}
