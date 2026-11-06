// Records jobs the user applied to: they disappear from all emails and reports, and a snapshot of the job
// (title, company, link, description, tailored CV) is kept even after the ad closes, for interview prep.
// Usage: node applied.mjs <job number | job key> [...]    mark as applied, e.g. node applied.mjs 8887340
//        node applied.mjs                                  list everything applied to
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, readJson, writeJson, log } from './lib/util.mjs';
import { OUT_DIR, safeName } from './lib/cv.mjs';

const FILE = path.join(DATA_DIR, 'applied.json');
const applied = readJson(FILE, {});
const args = process.argv.slice(2);

if (!args.length) {
  for (const [key, a] of Object.entries(applied).sort((x, y) => y[1].appliedAt.localeCompare(x[1].appliedAt)))
    console.log(`${a.appliedAt.slice(0, 10)}  ${a.title} | ${a.company} (${key})${a.cv ? `\n            CV: ${a.cv}` : ''}`);
  process.exit(0);
}

const matches = readJson(path.join(DATA_DIR, 'matches.json'), []);
for (const q of args) {
  const job = matches.find(m => m.key === q || String(m.ref) === q || String(m.id) === q);
  if (!job) { console.error(`job "${q}" not found among open matches`); process.exitCode = 1; continue; }
  const cvFile = fs.existsSync(OUT_DIR) && fs.readdirSync(OUT_DIR).find(f => f.endsWith('.pdf') && f.includes(safeName(job.title)));
  const cv = cvFile ? path.join(OUT_DIR, cvFile) : null;
  applied[job.key] = {
    title: job.title, company: job.company, locations: job.locations, url: job.url, jd: job.jd || job.reason,
    appliedAt: new Date().toISOString(), cv,
  };
  log(`applied ${job.key}: ${job.title} (${job.company})`);
}
writeJson(FILE, applied);
