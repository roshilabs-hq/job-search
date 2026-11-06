// Checks that everything the agent needs is in place. Prints ✅/❌ per item, never a secret's value.
//   npm run check            all checks
//   npm run check -- --mail  also logs in to Gmail with the app password (sends nothing)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson } from '../lib/util.mjs';
import { SETTINGS_FILE, SECTORS } from '../lib/config.mjs';
import { CV_FILE } from '../lib/cv.mjs';

const ENV_FILE = path.join(ROOT, '.env');
if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const can = (cmd, args) => { try { execFileSync(cmd, args, { stdio: 'ignore', shell: true, timeout: 30000 }); return true; } catch { return false; } };
const edge = ['ProgramFiles(x86)', 'ProgramFiles'].map(v => process.env[v] && path.join(process.env[v], 'Microsoft/Edge/Application/msedge.exe'))
  .some(f => f && fs.existsSync(f));

const settings = readJson(SETTINGS_FILE, null);
const cv = readJson(CV_FILE, null);
const area = settings?.area || {};

export const checks = [
  ['node', 'Node.js 20 ומעלה', Number(process.versions.node.split('.')[0]) >= 20, 'מתקינים Node.js LTS: winget install OpenJS.NodeJS.LTS'],
  ['git', 'Git מותקן', can('git', ['--version']), 'Git מגיע עם Claude Code בווינדוס. אם חסר: winget install Git.Git'],
  ['claude', 'Claude Code זמין לסוכן', can('claude', ['--version']), 'הסוכן נותן ציון דרך Claude Code. פותחים טרמינל חדש ובודקים ש-claude --version עובד'],
  ['edge', 'Microsoft Edge (בשביל ה-PDF)', edge, 'Edge מותקן בכל ווינדוס. אם הוסר, מתקינים אותו מחדש מ-microsoft.com/edge'],
  ['profile', 'פרופיל (profile.md)', fs.existsSync(path.join(ROOT, 'profile.md')), 'עוברים את הריאיון: /start'],
  ['cv', 'קורות חיים (cv/base-cv.json)', Boolean(cv?.name && Array.isArray(cv?.experience)), 'עוברים את הריאיון: /start'],
  ['settings', 'הגדרות (settings.json)', Boolean(settings), 'עוברים את הריאיון: /start'],
  ['sectors', 'נבחר לפחות תחום אחד', Boolean(settings?.sectors?.some(s => SECTORS[s])), 'בוחרים תחומים: "תשנה את התחומים"'],
  ['area', 'הוגדר אזור', Boolean(area.anywhere || area.remote || area.places?.length), 'מגדירים אזור: "תשנה את האזור"'],
  ['salary', 'הוגדר שכר רצוי', Boolean(settings?.desiredSalary), 'בלי שכר רצוי, ציון השכר מוערך לפי הניסיון שלך. אפשר להוסיף: "תעדכן שכר רצוי"', true],
  ['mail', 'מייל הוגדר (.env)', Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD), 'בלי מייל, הסיכום נשמר רק בדוח במחשב. מקימים: "תגדיר לי מייל"', true],
];

async function main() {
  let ok = true;
  for (const [, label, pass, fix, optional] of checks) {
    console.log(`${pass ? '✅' : optional ? '⚪' : '❌'} ${label}${pass ? '' : `  ←  ${fix}`}`);
    if (!pass && !optional) ok = false;
  }
  if (process.argv.includes('--mail') && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    const { default: nodemailer } = await import('nodemailer');
    try {
      await nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, '') } }).verify();
      console.log('✅ ההתחברות ל-Gmail עובדת');
    } catch {
      ok = false;
      console.log('❌ ההתחברות ל-Gmail נכשלה  ←  בודקים שהמייל נכון ושהודבקה סיסמת אפליקציה (16 אותיות), לא הסיסמה הרגילה');
    }
  }
  process.exit(ok ? 0 : 1);
}

if (process.argv[1]?.endsWith('check-config.mjs')) main();
