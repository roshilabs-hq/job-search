// Google careers: job data is embedded in the results HTML as AF_initDataCallback({key: 'ds:1', ...}).
// The structure is undocumented and index-based, so it is validated before use.
// Config: { location: "Haifa, Israel" }
import { htmlToText, USER_AGENT, jsonArrayAt } from '../lib/util.mjs';

const BASE = 'https://www.google.com/about/careers/applications/jobs/results';
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function collect(c) {
  const jobs = [];
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(`${BASE}?location=${encodeURIComponent(c.location)}&page=${page}`, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = jsonArrayAt(await r.text(), /AF_initDataCallback\(\{key: 'ds:1'[^]*?data:\s*\[/);
    if (!data) throw new Error('embedded job data not found (page structure changed?)');
    const [list, , total] = data;
    if (!Array.isArray(list)) throw new Error('unexpected data shape');
    for (const p of list) {
      if (!Array.isArray(p[9])) throw new Error('unexpected job shape');
      jobs.push({
        id: String(p[0]),
        title: p[1],
        locations: p[9].map(l => l[0]),
        url: `${BASE}/${p[0]}-${slug(p[1])}`,
        postedAt: p[14]?.[0] ? p[14][0] * 1000 : null,
        description: htmlToText([p[3]?.[1], p[19]?.[1], p[4]?.[1]].filter(Boolean).join(' ')),
      });
    }
    if (!list.length || jobs.length >= total) break;
  }
  return jobs;
}
