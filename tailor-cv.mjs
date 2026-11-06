// Builds a CV tailored to one matched job, as a PDF (and emails it, when email is set up).
// Usage: node tailor-cv.mjs <job number | job key> [en]      without a job: node tailor-cv.mjs --base [en]
// Starts from cv/base-cv.json and rephrases, reorders and emphasizes for the job. It never invents facts:
// the model's answer is checked, and names, dates, places and contact details are restored from the base CV.
import nodemailer from 'nodemailer';
import { log, askClaude, parseJsonObject } from './lib/util.mjs';
import { loadBaseCv, findJob, writeCvPdf, safeName } from './lib/cv.mjs';
import { mailConfigured, oneLine } from './lib/mail.mjs';
import { tailorPrompt } from './lib/prompts.mjs';

const query = process.argv[2];
const lang = process.argv[3] === 'en' ? 'en' : 'he';
if (!query) { console.error('usage: node tailor-cv.mjs <job number | key> [en]   or   node tailor-cv.mjs --base [en]'); process.exit(1); }

const base = loadBaseCv();
const cvWord = lang === 'en' ? 'CV' : 'קורות_חיים';

// --base: the plain CV as a PDF (used at the end of the interview in /start).
if (query === '--base') {
  log(`PDF: ${writeCvPdf(base, `${safeName(base.name)}_${cvWord}`, lang)}`);
  process.exit(0);
}

const job = findJob(query);
if (!job) { console.error(`job "${query}" not found among open matches`); process.exit(1); }

log(`tailoring CV for ${job.company} | ${job.title} (${job.ref || job.id})...`);
const cv = parseJsonObject(askClaude(tailorPrompt({ base, job, lang })));

// Facts that must not change: guard against the model touching them.
if (!Array.isArray(cv.experience) || cv.experience.length !== (base.experience || []).length) throw new Error('model changed the experience structure');
cv.experience.forEach((e, i) => { e.years = base.experience[i].years; });
if (lang === 'he') {
  for (const k of ['name', 'contact', 'military']) cv[k] = base[k];
  cv.experience.forEach((e, i) => { e.title = base.experience[i].title; e.place = base.experience[i].place; });
} else {
  // In English the contact line is translated, but the email and phone must stay exactly as they are.
  const keep = (base.contact || '').match(/[\w.+-]+@[\w.-]+|\+?\d[\d -]{7,}\d/g) || [];
  if (!keep.every(k => (cv.contact || '').includes(k))) cv.contact = base.contact;
}

const pdf = writeCvPdf(cv, `${safeName(base.name)}_${cvWord}_${safeName(job.title)}`, lang);
log(`PDF: ${pdf}`);
for (const c of cv.changes || []) log(`  - ${c}`);

if (mailConfigured()) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const user = process.env.GMAIL_USER;
  await nodemailer.createTransport({ service: 'gmail', auth: { user, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, '') } }).sendMail({
    from: `"סוכן המשרות" <${user}>`,
    to: process.env.MAIL_TO || user,
    subject: oneLine(`קורות חיים מותאמים: ${job.title} (${job.company})`),
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">
      <p>מצורפים קורות חיים מותאמים למשרה <b>${esc(job.title)}</b> ב${esc(job.company)} (מס' ${esc(job.ref || job.id)}).</p>
      <p><b>מה שונה:</b></p><ul>${(cv.changes || []).map(c => `<li>${esc(c)}</li>`).join('')}</ul>
      <p>כדאי לעבור על הקובץ לפני ההגשה. <a href="${esc(job.url)}">לעמוד המשרה</a></p></div>`,
    attachments: [{ filename: pdf.split(/[\\/]/).pop(), path: pdf }],
  });
  log('tailored CV emailed');
}
