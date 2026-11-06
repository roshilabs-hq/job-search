import { USER_AGENT } from '../lib/util.mjs';
// AllJobs guest search (plain fetch). Full descriptions are on the results page.
// The displayed date is the "bump" date, so new jobs are detected by JobID only.
// Config: { positions: "576,722,...", cities: "491,492,...", maxPages: 15 }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const decode = s => s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

function parsePage(html) {
  return html.split('<div class="job-content-top">').slice(1).map(c => {
    const between = (a, b) => { const i = c.indexOf(a); if (i < 0) return ''; const j = c.indexOf(b, i); return c.slice(i + a.length, j < 0 ? undefined : j); };
    const id = c.match(/UploadSingle\.aspx\?JobID=(\d+)/)?.[1];
    const company = decode(c.match(/<div class="T14">([\s\S]*?)<\/div>/)?.[1] || '');
    const locBlock = between('job-content-top-location', 'job-content-top-type');
    const desc = between(c.includes('AR RTL">') ? 'AR RTL">' : 'AL LTR">', 'job-content-top-moreimg')
      .replace(/<div class="job-content-top-desc">[\s\S]*$/, '');
    return {
      id,
      title: decode(c.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] || ''),
      company: `${company || 'חברה חסויה'} (AllJobs)`,
      locations: [...locBlock.matchAll(/city=\d+[^>]*>([^<]+)</g)].map(m => m[1].trim()),
      url: `https://www.alljobs.co.il/Search/UploadSingle.aspx?JobID=${id}`,
      postedAt: null,
      description: decode(desc),
    };
  }).filter(j => j.id);
}

// Two modes: a filtered guest search (positions + cities), or one employer's page ({ employer: cid }).
export async function collect(c) {
  const byId = new Map();
  for (let page = 1; page <= (c.maxPages || 15); page++) {
    const url = c.employer
      ? `https://www.alljobs.co.il/Employer/HP/Default.aspx?cid=${c.employer}&page=${page}`
      : `https://www.alljobs.co.il/SearchResultsGuest.aspx?page=${page}&position=${c.positions}&type=&city=${c.cities}&region=`;
    const r = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, 'accept-language': 'he-IL,he;q=0.9' },
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} on page ${page}`);
    let html = await r.text();
    // An employer page with no openings shows "similar jobs" from other companies below this marker.
    if (c.employer) html = html.split('class="title_similar_jobs"')[0];
    const jobs = parsePage(html).map(j => (c.employer ? { ...j, company: c.name } : j));
    if (!jobs.length) break;
    jobs.forEach(j => byId.set(j.id, j));   // the same job can repeat across pages
    await sleep(3000);                       // be gentle with the site
  }
  return [...byId.values()];
}
