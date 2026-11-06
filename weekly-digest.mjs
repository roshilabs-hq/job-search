// Weekly digest: emails every still-open match scoring DIGEST_MIN_SCORE or more (default 7).
// Uses the matches kept up to date by the twice-daily runs (closed postings are already removed there).
import path from 'node:path';
import { DATA_DIR, log, readJson } from './lib/util.mjs';
import { sendDigestEmail } from './lib/mail.mjs';

const minScore = Number(process.env.DIGEST_MIN_SCORE || 7);
const matches = readJson(path.join(DATA_DIR, 'matches.json'), []);

sendDigestEmail({ matches, minScore })
  .then(() => log(`weekly digest sent (${matches.filter(m => m.score >= minScore).length} jobs at ${minScore}+)`))
  .catch(e => { log('weekly digest FAILED -', e.message); process.exit(1); });
