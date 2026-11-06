// Mizrahi-Tefahot: all jobs on one server-rendered page; region/field are data attributes.
// The unit code (JB-xxx) is not unique, so the URL slug is the id.
import { parse } from 'node-html-parser';
import { fetchText, htmlToText } from '../lib/util.mjs';

const BASE = 'https://www.mizrahi-tefahot.co.il/about-mizrahi-tefahot-he/career/open-jobs/';

export async function collect() {
  const root = parse(await fetchText(BASE));
  return root.querySelectorAll('div.job.filterItem').map(el => {
    const slug = (el.querySelector('a.toggler')?.getAttribute('href') || '').replace(/^.*\/|\/$/g, '') ||
      el.querySelector('a.toggler')?.getAttribute('href');
    const title = htmlToText(el.querySelector('h3')?.innerHTML);
    return {
      id: slug,
      title,
      department: htmlToText(el.getAttribute('data-jobfields') || ''),
      locations: [htmlToText(el.getAttribute('data-jobregions') || '')].filter(Boolean),
      areaText: title,
      url: BASE + slug + '/',
      postedAt: null,
      description: htmlToText(el.querySelector('.jobDescription .mizRteditor')?.innerHTML),
    };
  }).filter(j => j.id);
}
