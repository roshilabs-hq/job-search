// Greenhouse Job Board API (public, documented for exactly this use). Config: { board: "<slug>", eu?: true }
import { fetchJson, htmlToText } from '../lib/util.mjs';

export async function collect(c) {
  const host = c.eu ? 'boards-api.eu.greenhouse.io' : 'boards-api.greenhouse.io';
  const d = await fetchJson(`https://${host}/v1/boards/${c.board}/jobs?content=true`);
  return (d.jobs || []).map(j => ({
    id: String(j.id),
    title: j.title,
    department: (j.departments || []).map(x => x.name).join(', '),
    locations: [j.location?.name, ...(j.offices || []).map(o => o.name)].filter(Boolean),
    url: j.absolute_url,
    postedAt: j.first_published ? Date.parse(j.first_published) : (j.updated_at ? Date.parse(j.updated_at) : null),
    // content arrives HTML-escaped: decode the entities first, then strip the tags.
    description: htmlToText(htmlToText(j.content)),
  }));
}
