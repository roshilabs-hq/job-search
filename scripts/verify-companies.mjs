// Checks that each company's source answers and has jobs in Israel.
//   node scripts/verify-companies.mjs --build      candidates -> companies.json + COMPANIES.md (only what passed)
//   node scripts/verify-companies.mjs              check companies.json (+ my-companies.json); exit 1 if any failed
//   node scripts/verify-companies.mjs --one '{...}' check one company config (used by "add a company")
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson, writeJson } from '../lib/util.mjs';
import { inIsrael } from '../lib/area.mjs';
import { SECTORS } from '../lib/config.mjs';

const args = process.argv.slice(2);
const BUILD = args.includes('--build');
const one = args.includes('--one') ? args[args.indexOf('--one') + 1] : null;

async function check(c) {
  const started = Date.now();
  try {
    const source = await import(`../sources/${c.platform}.mjs`);
    const jobs = await source.collect(c, {});
    const israel = jobs.filter(j => inIsrael(j, c)).length;
    return { id: c.id, name: c.name, ok: israel > 0, total: jobs.length, israel, ms: Date.now() - started,
      reason: israel > 0 ? '' : jobs.length ? 'no jobs in Israel right now' : 'no jobs returned' };
  } catch (e) {
    return { id: c.id, name: c.name, ok: false, total: 0, israel: 0, ms: Date.now() - started, reason: e.message.split('\n')[0].slice(0, 160) };
  }
}

// A few at a time: gentle with the sites, and still quick for a few hundred companies.
async function checkAll(list, parallel = 6) {
  const out = [];
  let next = 0;
  await Promise.all(Array.from({ length: parallel }, async () => {
    while (next < list.length) {
      const c = list[next++];
      const r = await check(c);
      out.push(r);
      console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${c.id.padEnd(16)} ${String(r.israel).padStart(4)} in Israel / ${String(r.total).padStart(5)} total  ${r.reason}`);
    }
  }));
  return out;
}

function companiesMd(companies) {
  const lines = ['<div dir="rtl">', '', '# החברות שהסוכן בודק', '',
    'הקובץ הזה נוצר אוטומטית מתוך `companies.json`. בכל תחום שבוחרים, כל החברות שבו נבדקות.', '',
    `נכון ל-${new Date().toLocaleDateString('he-IL')}: ${companies.length} חברות.`, ''];
  for (const [key, label] of Object.entries(SECTORS)) {
    const inSector = companies.filter(c => c.sector === key);
    if (!inSector.length) continue;
    lines.push(`## ${label} (${inSector.length})`, '', inSector.map(c => c.name).sort((a, b) => a.localeCompare(b, 'he')).join(' · '), '');
  }
  lines.push('חסרה לכם חברה? כתבו ל-Claude: "תוסיף את חברה X".', '', '</div>', '');
  return lines.join('\n');
}

if (one) {
  const r = await check(JSON.parse(one));
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}

const file = BUILD ? path.join(ROOT, 'research', 'candidates.json') : path.join(ROOT, 'companies.json');
const list = [...readJson(file, []), ...(BUILD ? [] : readJson(path.join(ROOT, 'my-companies.json'), []))];
const results = await checkAll(list);
const passed = new Set(results.filter(r => r.ok).map(r => r.id));
writeJson(path.join(ROOT, 'data', 'verify-report.json'), { at: new Date().toISOString(), results });
console.log(`\n${passed.size}/${list.length} passed`);

if (BUILD) {
  const companies = list.filter(c => passed.has(c.id));
  writeJson(path.join(ROOT, 'companies.json'), companies);
  fs.writeFileSync(path.join(ROOT, 'COMPANIES.md'), companiesMd(companies), 'utf8');
} else if (passed.size < list.length) {
  process.exit(1);
}
