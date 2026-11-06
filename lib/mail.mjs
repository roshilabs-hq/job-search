// Run summary email (Gmail SMTP with an app password), laid out for reading on a phone.
// Credentials live in .env: GMAIL_USER, GMAIL_APP_PASSWORD, optional MAIL_TO. Claude never reads that file.
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { ROOT, DATA_DIR, readJson } from './util.mjs';

const ENV_FILE = path.join(ROOT, '.env');
if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

// Jobs with a salary rating of 3 or less are kept (and checked) but not shown; unrated ones are shown.
// Jobs the user dropped (`node dismiss.mjs <job number>`) are hidden from every email and report.
const dismissed = new Set(readJson(path.join(DATA_DIR, 'dismissed.json'), []));
// Jobs already applied to (`node applied.mjs <job number>`) are hidden too, so nobody applies twice.
const applied = readJson(path.join(DATA_DIR, 'applied.json'), {});
export const isShown = m => !dismissed.has(m.key) && !applied[m.key] && (m.salary == null || m.salary > 3);

export const mailConfigured = () => Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
// Anything that goes into a mail header is kept on one line.
export const oneLine = s => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const fmtDate = ms => (ms ? new Date(ms).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '');

function card(m, isNew) {
  const color = m.score >= 7 ? '#2f7d4f' : m.score >= 6 ? '#5f8f2f' : '#8a7a00';
  const meta = [m.department, (m.locations || []).slice(0, 2).join(' / '), m.postedAt ? 'פורסם ' + fmtDate(m.postedAt) : '']
    .filter(Boolean).map(esc).join(' · ');
  return `
  <div style="border:1px solid ${isNew ? '#2f7d4f' : '#e2e5e1'};border-radius:10px;padding:14px;margin:0 0 12px;background:#fff">
    <div style="font-size:12px;font-weight:bold;color:#2f7d4f">${esc(m.company)}${isNew ? ' · <span style="background:#2f7d4f;color:#fff;border-radius:4px;padding:0 6px">חדש</span>' : ''}</div>
    <div style="font-size:17px;font-weight:bold;margin:4px 0;color:#1d2321">
      <span style="display:inline-block;background:${color};color:#fff;border-radius:12px;padding:0 8px;font-size:14px;margin-left:6px">${m.score}</span>${esc(m.title)}
    </div>
    <div style="font-size:13px;color:#66706c;margin-bottom:6px">${meta}</div>
    <div style="font-size:14px;color:#1d2321;line-height:1.5">${esc(m.reason)}</div>
    ${m.salary != null ? `<div style="margin-top:8px;font-size:13px;color:#1d2321"><b>שכר צפוי (הערכה): ${m.salary}/10</b>${m.salaryNote ? ' · ' + esc(m.salaryNote) : ''}</div>` : ''}
    <div style="margin-top:10px;font-size:13px;color:#66706c">מס' משרה: <b style="color:#1d2321">${esc(m.ref || m.id)}</b></div>
    <a href="${esc(m.url)}" style="display:inline-block;margin-top:8px;background:#2f7d4f;color:#fff;text-decoration:none;border-radius:6px;padding:8px 16px;font-weight:bold;font-size:14px">לצפייה במשרה ולהגשה</a>
  </div>`;
}

// Compact rows for the full list. Styles come from short classes in <head> (Gmail clips messages
// above ~100KB, and per-row inline styles would hit that as the list grows).
const LIST_CSS = `.fl{width:100%;border-collapse:collapse;background:#fff}.fl td{padding:6px 0;border-bottom:1px solid #eee;font-size:14px;vertical-align:top}
.fl .s{width:28px;padding-left:8px}.b{display:inline-block;min-width:20px;text-align:center;color:#fff;border-radius:10px;font-size:12px}
.b7{background:#2f7d4f}.b6{background:#5f8f2f}.b5{background:#8a7a00}.fl a{color:#1a5fb4;text-decoration:none;font-weight:bold}
.m{font-size:12px;color:#66706c}.n{color:#2f7d4f;font-size:11px}`;

function fullList(all, newKeys, max = 200) {
  const rows = all.slice(0, max).map(m => {
    const place = (m.locations || [])[0] || '';
    return `<tr><td class="s"><span class="b b${m.score >= 7 ? 7 : m.score >= 6 ? 6 : 5}">${m.score}</span></td>` +
      `<td><a href="${esc(m.url)}">${esc(m.title)}</a>${newKeys.has(m.key) ? ' <span class="n">חדש</span>' : ''}` +
      `<br><span class="m">${esc(m.company)}${place ? ' · ' + esc(place) : ''}${m.salary != null ? ` · שכר ${m.salary}/10` : ''} · מס' ${esc(m.ref || m.id)}</span></td></tr>`;
  }).join('');
  return `<div style="font-size:16px;font-weight:bold;margin:24px 0 6px;color:#1d2321">כל ההתאמות הפתוחות (${all.length}), לפי ציון</div>
    <table dir="rtl" class="fl">${rows}</table>${all.length > max ? `<div class="m">מוצגות ${max} הראשונות. הרשימה המלאה בדוח במחשב.</div>` : ''}`;
}

