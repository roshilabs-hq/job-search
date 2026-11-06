// First International Bank (FIBI): no recruiting system; jobs are sections of article pages
// (bank + Mataf subsidiary), applications by email. Location appears only in the title/body text.
import { parse } from 'node-html-parser';
import { fetchText, htmlToText } from '../lib/util.mjs';

const PAGES = [
  ['הבינלאומי', 'https://www.fibi.co.il/private/general/about/jobs/jobsfibi/'],
  ['מת"ף', 'https://www.fibi.co.il/private/general/about/jobs/jobsmataf/'],
];

export async function collect() {
  const jobs = [];
  for (const [unit, url] of PAGES) {
    const root = parse(await fetchText(url));
    for (const s of root.querySelectorAll('section[id^=section_]')) {
      const title = htmlToText(s.querySelector('h2')?.innerHTML);
      if (!title || /מדיניות הפרטיות/.test(title)) continue;
      const description = htmlToText(s.innerHTML).replace(title, '').trim();
      const place = title.match(/\(([^)]*מיקום[^)]*)\)/)?.[1] || description.match(/ברחבי הארץ|מגוון סניפים/)?.[0];
      jobs.push({
        id: s.getAttribute('id').replace('section_', ''),
        title,
        department: unit,
        locations: place ? [place] : [],
        areaText: title + ' ' + description,
        url: `${url}#${s.getAttribute('id')}`,
        postedAt: null,
        description: description + ' (הגשה במייל: jobs@fibi.co.il)',
      });
    }
  }
  return jobs;
}
