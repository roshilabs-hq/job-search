// Hides a job the user dropped from all future emails and reports.
// Usage: node dismiss.mjs <job number | job key> [...]     e.g. node dismiss.mjs 7306
import path from 'node:path';
import { DATA_DIR, readJson, writeJson, log } from './lib/util.mjs';

const FILE = path.join(DATA_DIR, 'dismissed.json');
const matches = readJson(path.join(DATA_DIR, 'matches.json'), []);
const dismissed = new Set(readJson(FILE, []));

for (const q of process.argv.slice(2)) {
  const job = matches.find(m => m.key === q || String(m.ref) === q || String(m.id) === q);
  if (!job) { console.error(`job "${q}" not found among open matches`); process.exitCode = 1; continue; }
  dismissed.add(job.key);
  log(`dismissed ${job.key}: ${job.title} (${job.company})`);
}
writeJson(FILE, [...dismissed]);