async function send(subject, inner) {
  if (!mailConfigured()) throw new Error('email is not set up yet (GMAIL_USER / GMAIL_APP_PASSWORD in .env)');
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, '');
  const html = `<html><head><meta charset="utf-8"><style>${LIST_CSS}</style></head><body>
    <div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;background:#f6f7f5;padding:16px;text-align:right">
    <div style="max-width:620px;margin:0 auto">${inner}</div></div></body></html>`;
  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  await transport.sendMail({ from: `"סוכן המשרות" <${user}>`, to: process.env.MAIL_TO || user, subject, html });
}

// Weekly digest: every still-open match at or above minScore, as full cards, best first.
export async function sendDigestEmail({ matches, minScore }) {
  matches = matches.filter(isShown);
  const top = matches.filter(m => m.score >= minScore);
  const when = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
  const inner = `<div style="font-size:20px;font-weight:bold;margin-bottom:4px;color:#1d2321">סיכום שבועי: המשרות הכי מתאימות</div>
    <div style="font-size:13px;color:#66706c;margin-bottom:14px">${top.length} משרות פתוחות עם ציון ${minScore} ומעלה, מתוך ${matches.length} התאמות פתוחות</div>
    ${top.length ? top.map(m => card(m, false)).join('') : '<p style="font-size:15px">השבוע אין משרות פתוחות בציון הזה.</p>'}`;
  await send(`סיכום שבועי: ${top.length} משרות בציון ${minScore}+ (${when})`, inner);
}

// newMatches: matches found this run; topOpen: best still-open matches (shown when nothing is new);
// allOpen: every open match, listed compactly at the bottom.
export async function sendRunEmail({ newMatches = [], topOpen = [], allOpen = [], stats = {}, failed = [], error = null, notice = '' }) {

  const when = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
  const subject = error ? `⚠️ סוכן המשרות נכשל (${when})`
    : newMatches.length ? `${newMatches.length} משרות חדשות מתאימות (${when})`
    : `הסוכן רץ, אין משרות חדשות (${when})`;

  const failNote = failed.length
    ? `<div style="background:#fff4e0;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:13px">מקורות שלא נגישים כבר כמה ריצות ברצף: ${failed.map(esc).join(', ')}. כנראה תקלה באתר שלהם. ההתאמות שלהם נשמרות, והסוכן ממשיך לנסות.</div>` : '';
  const summary = error ? '' : `<div style="font-size:13px;color:#66706c;margin-bottom:14px">
    נבדקו ${stats.inArea ?? '?'} משרות באזור שלך מ-${stats.sources ?? '?'} מקורות · ${stats.newCount ?? 0} חדשות · ${stats.totalMatches ?? 0} התאמות פתוחות בסך הכול</div>`;

  let body;
  if (error) {
    body = `<p style="font-size:15px">הריצה נעצרה בגלל שגיאה:</p>
      <pre style="background:#f6f7f5;padding:10px;border-radius:8px;white-space:pre-wrap;direction:ltr;text-align:left;font-size:12px">${esc(String(error).slice(0, 1500))}</pre>
      <p style="font-size:14px">הסוכן ינסה שוב בריצה הבאה. אם זה חוזר, הפרטים ביומן: logs\\agent.log</p>`;
  } else if (newMatches.length) {
    body = newMatches.map(m => card(m, true)).join('');
  } else {
    body = `<p style="font-size:15px;margin:0 0 12px">לא נמצאו משרות חדשות מתאימות בריצה הזו.</p>` +
      (topOpen.length ? `<div style="font-size:14px;font-weight:bold;margin:16px 0 8px">ההתאמות המובילות שעדיין פתוחות:</div>` +
        topOpen.map(m => card(m, false)).join('') : '');
  }

  const noticeNote = notice
    ? `<div style="background:#e8f0fe;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:13px">${esc(notice)}</div>` : '';
  await send(subject, `<div style="font-size:20px;font-weight:bold;margin-bottom:4px;color:#1d2321">סוכן המשרות</div>
      ${noticeNote}${summary}${failNote}${body}
      ${allOpen.length ? fullList(allOpen, new Set(newMatches.map(m => m.key))) : ''}`);
}
