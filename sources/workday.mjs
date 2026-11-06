// Workday careers sites (Intel, Philips, ...). Public JSON API, no browser needed.
// Config: { host: "intel.wd1.myworkdayjobs.com", tenant: "intel", site: "External", facets: { locations: ["<id>"] } }
import { fetchJson, htmlToText } from '../lib/util.mjs';

const base = c => `https://${c.host}/wday/cxs/${c.tenant}/${c.site}`;

// "Posted Today" / "Posted Yesterday" / "Posted 3 Days Ago" / "Posted 30+ Days Ago" -> epoch ms (approximate).
function parsePosted(s = '') {
  const day = 86400000;
  if (/today/i.test(s)) return Date.now();
  if (/yesterday/i.test(s)) return Date.now() - day;
  const n = s.match(/(\d+)\+? Days? Ago/i);
  return n ? Date.now() - Number(n[1]) * day : null;
}

const post = (c, body) => fetchJson(`${base(c)}/jobs`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify(body),
});

// Each Workday site names its country filter differently; find the facet value called "Israel".
function israelFacet(facets = []) {
  for (const f of facets) {
    for (const v of f.values || []) {
      if (/^israel$/i.test(v.descriptor || '')) return { [f.facetParameter]: [v.id] };
      const inner = israelFacet(v.values ? [{ facetParameter: v.facetParameter || f.facetParameter, values: v.values }] : []);
      if (inner) return inner;
    }
  }
  return null;
}

export async function collect(c) {
  let facets = c.facets;
  let searchText = c.searchText || '';
  if (!facets) {
    facets = israelFacet((await post(c, { appliedFacets: {}, limit: 1, offset: 0, searchText: '' })).facets);
    if (!facets) { facets = {}; searchText = searchText || 'Israel'; }
  }
  const jobs = [];
  for (let offset = 0; ; offset += 20) {
    const d = await post(c, { appliedFacets: facets, limit: 20, offset, searchText });
    jobs.push(...d.jobPostings);
    if (!d.jobPostings.length || jobs.length >= d.total) break;
  }
  return jobs.map(p => ({
    id: p.bulletFields?.[0] || p.externalPath,
    title: p.title,
    // locationsText can be "3 Locations"; the facet already limits results to the area, so add the facet's label.
    locations: [p.locationsText, 'Israel'].filter(Boolean),
    url: `https://${c.host}/${c.site}${p.externalPath}`,
    postedAt: parsePosted(p.postedOn),
    externalPath: p.externalPath,
  }));
}

export async function describe(c, ctx, jobs) {
  for (const j of jobs) {
    try {
      const d = await fetchJson(`${base(c)}${j.externalPath}`, { headers: { accept: 'application/json' } });
      j.description = htmlToText(d.jobPostingInfo?.jobDescription);
      if (d.jobPostingInfo?.startDate) j.postedAt = Date.parse(d.jobPostingInfo.startDate);
    } catch { j.description = ''; }
  }
}
