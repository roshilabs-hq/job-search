// Bank Hapoalim: server-rendered lobby behind Imperva; plain fetch with a cookie jar passes it
// (the browser gets blocked on job pages). The region field is coarse, so the job page text is used for the area.
import { parse } from 'node-html-parser';
import { fetchText, htmlToText } from '../lib/util.mjs';

const SITE = 'https://www.bankhapoalim.co.il';

export async function collect() {
  const jar = new Map();
  const root = parse(await fetchText(`${SITE}/he/jobs-site/lobby`, { jar }));
  const jobs = root.querySelectorAll('a.views-row.job').map(a => {
    const id = (a.getAttribute('href') || '').match(/node\/(\d+)/)?.[1];
    return {
      id,
      title: htmlToText(a.querySelector('.job-name')?.innerHTML),
      locations: [htmlToText(a.querySelector('.job-area')?.innerHTML)].filter(Boolean),
      url: `${SITE}/forms/he/node/${id}`,
      postedAt: null,
    };
  }).filter(j => j.id);
  // Only a handful of jobs, so fetch every job page: the city (e.g. Nesher) is often only in the body.
  for (const j of jobs) {
    try {
      const page = parse(await fetchText(j.url, { jar }));
      j.description = htmlToText(page.querySelector('main')?.innerHTML).slice(0, 4000);
      j.areaText = j.description;
    } catch { j.description = ''; }
  }
  return jobs;
}
