// Elbit Systems (elbitsystemscareer.com): the site loads a full static JSON dump of all open jobs.
// Config: { url: "https://elbitsystemscareer.com/cron/jobs.json" }
import { fetchJson, htmlToText } from '../lib/util.mjs';

// City ids from the site's JS bundle (1228 is missing there, but its descriptions say Yokneam).
const CITIES = {
  416: 'חיפה', 1227: 'יקנעם', 1228: 'יקנעם', 524: 'כרמיאל', 868: 'נוף הגליל', 799: 'נוף הגליל', 2191: 'נצרת עלית',
  966: 'רמת השרון', 992: 'רחובות', 467: 'חולון', 134: 'באר שבע', 770: 'מודיעין', 816: 'נתניה', 628: 'לוד',
  975: 'רמלה', 1203: 'יבנה', 104: 'קריית שמונה', 935: 'קיסריה', 131: 'היברידי',
};

export async function collect(c) {
  const jobs = await fetchJson(`${c.url}?t=${Date.now()}`);
  return jobs.map(j => {
    const cityId = j.extendedProperties?.find(p => p.PropertyName === 'Cities')?.Value ?? j.city;
    // Description is HTML encoded as entities: the first pass decodes them, the second strips the tags.
    const description = htmlToText(htmlToText(j.description));
    const locations = [CITIES[cityId], j.area === 'Haifa' ? 'חיפה' : null, j.locationAddress].filter(Boolean);
    return {
      id: String(j.jobId),
      // Some jobs have no city: then the place can only be found in the description.
      areaText: CITIES[cityId] ? '' : description.slice(0, 600),
      ref: j.jobCode,
      title: j.jobTitle,
      department: j.employerName,
      locations,
      url: `https://elbitsystemscareer.com/job/?jid=${j.jobId}`,
      postedAt: j.openDate ? Date.parse(j.openDate) : null,
      description,
    };
  });
}
