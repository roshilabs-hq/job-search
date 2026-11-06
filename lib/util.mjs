// Shared helpers: process runner, logging, JSON files, HTTP fetch.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const log = (...a) => console.log(new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' }), ...a);
export const fileUrl = f => 'file:///' + f.replace(/\\/g, '/');
export const readJson = (f, def) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : def);
export const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2), 'utf8');
export const htmlToText = html => String(html || '')
  .replace(/<(br|\/p|\/li|\/div|\/h\d)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

// Returns the JSON array that starts at the first match of `startRe` (which must end at the '['),
// by bracket matching, so page data is parsed as data and never run as code.
export function jsonArrayAt(text, startRe) {
  const m = startRe.exec(text);
  if (!m) return null;
  const i = m.index + m[0].length - 1;
  let depth = 0, inStr = false;
  for (let j = i; j < text.length; j++) {
    const ch = text[j];
    if (inStr) { if (ch === '\\') j++; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) return JSON.parse(text.slice(i, j + 1));
  }
  return null;
}

// The kit identifies itself honestly: no browser impersonation, no bot-check workarounds.
// A site that refuses this agent is left out of the company list.
export const USER_AGENT = 'job-search-kit/1.0 (+https://github.com/roshilabs-hq/job-search)';

// Output goes through temp files rather than pipes, so a child that leaves a background process
// running cannot keep spawnSync waiting forever.
let runSeq = 0;
export function run(cmd, args, input, timeoutMs = 15 * 60 * 1000) {
  const tag = `${process.pid}-${runSeq++}`;
  const outFile = path.join(DATA_DIR, `.out-${tag}.txt`);
  const errFile = path.join(DATA_DIR, `.err-${tag}.txt`);
  const outFd = fs.openSync(outFile, 'w');
  const errFd = fs.openSync(errFile, 'w');
  let r;
  try {
    r = spawnSync(cmd, args, {
      input, shell: true, stdio: [input === undefined ? 'ignore' : 'pipe', outFd, errFd],
      timeout: timeoutMs, windowsHide: true,
    });
  } finally {
    fs.closeSync(outFd);
    fs.closeSync(errFd);
  }
  const stdout = fs.readFileSync(outFile, 'utf8');
  const stderr = fs.readFileSync(errFile, 'utf8');
  for (const f of [outFile, errFile]) try { fs.rmSync(f, { force: true }); } catch {}
  if (r.status !== 0) throw new Error(`${cmd} ${args[0]} failed (${r.status ?? r.error?.message}): ${stderr || stdout}`);
  return stdout;
}

// Asks Claude (the user's own Claude Code subscription) with no tools: job ads are outside content,
// so the model can read them but cannot act on anything written inside them.
export const askClaude = prompt => run('claude', ['-p', '--tools', '""', '--no-session-persistence', '--output-format', 'text'], prompt);
export const parseJsonArray = out => JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1));
export const parseJsonObject = out => JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));

export async function fetchJson(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: { 'user-agent': USER_AGENT, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

// HTML fetch that follows redirects manually and keeps the cookies a site sets on the way.
export async function fetchText(url, { jar = new Map(), maxRedirects = 8 } = {}) {
  for (let i = 0; i <= maxRedirects; i++) {
    const r = await fetch(url, {
      redirect: 'manual',
      headers: {
        'user-agent': USER_AGENT,
        'accept-language': 'he-IL,he;q=0.9,en;q=0.8',
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
      },
      signal: AbortSignal.timeout(60_000),
    });
    for (const c of r.headers.getSetCookie?.() || []) {
      const [pair] = c.split(';');
      const eq = pair.indexOf('=');
      jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      url = new URL(r.headers.get('location'), url).href;
      continue;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.text();
  }
  throw new Error(`too many redirects for ${url}`);
}

// Prints an HTML file to PDF with Microsoft Edge (installed on every Windows), so no extra tool is needed.
const EDGE = [
  process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'),
  process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft/Edge/Application/msedge.exe'),
].filter(Boolean);
export function htmlToPdf(htmlFile, pdfFile) {
  const edge = EDGE.find(f => fs.existsSync(f));
  if (!edge) throw new Error('Microsoft Edge not found: needed to create the PDF');
  fs.rmSync(pdfFile, { force: true });
  try {
    run(`"${edge}"`, ['--headless', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf="${pdfFile}"`, `"${fileUrl(htmlFile)}"`], undefined, 120_000);
  } catch (e) {
    if (!fs.existsSync(pdfFile)) throw e;
  }
  // Edge can return a moment before the file is fully written: wait until its size stops changing.
  const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const size = fs.existsSync(pdfFile) ? fs.statSync(pdfFile).size : 0;
    if (size > 0 && size === last) return;
    last = size;
    pause(250);
  }
  throw new Error('PDF was not created');
}
