// SmartRecruiters Posting API (public, documented). Israel postings only. Config: { board: "<company identifier>" }
import { fetchJson, htmlToText } from '../lib/util.mjs';

const API = 'https://api.smartrecruiters.com/v1/companies';

export async function collect(c) {
  const out = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const d = await fetchJson(`${API}/${c.board}/postings?country=il&limit=100&offset=${offset}`);
    out.push(...(d.content || []));
    if (out.length >= d.totalFound || !d.content?.length) break;
  }
  return out.map(p => ({
    id: p.id,
    ref: p.refNumber?.length < 20 ? p.refNumber : undefined,
    title: p.name,
    department: p.department?.label || p.function?.label || '',
    locations: [p.location?.fullLocation?.replace(/,\s*,/g, ','), p.location?.remote ? 'Remote' : null,
      p.location?.hybrid ? 'Hybrid' : null].filter(Boolean),
    url: `https://jobs.smartrecruiters.com/${c.board}/${p.id}`,
    postedAt: p.releasedDate ? Date.parse(p.releasedDate) : null,
  }));
}

// The list has no description; it is fetched per job, only for jobs that are about to be scored.
export async function describe(c, ctx, jobs) {
  for (const j of jobs) {
    try {
      const d = await fetchJson(`${API}/${c.board}/postings/${j.id}`);
      j.description = htmlToText(Object.values(d.jobAd?.sections || {}).map(s => s.text).join(' '));
    } catch { j.description = ''; }
  }
}
