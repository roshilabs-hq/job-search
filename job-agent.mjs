// Job agent: collects jobs from the companies of the sectors the user chose, keeps the ones in the
// user's area, scores new ones against the user's CV and profile with Claude (the user's own Claude Code
// subscription), and writes an HTML report + an email on every run.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA_DIR, log, readJson, writeJson, askClaude, parseJsonArray, fairOrder } from './lib/util.mjs';
import { sendRunEmail, isShown, mailConfigured } from './lib/mail.mjs';
import { loadSettings, loadCompanies } from './lib/config.mjs';
import { areaMatcher, titleExcluder } from './lib/area.mjs';
import { scorePrompt, tipsPrompt } from './lib/prompts.mjs';
import { selfUpdate } from './scripts/update.mjs';

const REPORT_DIR = path.join(ROOT, 'reports');
const REPORT_FILE = path.join(REPORT_DIR, 'latest.html');
const SEEN_FILE = path.join(DATA_DIR, 'seen.json');
const MATCHES_FILE = path.join(DATA_DIR, 'matches.json');
const HEALTH_FILE = path.join(DATA_DIR, 'health.json');
const PROFILE_FILE = path.join(ROOT, 'profile.md');
const CV_FILE = path.join(ROOT, 'cv', 'base-cv.json');

const BATCH_SIZE = 15;        // jobs per Claude call
const SCORE_PER_RUN = 150;    // new jobs scored per run; the rest wait for the next run (keeps the first run short)
const TAILOR_MIN = 7;         // matches at or above this score get CV tailoring tips
const TAILOR_PER_RUN = 15;    // cap on tips generated per run
const FAIL_ALERT_RUNS = 3;    // a source is reported in the email only after this many failed runs in a row

fs.mkdirSync(REPORT_DIR, { recursive: true });

