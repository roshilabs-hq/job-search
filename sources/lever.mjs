// Lever Postings API (public, documented). Config: { board: "<slug>", eu?: true }
import { fetchJson, htmlToText } from '../lib/util.mjs';

export async function collect(c) {
  const host = c.eu ? 'api.eu.lever.co' : 'api.lever.co';
  const list = await fetchJson(`https://${host}/v0/postings/${c.board}?mode=json`);
  return list.map(p => ({
    id: p.id,
    title: p.text,
    department: [p.categories?.department, p.categories?.team].filter(Boolean).join(' / '),
    locations: [...new Set([p.categories?.location, ...(p.categories?.allLocations || []), p.workplaceType === 'remote' ? 'Remote' : null].filter(Boolean))],
    url: p.hostedUrl,
    postedAt: p.createdAt || null,
    description: [p.descriptionPlain, ...(p.lists || []).map(l => `${l.text}: ${htmlToText(l.content)}`), p.additionalPlain]
      .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
  }));
}
