// Ashby public job board API (documented). Config: { board: "<slug>" }
import { fetchJson, htmlToText } from '../lib/util.mjs';

export async function collect(c) {
  const d = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${c.board}`);
  return (d.jobs || []).filter(j => j.isListed !== false).map(j => ({
    id: j.id,
    title: j.title,
    department: [j.department, j.team].filter(Boolean).join(' / '),
    locations: [j.location, ...(j.secondaryLocations || []).map(s => s.location),
      j.address?.postalAddress?.addressCountry, j.isRemote ? 'Remote' : null].filter(Boolean),
    url: j.jobUrl,
    postedAt: j.publishedAt ? Date.parse(j.publishedAt) : null,
    description: j.descriptionPlain || htmlToText(j.descriptionHtml),
  }));
}
