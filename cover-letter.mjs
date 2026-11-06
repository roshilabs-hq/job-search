// Writes a short cover letter for one matched job, from the base CV and profile only (no invented facts).
// Usage: node cover-letter.mjs <job number | job key> [en]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, log, askClaude } from './lib/util.mjs';
import { loadBaseCv, findJob, OUT_DIR, safeName } from './lib/cv.mjs';
import { coverLetterPrompt } from './lib/prompts.mjs';

const query = process.argv[2];
const lang = process.argv[3] === 'en' ? 'en' : 'he';
if (!query) { console.error('usage: node cover-letter.mjs <job number | key> [en]'); process.exit(1); }

const job = findJob(query);
if (!job) { console.error(`job "${query}" not found among open matches`); process.exit(1); }
const base = loadBaseCv();
const profile = fs.readFileSync(path.join(ROOT, 'profile.md'), 'utf8');

log(`writing a cover letter for ${job.company} | ${job.title}...`);
const letter = askClaude(coverLetterPrompt({ base, profile, job, lang })).trim();
fs.mkdirSync(OUT_DIR, { recursive: true });
const file = path.join(OUT_DIR, `${safeName(base.name)}_${lang === 'en' ? 'cover_letter' : 'מכתב_מקדים'}_${safeName(job.title)}.txt`);
fs.writeFileSync(file, letter + '\n', 'utf8');
console.log(`\n${letter}\n`);
log(`saved: ${file}`);
