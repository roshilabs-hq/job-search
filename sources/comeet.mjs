// Comeet careers. Two ways, both public:
//  - page:  { slug: "solaredge", uid: "71.00A" }  the public careers page carries its positions as JSON data
//  - api:   { uid: "72.008", token: "<public token>" }  the careers API, for companies that publish a token
// Jobs abroad are dropped by country, unless config.country is false.
import { fetchJson, fetchText, htmlToText, jsonAt } from '../lib/util.mjs';

// Descriptions sit in details (API) or custom_fields.details (careers page).
const details = p => htmlToText((p.details || p.custom_fields?.details || []).map(d => d.value).join(' '));

const toJob = p => ({
  id: p.uid,
  ref: p.uid,
  title: p.name,
  department: p.department || '',
  locations: [p.location?.city, p.location?.name, p.location?.country === 'IL' ? 'Israel' : null, p.location?.is_remote ? 'Remote' : null].filter(Boolean),
  // The company-site URL can sit behind bot protection; Comeet's hosted page always opens.
  url: p.url_comeet_hosted_page || p.url_active_page,
  postedAt: p.time_updated ? Date.parse(p.time_updated) : null,
  description: details(p) || undefined,
});

export async function collect(c) {
  const list = c.token
    ? await fetchJson(`https://www.comeet.co/careers-api/2.0/company/${c.uid}/positions?token=${c.token}&details=true`)
    : jsonAt(await fetchText(`https://www.comeet.com/jobs/${c.slug}/${c.uid}`), /COMPANY_POSITIONS_DATA\s*=\s*\[/);
  if (!Array.isArray(list)) throw new Error('positions data not found on the careers page (page changed?)');
  return list
    .filter(p => c.country === false || (p.location?.country || 'IL') === (c.country || 'IL'))
    .filter(p => !/general application/i.test(p.name || ''))   // open "job fair" CV pools, not real roles
    .map(toJob);
}

// Page mode has no descriptions in the list: each position page carries its own, read only for jobs to be scored.
export async function describe(c, ctx, jobs) {
  for (const j of jobs) {
    if (j.description) continue;
    try {
      const p = jsonAt(await fetchText(j.url), /POSITION_DATA\s*=\s*\{/);
      j.description = p ? details(p) : '';
    } catch { j.description = ''; }
  }
}