function writeReport(matches, newKeys, stats, minScore) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const fmt = ms => (ms ? new Date(ms).toLocaleDateString('he-IL') : '');
  const cards = matches.map(m => `
    <article class="${newKeys.has(m.key) ? 'new' : ''}">
      <div class="score${m.score < 6 ? ' low' : ''}">${m.score}</div>
      <div class="body">
        <div class="company">${esc(m.company)}</div>
        <h2><a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.title)}</a>
          ${newKeys.has(m.key) ? '<span class="badge">חדש</span>' : ''}</h2>
        <div class="meta">${[m.department, (m.locations || []).slice(0, 2).join(' / '),
          m.postedAt ? 'פורסם ' + fmt(m.postedAt) : ''].filter(Boolean).map(esc).join(' · ')}</div>
        <p>${esc(m.reason)}</p>
        ${m.salary != null ? `<p class="sal">שכר צפוי (הערכה): ${m.salary}/10${m.salaryNote ? ' · ' + esc(m.salaryNote) : ''}</p>` : ''}
        <div class="links"><span>מס' משרה: <b>${esc(m.ref || m.id)}</b></span>
          <a class="open" href="${esc(m.url)}" target="_blank" rel="noopener">לצפייה במשרה ולהגשה ←</a></div>
      </div>
    </article>`).join('');
  const failed = stats.failed.length
    ? `<div class="warn">מקורות שנכשלו בריצה הזו: ${stats.failed.map(esc).join(', ')} (פרטים ביומן)</div>` : '';
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>משרות מתאימות</title>
<style>
:root{--bg:#f6f7f5;--card:#fff;--ink:#1d2321;--muted:#66706c;--accent:#2f7d4f;--line:#e2e5e1;--warn:#fff4e0}
@media (prefers-color-scheme:dark){:root{--bg:#141716;--card:#1d2120;--ink:#e8ece9;--muted:#9aa4a0;--line:#2c3230;--warn:#3a2f1c}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,"Segoe UI",Arial,sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px}
h1{margin:0 0 4px;font-size:26px} .sub{color:var(--muted);margin-bottom:16px}
.warn{background:var(--warn);border-radius:8px;padding:8px 12px;margin-bottom:16px;font-size:14px}
article{display:flex;gap:16px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:12px}
article.new{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.score{flex:none;width:48px;height:48px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:20px;background:#e3f1e8;color:#235c3b}
.score.low{background:#f3f1d9;color:#6b5f00}
.company{font-size:13px;font-weight:600;color:var(--accent)}
h2{margin:0;font-size:18px} h2 a{color:inherit} .meta{color:var(--muted);font-size:14px;margin:2px 0 6px}
.sal{font-size:14px;margin-top:6px;color:var(--muted)}
.links{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;margin-top:10px;font-size:14px;color:var(--muted)}
.links b{color:var(--ink);user-select:all}
.open{color:#fff;background:var(--accent);text-decoration:none;border-radius:6px;padding:4px 12px;font-weight:600}
p{margin:0} .badge{background:var(--accent);color:#fff;font-size:12px;border-radius:6px;padding:1px 8px;margin-inline-start:8px;vertical-align:middle}
.empty{color:var(--muted)}
</style></head><body><main>
<h1>משרות שמתאימות לך</h1>
<div class="sub">עודכן ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })} · ${stats.sources} מקורות ·
${stats.inArea} משרות באזור שלך · ${stats.newCount} חדשות בריצה הזו · ${matches.length} התאמות (ציון ${minScore}+)</div>
${failed}
${cards || '<p class="empty">עדיין אין משרות שעברו את סף ההתאמה.</p>'}
</main></body></html>`;
  fs.writeFileSync(REPORT_FILE, html, 'utf8');
}

async function main() {
  // A signed new version of the kit is merged first, so a fixed source works already in this run.
  const update = process.env.DRY_RUN || process.env.ONLY ? { notice: '' } : await selfUpdate().catch(e => ({ notice: '', error: e.message }));
  if (update.error) log('update check failed:', update.error);

  const settings = loadSettings();
  const profile = fs.readFileSync(PROFILE_FILE, 'utf8');
  const cv = fs.existsSync(CV_FILE) ? fs.readFileSync(CV_FILE, 'utf8') : '';
  const inArea = areaMatcher(settings.area);
  const excluded = titleExcluder(settings.excludeTitles);
  const minScore = settings.minScore;

  // ONLY=id1,id2: run just these sources (for testing).
  const only = process.env.ONLY?.split(',');
  const companies = loadCompanies(settings).filter(c => !only || only.includes(c.id));
  const seen = readJson(SEEN_FILE, {});
  let matches = readJson(MATCHES_FILE, []);

  const openKeys = new Set();
  const current = new Map();   // key -> freshly collected job, to refresh stored matches
  const okCompanies = new Set();
  const failed = [];
  const candidates = [];
  let inAreaCount = 0, newCount = 0;

  // Job boards repost jobs that companies also list on their own sites; the company's own listing wins.
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9א-ת]/g, '');
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const directs = companies.filter(c => c.aliases?.length).map(c => ({
    id: c.id, re: new RegExp(`(^|[^a-zא-ת])(${c.aliases.map(escRe).join('|')})([^a-zא-ת]|$)`, 'i'),
  }));
  const isDirectDuplicate = j => {
    const d = directs.find(d => d.re.test(j.company || ''));
    const t = norm(j.title);
    if (!d || t.length < 6) return false;
    for (const [k, x] of current) {
      if (!k.startsWith(d.id + ':')) continue;
      const u = norm(x.title);
      if (u === t || (u.length >= 8 && t.includes(u)) || (t.length >= 8 && u.includes(t))) return true;
    }
    return false;
  };

  // Boards run last, so the companies' own listings are already collected when duplicates are checked.
  for (const c of [...companies.filter(c => !c.board), ...companies.filter(c => c.board)]) {
    try {
      const source = await import(`./sources/${c.platform}.mjs`);
      // One retry after 30s: sites occasionally drop a connection or briefly rate-limit.
      const raw = await source.collect(c, {}).catch(async e => {
        log(`${c.name}: retrying after error - ${e.message.split('\n')[0]}`);
        await new Promise(r => setTimeout(r, 30000));
        return source.collect(c, {});
      });
      const jobs = raw.map(j => ({ ...j, company: j.company || c.name, key: `${c.id}:${j.id}` }));
      let local = jobs.filter(j => inArea(j, c));
      if (c.board) {
        const dups = local.filter(isDirectDuplicate);
        local = local.filter(j => !dups.includes(j));
        if (dups.length) log(`${c.name}: ${dups.length} duplicates of company-site jobs skipped`);
      }
      local.forEach(j => { openKeys.add(j.key); current.set(j.key, j); });
      // Jobs outside the area are not marked as seen, so widening the area later gets them scored.
      const fresh = local.filter(j => !seen[j.key]);
      const cands = fresh.filter(j => !excluded(j));
      for (const j of fresh.filter(excluded)) seen[j.key] = { skipped: 'title', at: Date.now() };
      candidates.push(...cands.map(j => ({ ...j, _company: c })));
      inAreaCount += local.length;
      newCount += fresh.length;
      okCompanies.add(c.id);
      log(`${c.name}: ${jobs.length} jobs, ${local.length} in area, ${fresh.length} new, ${cands.length} to score`);
    } catch (e) {
      failed.push(c.name);
      log(`${c.name}: FAILED - ${e.message.split('\n')[0]}`);
    }
  }

  // Failure streaks per source: one-off glitches are not worth an email warning; a source that keeps failing is.
  const health = readJson(HEALTH_FILE, {});
  for (const c of companies) health[c.id] = okCompanies.has(c.id) ? 0 : (health[c.id] || 0) + 1;
  if (!process.env.DRY_RUN) writeJson(HEALTH_FILE, health);
  const persistentFailures = companies.filter(c => health[c.id] >= FAIL_ALERT_RUNS).map(c => `${c.name} (${health[c.id]} ריצות)`);

  // Only this run's share is scored; the rest stay unseen and are scored in the next runs.
  const toScore = fairOrder(candidates).slice(0, SCORE_PER_RUN);
  // Descriptions are fetched only for jobs about to be scored (some sources need a request per job).
  const byCompany = new Map();
  for (const j of toScore) byCompany.set(j._company, [...(byCompany.get(j._company) || []), j]);
  for (const [c, jobs] of byCompany) {
    const source = await import(`./sources/${c.platform}.mjs`);
    if (source.describe) await source.describe(c, {}, jobs).catch(e => log(`${c.name}: descriptions failed - ${e.message}`));
  }

  // DRY_RUN=1: collect and list what would be scored, without saving state or calling Claude.
  if (process.env.DRY_RUN) {
    for (const j of toScore) log(`  [${j.company}] ${j.title} | ${(j.locations || []).join(' / ')} | desc ${(j.description || '').length}`);
    log(`dry run: ${candidates.length} jobs would be scored (${toScore.length} this run)`);
    return;
  }
  writeJson(SEEN_FILE, seen);

  const newKeys = new Set();
  if (toScore.length) log(`scoring ${toScore.length} new jobs with Claude${candidates.length > toScore.length ? ` (${candidates.length - toScore.length} more next run)` : ''}...`);
  for (let i = 0; i < toScore.length; i += BATCH_SIZE) {
    const batch = toScore.slice(i, i + BATCH_SIZE);
    let scores;
    try {
      scores = parseJsonArray(askClaude(scorePrompt({ profile, cv, desiredSalary: settings.desiredSalary, jobs: batch })));
    } catch (e) {
      log('claude scoring failed, will retry next run:', e.message.split('\n')[0]);
      continue;
    }
    for (const s of scores) {
      const job = batch.find(j => j.key === String(s.id));
      if (!job) continue;
      const rating = { score: s.score, salary: s.salary, salaryNote: s.salary_note, reason: s.reason };
      seen[job.key] = { ...rating, at: Date.now() };
      if (s.score >= minScore) {
        const { description, _company, ...rest } = job;
        matches.push({ ...rest, ...rating, jd: (description || '').slice(0, 3000), foundAt: Date.now() });
        newKeys.add(job.key);
      }
    }
    writeJson(SEEN_FILE, seen);
  }

  // Restore matches that dropped out (e.g. a source returned partial data once) and are listed again.
  const inMatches = new Set(matches.map(m => m.key));
  for (const [key, j] of current) {
    const s = seen[key];
    if (s?.score >= minScore && !inMatches.has(key)) {
      const { description, _company, ...rest } = j;
      matches.push({ ...rest, score: s.score, salary: s.salary, salaryNote: s.salaryNote, reason: s.reason, tailor: s.tailor, foundAt: s.at });
    }
  }

  // CV tailoring tips for strong matches: new ones first, then a few older open ones per run.
  const needTips = matches
    .filter(m => m.score >= TAILOR_MIN && !m.tailor && openKeys.has(m.key) && (m.jd || '').length > 200)
    .sort((a, b) => (newKeys.has(b.key) - newKeys.has(a.key)) || b.score - a.score)
    .slice(0, TAILOR_PER_RUN);
  if (needTips.length) log(`writing CV tips for ${needTips.length} jobs...`);
  for (let i = 0; i < needTips.length; i += 5) {
    const batch = needTips.slice(i, i + 5);
    try {
      for (const t of parseJsonArray(askClaude(tipsPrompt({ profile, cv, jobs: batch })))) {
        const m = matches.find(x => x.key === String(t.id));
        if (!m || !Array.isArray(t.tips)) continue;
        m.tailor = t.tips.slice(0, 3);
        if (seen[m.key]) seen[m.key].tailor = m.tailor;
      }
    } catch (e) {
      log('CV tips failed, will retry next run:', e.message.split('\n')[0]);
    }
  }
  writeJson(SEEN_FILE, seen);

  // Drop closed postings, but keep matches of sources that failed this run.
  matches = matches
    .map(m => current.has(m.key) ? { ...m, ref: current.get(m.key).ref, url: current.get(m.key).url } : m)
    .filter(m => openKeys.has(m.key) || !okCompanies.has(m.key.split(':')[0]))
    .sort((a, b) => b.score - a.score || (b.postedAt || 0) - (a.postedAt || 0));
  writeJson(MATCHES_FILE, matches);

  const shown = matches.filter(isShown);
  writeReport(shown, newKeys, { sources: companies.length, inArea: inAreaCount, newCount, failed }, minScore);
  log(`report: ${REPORT_FILE} (${matches.length} matches, ${newKeys.size} new, ${failed.length} sources failed)`);

  // Email after every run (also when nothing is new), so a quiet day still confirms the agent is alive.
  if (!only && mailConfigured()) {
    await sendRunEmail({
      newMatches: shown.filter(m => newKeys.has(m.key)),
      topOpen: shown.slice(0, 5),
      allOpen: shown,
      stats: { sources: okCompanies.size, inArea: inAreaCount, newCount, totalMatches: shown.length },
      failed: persistentFailures,
      notice: update.notice,
    }).then(() => log('email sent'), e => log('email FAILED -', e.message.split('\n')[0]));
  }
}

main().catch(async e => {
  log('ERROR', e.stack || e.message);
  if (mailConfigured()) await sendRunEmail({ error: e.stack || e.message }).catch(err => log('email FAILED -', err.message.split('\n')[0]));
  process.exit(1);
});
