// Comeet careers API (public token from the company's careers site). Plain fetch, descriptions included.
// Config: { uid: "72.008", token: "<public token>", country: "IL" }
import { fetchJson, htmlToText } from '../lib/util.mjs';

export async function collect(c) {
  const list = await fetchJson(`https://www.comeet.co/careers-api/2.0/company/${c.uid}/positions?token=${c.token}&details=true`);
  return list
    .filter(p => !c.country || p.location?.country === c.country)
    .filter(p => !/general application/i.test(p.name || ''))      // open "job fair" CV pools, not real roles
    .map(p => ({
      id: p.uid,
      ref: p.uid,
      title: p.name,
      department: p.department || '',
      locations: [p.location?.city, p.location?.name].filter(Boolean),
      // The company-site URL can sit behind bot protection; Comeet's hosted page always opens.
      url: p.url_comeet_hosted_page || p.url_active_page,
      postedAt: p.time_updated ? Date.parse(p.time_updated) : null,
      description: htmlToText((p.details || []).map(d => d.value).join(' ')),
    }));
}
