// Watches a careers page that has no job list (only general text). The watched section becomes one
// "job" whose id is a hash of its text, so any change to the section shows up as a new item.
// Config: { url, start: "<text where the section starts>", end: "<text where it ends>", location: "..." }
import crypto from 'node:crypto';
import { fetchText, htmlToText } from '../lib/util.mjs';

export async function collect(c) {
  const text = htmlToText((await fetchText(c.url)).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ''));
  // The section heading also appears in the site menu, so the last occurrence is the page content.
  const from = text.lastIndexOf(c.start);
  if (from < 0) throw new Error(`section start "${c.start}" not found (page changed?)`);
  const to = text.indexOf(c.end, from);
  const section = text.slice(from, to > from ? to : from + 3000).trim();
  const hash = crypto.createHash('sha1').update(section).digest('hex').slice(0, 10);
  return [{
    id: hash,
    ref: 'פנייה כללית',
    title: `${c.name}: עמוד הקריירה (אין משרות מפורטות, פנייה ישירה)`,
    locations: [c.location].filter(Boolean),
    url: c.url,
    postedAt: null,
    description: section,
  }];
}
