// Public-sector job sources: municipal personnel tenders, a water utility, and the Civil Service Commission.
// Config: { mode, ... } where mode is one of the parsers below. All plain fetch, no browser.
import { fetchJson, fetchText, htmlToText, jsonArrayAt } from '../lib/util.mjs';

const job = (j) => ({ postedAt: null, department: '', description: '', ...j, id: String(j.id) });

// "dd/mm/yyyy" -> epoch ms
const dmy = s => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? Date.UTC(+m[3], m[2] - 1, +m[1]) : null; };

const sharePointRows = html => jsonArrayAt(html, /"Row"\s*:\s*\[/) || [];

const MODES = {
  // SharePoint "Info/Pages" list (Yokneam, Migdal HaEmek): rows embedded as JSON. Config: { url, place }
  async sharepoint(c) {
    const base = new URL(c.url).origin;
    // titleExclude drops procurement tenders that share the list with personnel tenders (Migdal HaEmek).
    const drop = c.titleExclude ? new RegExp(c.titleExclude) : null;
    return sharePointRows(await fetchText(c.url)).filter(r => !drop || !drop.test(htmlToText(r.Title))).map(r => {
      const dir = String(r.FileRef || '').replace(/\/[^/]*$/, '');
      return job({
        id: r.ID, title: htmlToText(r.Title), locations: [c.place],
        url: `${base}${dir}/CustomDispForm.aspx?ID=${r.ID}`,
        description: `מכרז/משרה ב${c.name}. ${Object.entries(r).filter(([k, v]) => /^_x05/.test(k) && !k.includes('.') && typeof v === 'string' && v).map(([, v]) => v).join(' · ')}`,
      });
    });
  },

  // A page listing jobs as links (Tirat Carmel, Kiryat Motzkin, Kiryat Yam, Zevulun).
  // Config: { url, link: "<href regex>", titleFilter?: "<regex>", place }
  async links(c) {
    // Some sites write hrefs with numeric entities (&#x5DE;); decode them so the pattern can match.
    const html = (await fetchText(c.url)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
    const re = new RegExp(`<a[^>]+href="([^"]*${c.link}[^"]*)"[^>]*>([\\s\\S]{0,400}?)<\\/a>`, 'g');
    const keep = c.titleFilter ? new RegExp(c.titleFilter) : null;
    const byId = new Map();
    for (const [, href, inner] of html.matchAll(re)) {
      const title = htmlToText(inner);
      if (!title || (keep && !keep.test(title))) continue;
      const url = new URL(href.replace(/&amp;/g, '&'), c.url).href;
      byId.set(url, job({ id: url.replace(/^https?:\/\/[^/]+/, ''), title, locations: [c.place], url, description: `מכרז/משרה ב${c.name}.` }));
    }
    return [...byId.values()];
  },

  // Malam HRCULES candidate portal (Nesher, Kiryat Bialik). Config: { customer: "Nesher", place }
  async malam(c) {
    const API = 'https://hrm-api.malam-payroll.com/hrm-ws/public/';
    const headers = { 'content-type': 'application/json; charset=UTF-8', accept: 'application/json', VER: '1', lang: 'he', Authorization: 'Bearer', referer: 'https://hrm-cand.malam-payroll.com/' };
    const currentUrl = `https://hrm-cand.malam-payroll.com/jobs/${c.customer}`;
    const cust = await fetchJson(`${API}getCustomerData?customerUrlParam=${c.customer}&currentUrl=${encodeURIComponent(currentUrl)}`, { headers });
    const d = await fetchJson(`${API}getJobsList`, {
      method: 'POST', headers,
      body: JSON.stringify({ jobType: null, jobNum: null, jobClassification: null, freeText: '', indexNum: cust.indexNum, currentUrl }),
    });
    return (d.list || []).map(x => job({
      id: x.jobDetailsId, ref: x.jobCode, title: x.jobTitle, locations: [c.place],
      url: `https://hrm-cand.malam-payroll.com/job/${c.customer}/${x.officeNum}/${x.jobDetailsId}`,
      postedAt: dmy(x.createdDate), description: htmlToText(x.jobDescription || x.description || ''),
    }));
  },

  // WordPress GeoDirectory tenders (Kiryat Ata); category 123 = open personnel tenders.
  async geodir(c) {
    const list = await fetchJson(`${c.url}?per_page=60`);
    return list.filter(x => (x.post_category || []).some(p => p.id === c.category)).map(x => job({
      id: x.id, title: htmlToText(x.title?.rendered || x.title?.raw), locations: [c.place], url: x.link,
      description: htmlToText(x.content?.rendered || '').slice(0, 3000),
    }));
  },

  // WordPress posts in one category (Mei Carmel personnel tenders). Config: { url: ".../wp-json/wp/v2/posts?categories=18" }
  async wpposts(c) {
    const list = await fetchJson(`${c.url}&per_page=30&_fields=id,date,link,title,content`);
    return list.map(p => job({
      id: p.id, title: htmlToText(p.title?.rendered), locations: [c.place], url: p.link,
      postedAt: p.date ? Date.parse(p.date) : null, description: htmlToText(p.content?.rendered).slice(0, 3000),
    }));
  },

  // Civil Service Commission tenders (OData): all ministries, tax authority, government hospitals.
  async civilservice(c) {
    const d = await fetchJson('https://merkava.mrp.gov.il/sap/opu/odata/ILG/GIUS_PUBLIC_AREA_SRV/TenderDataSet?$format=json');
    const ms = s => Number(String(s || '').match(/\d+/)?.[0]) || null;
    return (d.d?.results || []).filter(t => !c.areas || c.areas.includes(t.Area)).map(t => job({
      id: t.TenderNumber || t.RequestId, ref: t.TenderNumber, title: t.TenderName || t.JobName,
      department: [t.OfficeName, t.OfficeUnitName].filter(Boolean).join(' / '),
      locations: [t.LocationName, t.Area].filter(Boolean),
      url: 'https://merkava.mrp.gov.il/giusp/index.html#/',
      postedAt: ms(t.TenderPublicationDate),
      description: `${htmlToText(t.JobDes)} דרישות: ${htmlToText(t.JobRequirements)} דירוג: ${t.JobRatingName || ''} דרגות ${t.RankFrom}-${t.RankTo}. הגשה עד ${new Date(ms(t.LastSubmittingDate) || 0).toLocaleDateString('he-IL')}.`.slice(0, 3000),
    }));
  },
};

export async function collect(c) {
  const fn = MODES[c.mode];
  if (!fn) throw new Error(`unknown public mode "${c.mode}"`);
  return fn(c);
}
