// Decides whether a job is in Israel and in the user's chosen area. Replaces the fixed Haifa list
// of the original agent: the places come from settings.json, written by /start.

// Sources that list jobs worldwide; everything else is an Israeli site, so its jobs are in Israel.
const GLOBAL_PLATFORMS = new Set(['greenhouse', 'lever', 'ashby', 'google']);

const ISRAEL = new RegExp([
  'israel', 'ישראל', '\\bisr\\b',
  'tel[- ]?aviv', 'תל[- ]אביב', 'jerusalem', 'ירושלים', 'haifa', 'חיפה', 'herzli?ya', 'הרצליה',
  'petah? ?tikv?a', 'petach', 'פתח תקו?ה', "ra'?anana", 'רעננה', 'netanya', 'נתניה', 'rehovot', 'רחובות',
  "be'?er ?sheva", 'beersheba', 'באר שבע', 'yok?q?neam', 'יו?קנעם', 'caesarea', 'קיסריה', 'ramat gan', 'רמת גן',
  'givatayim', 'גבעתיים', 'hod hasharon', 'הוד השרון', 'kfar saba', 'כפר סבא', 'rosh ha.?ayin', 'ראש העין',
  'airport city', 'modi.?in', 'מודיעין', 'ashdod', 'אשדוד', 'ashkelon', 'אשקלון', 'rishon', 'ראשון לציון',
  'holon', 'חולון', 'bnei brak', 'בני ברק', '\\blod\\b', 'לוד', 'nazareth', 'נצרת', 'karmiel', 'כרמיאל',
  'kiryat gat', 'קריית גת', 'or yehuda', 'אור יהודה', 'yavne', 'יבנה', 'ness ziona', 'נס ציונה', 'glilot',
  'migdal ha.?emek', 'מגדל העמק', 'kiryat', 'קריית', 'קרית', 'matam',
].join('|'), 'i');

const REMOTE = /remote|work from home|wfh|hybrid|מהבית|היברידי|עבודה מרחוק/i;

const texts = j => [...(j.locations || []), j.areaText || ''];

export const isGlobal = company => GLOBAL_PLATFORMS.has(company.platform);
export const inIsrael = (job, company) => !isGlobal(company) || texts(job).some(t => ISRAEL.test(t));
export const isRemote = job => texts(job).some(t => REMOTE.test(t));

// area = { anywhere: bool, places: ["חיפה", "Haifa", "צפון", ...], remote: bool }
export function areaMatcher(area = {}) {
  const places = (area.places || []).map(p => String(p).trim().toLowerCase()).filter(p => p.length >= 2);
  return (job, company) => {
    if (!inIsrael(job, company)) return false;
    if (area.anywhere) return true;
    if (area.remote && isRemote(job)) return true;
    return texts(job).some(t => { const s = t.toLowerCase(); return places.some(p => s.includes(p)); });
  };
}

// Titles the user ruled out (e.g. "מהנדס", "developer"), matched as whole words where possible.
export function titleExcluder(words = []) {
  const list = words.map(w => String(w).trim()).filter(Boolean);
  if (!list.length) return () => false;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(list.map(w => (/^[a-z]/i.test(w) ? `\\b${esc(w)}(s|es)?\\b` : esc(w))).join('|'), 'i');
  return job => re.test(job.title || '');
}
