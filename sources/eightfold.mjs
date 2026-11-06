// Eightfold careers sites (Microsoft, Qualcomm, Amdocs, ...): the public search API the careers page itself uses.
// Config: { site: "https://apply.careers.microsoft.com", domain: "microsoft.com", location: "Israel" }
import { fetchJson, htmlToText } from '../lib/util.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
// The API answers quick paging with HTTP 429: wait and retry the same page instead of starting over.
async function get(url) {
  for (let t = 1; ; t++) {
    try { return await fetchJson(url); } catch (e) {
      if (t > 3 || !/HTTP 429/.test(e.message)) throw e;
      await sleep(10000 * t);
    }
  }
}

export async function collect(c) {
  const loc = encodeURIComponent(c.location || 'Israel');
  const all = [];
  for (let s = 0; s < 1000; s += 10) {
    const d = (await get(`${c.site}/api/pcsx/search?domain=${c.domain}&query=&location=${loc}&start=${s}&sort_by=timestamp`)).data;
    all.push(...(d?.positions || []));
    if (!d?.positions?.length || all.length >= d.count) break;
    await sleep(2000);   // the API rate-limits quick paging
  }
  return all.map(p => ({
    id: String(p.id),
    ref: p.displayJobId,
    title: p.name,
    department: p.department,
    locations: [...(p.locations || []), ...(p.standardizedLocations || []), 'Israel'],
    url: `${c.site}/careers/job/${p.id}`,
    postedAt: p.postedTs ? p.postedTs * 1000 : null,
  }));
}

export async function describe(c, ctx, jobs) {
  for (const j of jobs) {
    try {
      const d = await get(`${c.site}/api/pcsx/position_details?position_id=${j.id}&domain=${c.domain}&hl=en`);
      j.description = htmlToText(d.data?.jobDescription);
      await sleep(500);
    } catch { j.description = ''; }
  }
}
