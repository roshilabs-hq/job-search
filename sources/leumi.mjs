// Bank Leumi: all jobs (with full descriptions) are server-rendered on one page.
// No city field and no dates: region is one of מרכז/צפון/דרום/..., the city appears only in the title.
import { parse } from 'node-html-parser';
import { fetchText } from '../lib/util.mjs';

const LIST = 'https://www.leumi.co.il/he/leumi_main/searchjobs';

export async function collect() {
  const root = parse(await fetchText(LIST));
  return root.querySelectorAll('div.table-row').map(row => {
    const id = row.querySelector('input[name=job_checkbox]')?.getAttribute('value');
    const full = row.querySelector('div.full-job') || row.nextElementSibling;
    const txt = sel => full?.querySelector(sel)?.text.replace(/\s+/g, ' ').trim() || '';
    const title = row.querySelector('div.role button')?.text.replace(/\s+/g, ' ').trim() || '';
    const description = [txt('.job-description-text'), txt('.job-requirements-text'),
      txt('.job-subordination-text') && 'כפיפות: ' + txt('.job-subordination-text')].filter(Boolean).join(' ');
    return {
      id,
      ref: title.match(/(\d+)$/)?.[1],
      title: title.replace(/\s+\d+$/, ''),          // titles end with an internal number
      department: txt('.department-text a'),
      locations: row.querySelectorAll('div.area span').flatMap(s => s.text.split(/\n/)).map(s => s.trim()).filter(Boolean),
      areaText: title + ' ' + description,
      url: `https://www.leumi.co.il/he/about/career/Job/${id}`,
      postedAt: null,
      description,
    };
  }).filter(j => j.id);
}
