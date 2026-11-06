// Eightfold careers sites (Microsoft, Qualcomm, Amdocs, ...): the public search API the careers page itself uses.
// Config: { site: "https://apply.careers.microsoft.com", domain: "microsoft.com", location: "Israel" }
import { fetchJson, htmlToText } from '../lib/util.mjs';

export async function collect(c) {
  const loc = encodeURIComponent(c.location || 'Israel');
  const all = [];
  for (let s = 0; s < 1000; s += 10) {
    const d = (await fetchJson(`${c.site}/api/pcsx/search?domain=${c.domain}&query=&location=${loc}&start=${s}&sort_by=timestamp`)).data;
    all.push(...(d?.positions || []));
    if (!d?.positions?.length || all.length >= d.count) break;
    await new Promise(r => setTimeout(r, 1500));   // the API rate-limits quick paging
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
      const d = await fetchJson(`${c.site}/api/pcsx/position_details?position_id=${j.id}&domain=${c.domain}&hl=en`);
      j.description = htmlToText(d.data?.jobDescription);
      await new Promise(r => setTimeout(r, 500));
    } catch { j.description = ''; }
  }
}
