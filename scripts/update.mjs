// Self-update: merges the newest signed release of the kit into the user's copy.
// Runs at the start of every daily run (job-agent.mjs) and on request ("תעדכן את הסוכן" → node scripts/update.mjs).
//  - Only a release tag (v*) signed with the kit's key is taken: whoever controls the public repo still can't
//    push code to users without that key. The public key is pinned below.
//  - The user's files (profile, CV, settings, data, .env) are git-ignored, so an update never touches them.
//  - Conflict with a change the user made, or failing tests: nothing changes, and the email says what to do.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, log } from '../lib/util.mjs';

export const UPSTREAM = 'https://github.com/roshilabs-hq/job-search.git';
// The kit's release-signing public key (SSH). Replacing it requires a new kit release; see STANDARD §10.
export const SIGNERS = 'release@roshilabs ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILXXvvg51kM9xN+5gRNBJ31+rq2zoDYB3wln3MREU5qF';

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const pkgVersion = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
export const newer = (a, b) => {
  const [x, y] = [a, b].map(v => v.replace(/^v/, '').split('.').map(Number));
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

const ASK = 'כתבו ל-Claude בתיקיית הסוכן: "תעדכן את הסוכן".';

export async function selfUpdate() {
  if (!fs.existsSync(path.join(ROOT, '.git'))) return { notice: '' };
  git('fetch', '--quiet', '--tags', '--force', UPSTREAM, '+refs/tags/v*:refs/tags/v*');
  const latest = git('tag', '--list', 'v*', '--sort=-v:refname').split('\n')[0];
  const current = pkgVersion();
  if (!latest || !newer(latest, current)) return { notice: '' };

  // Verify the signature against the pinned key only, not against whatever the local git config trusts.
  const signers = path.join(ROOT, 'data', '.allowed-signers');
  fs.writeFileSync(signers, SIGNERS + '\n');
  try {
    git('-c', 'gpg.format=ssh', '-c', `gpg.ssh.allowedSignersFile=${signers}`, 'verify-tag', latest);
  } catch {
    log(`update: ${latest} is not signed by the kit's key, ignored`);
    return { notice: '' };
  }

  if (git('status', '--porcelain', '--untracked-files=no')) {
    return { notice: `יש גרסה חדשה של הסוכן (${latest}), והיא לא נכנסה כי יש אצלך שינוי שלא נשמר. ${ASK}` };
  }
  const before = git('rev-parse', 'HEAD');
  try {
    git('merge', '--no-edit', '-m', `update to ${latest}`, latest);
  } catch {
    try { git('merge', '--abort'); } catch {}
    return { notice: `יש גרסה חדשה של הסוכן (${latest}), והיא מתנגשת בשינוי שעשית. לא שיניתי כלום. ${ASK}` };
  }
  try {
    execFileSync('npm', ['ci', '--silent'], { cwd: ROOT, stdio: 'ignore', shell: true });
    execFileSync('npm', ['test', '--silent'], { cwd: ROOT, stdio: 'ignore', shell: true });
  } catch {
    git('reset', '--hard', before);
    try { execFileSync('npm', ['ci', '--silent'], { cwd: ROOT, stdio: 'ignore', shell: true }); } catch {}
    return { notice: `יש גרסה חדשה של הסוכן (${latest}), אבל הבדיקות שלה נכשלו אצלך, אז נשארתי בגרסה הקודמת. ${ASK}` };
  }
  log(`updated ${current} -> ${latest}`);
  return { notice: `✅ הסוכן עודכן לבד לגרסה ${latest.replace(/^v/, '')}. אין צורך לעשות כלום.` };
}

// Run directly: update now and print the result.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  selfUpdate().then(r => console.log(r.notice || `הסוכן מעודכן (גרסה ${pkgVersion()}).`), e => { console.error(e.message); process.exit(1); });
}
