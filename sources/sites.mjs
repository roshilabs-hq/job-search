// Custom careers sites, one small parser each (plain fetch, no browser). Recipes verified 2026-10-08.
// Config: { site: "<key in SITES>" }. Each parser returns normalized jobs.
import { USER_AGENT } from '../lib/util.mjs';

const H = { 'user-agent': USER_AGENT, 'accept-language': 'he-IL,he;q=0.9' };
const get = async (u, o = {}) => {
  const r = await fetch(u, { ...o, headers: { ...H, ...(o.headers || {}) }, signal: AbortSignal.timeout(90_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
  return r;
};
const txt = s => String(s || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();
const m1 = (s, re) => (s.match(re) || [])[1];
const job = j => ({ postedAt: null, department: '', locations: [], ...j, id: String(j.id) });

const SITES = {
  // Harel: AdamTotal (Adam Milo), server-rendered, 25 per page (pages are heavy: logos inlined as base64).
  async harel() { return SITES.adamtotal({ token: '6675d401-0dee-428a-a776-5d41885d16b0-harel' }); },

  // AdamTotal (Adam Milo) career sites, shared by several companies. Config: { token }.
  async adamtotal(c) {
    const token = c.token;
    const out = [];
    let page = 1, last = 1;
    do {
      const h = await (await get(`https://career.adamtotal.co.il/Home/Index?page=${page}&token=${token}`)).text();
      last = +(m1(h, /PagedList-skipToLast"><a href="[^"]*page=(\d+)/) || last);
      for (const a of h.split('<article class="job-card"').slice(1)) {
        const title = txt(m1(a, /data-job-title="([^"]*)"/));
        const loc = txt(m1(a, /fa-map-marker-alt"[^>]*><\/i>([^<]*)/));
        const description = txt(m1(a, /class="description-text">([\s\S]*?)<\/div>/));
        out.push(job({
          id: m1(a, /data-job-id="(\d+)"/), title,
          department: txt(m1(a, /fa-building"[^>]*><\/i>([^<]*)/)),
          locations: loc.split('|').map(s => s.trim()).filter(Boolean),
          areaText: title + ' ' + description,
          url: 'https://career.adamtotal.co.il' + (m1(a, /href="(\/Jobs\/JobDetails\?[^"]*)"/) || '').replace(/&amp;/g, '&'),
          description,
        }));
      }
      page++;
    } while (page <= last && page <= 10);
    return out;
  },

  // Migdal: one JSON call; no per-job URL (accordion page, apply by email).
  async migdal() {
    const j = await (await get('https://my.migdal.co.il/data/api/ContentData/FrontContentData/?ListType=Jobs&Source=content')).json();
    return j.Data.map(x => {
      const description = txt(`${x.jobDescription} ${x.requirements}`) + (x.emailAddressCV ? ` (הגשה: ${x.emailAddressCV})` : '');
      return job({
        id: x._id, title: x.jobTitle, locations: [x.jobLocation].filter(Boolean),
        department: (x.jobArea || []).filter(Boolean).map(a => a.areaTitle).join(', '),
        areaText: `${x.jobTitle} ${description}`, url: 'https://www.migdal.co.il/about/jobs',
        postedAt: x._updateDate ? Date.parse(x._updateDate) : null, description,
      });
    });
  },

  // Clal: one JSON POST.
  async clal() {
    const j = await (await get('https://www.clalbit.co.il/umbraco/surface/JobSearch/GetInitData?IsClal4UBool=false', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' }, body: '{}',
    })).json();
    return j.Jobs.map(x => job({
      id: x.JobId, title: x.JobTitle, department: x.FieldDesc, locations: [x.Location].filter(Boolean),
      url: `https://www.clalbit.co.il/careers/candidacy/?txtjobId=${x.JobId}`, description: txt(`${x.JobDesc} ${x.Qualifications}`),
    }));
  },

  // Menora: Next.js data; Radware may answer with a captcha page. Region field is unreliable, so text is scanned too.
  async menora() {
    const h = await (await get('https://www.menoramivt.co.il/job-posting/open-position')).text();
    if (/Radware/i.test(h)) throw new Error('Radware captcha page');
    const d = JSON.parse(m1(h, /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/));
    let c = d.props.pageProps.childProps;
    if (typeof c === 'string') c = JSON.parse(c);
    return c.metadata.positions.map(p => job({
      id: p.positionId, title: p.positionName, department: [p.jobType, p.subCategory].filter(Boolean).join(' / '),
      locations: [p.localityLongName].filter(Boolean), areaText: `${p.positionName} ${p.jobDescription || ''}`,
      url: `https://www.menoramivt.co.il/job-posting/details?entityId=${p.positionId}`,
      postedAt: p.recruitingStartDate ? Date.parse(p.recruitingStartDate) : null, description: txt(p.jobDescription),
    }));
  },

  // Isracard: Wix warmup data. Only region codes (north code not observed yet), so title/text are scanned too.
  async isracard() {
    const h = await (await get('https://www.isracard.co.il/career/jobs')).text();
    const w = JSON.parse(m1(h, /<script type="application\/json" id="wix-warmup-data">([\s\S]*?)<\/script>/));
    const AREAS = { 30: 'השרון', 40: 'מרכז', 70: 'דרום' };
    return Object.values(w.appsWarmupData.dataBinding.dataStore.recordsByCollectionId.JobObject).map(r => {
      const description = txt(`${r.JobDescription || ''} ${r.JobRequires || ''}`);
      return job({
        id: r.JobNumber, title: r.title, locations: [AREAS[r.JobAreaCode1] || ''].filter(Boolean),
        areaText: `${r.title} ${description}`, url: `https://www.isracard.co.il/career/job/${r.JobNumber}`, description,
      });
    });
  },

  // Max: lobby list + one article call per job; location only in free text ("אתר צפון", "צ'ק פוסט").
  async max() {
    const L = await (await get('https://www.max.co.il/api/lobby/getLobby?lobbyName=jobs&page=0&isMobile=false&catHashName=&isBusiness=false')).json();
    const out = [];
    for (const p of L.result.categories[0].pages.pages) {
      const slug = new URL(p.linkUrl, 'https://www.max.co.il').pathname.split('/').pop();
      // One failed article shouldn't sink the whole source; it is skipped and picked up next run.
      let a;
      try {
        a = (await (await get(`https://www.max.co.il/api/Magazine/GetGeneralArticle?articleUrlName=${encodeURIComponent(slug)}&categoryUrlName=jobs`)).json()).result.article;
      } catch { continue; }
      await new Promise(r => setTimeout(r, 500));   // the site seems to block rapid bursts
      const description = txt(a.text);
      out.push(job({ id: slug, title: a.title, areaText: `${a.title} ${description}`, url: `https://www.max.co.il/jobs/pages/${slug}`, description }));
    }
    return out;
  },

  // Cal: static HTML (its WAF rejects curl, Node fetch passes); no per-job URL.
  async cal() {
    const h = await (await get('https://www.cal-online.co.il/about/jobs/')).text();
    return h.split('class="container jobItem"').slice(1).map(b => {
      const title = txt(m1(b, /<h3[^>]*>([\s\S]*?)<\/h3>/));
      const description = txt(m1(b, /<\/h3>\s*<div>([\s\S]*?)<\/div>/));
      return job({ id: m1(b, /data-job-id="([^"]+)"/), title, areaText: `${title} ${description}`, url: 'https://www.cal-online.co.il/about/jobs/', description });
    }).filter(j => j.id !== 'undefined');
  },

  // Israel Electric: jobs embedded as `const orders = JSON.parse(`...`)`; unescaped without running site code.
  async iec() {
    const h = await (await get('https://careers.iec.co.il/?referid&freeText')).text();
    const marker = 'const orders = JSON.parse(`';
    const start = h.indexOf(marker);
    if (start < 0) throw new Error('orders blob not found');
    let i = start + marker.length;
    while (h[i] !== '`' || h[i - 1] === '\\') i++;
    const map = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
    const raw = h.slice(start + marker.length, i).replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (m, g) => {
      if (g[0] === 'u') return String.fromCodePoint(parseInt(g.replace(/[u{}]/g, ''), 16));
      if (g[0] === 'x' && g.length === 3) return String.fromCharCode(parseInt(g.slice(1), 16));
      return map[g] !== undefined ? map[g] : g;
    });
    return Object.values(JSON.parse(raw)).map(o => job({
      id: o.order_id, title: String(o.name).trim(), department: [o.agaf, o.machlaka].filter(Boolean).join(' / '),
      locations: [txt(o.areas)].filter(Boolean), url: o.link || `https://careers.iec.co.il/order/${o.order_id}/`,
      description: txt(o.content) + (o.last_date ? ` (מועד אחרון להגשה: ${o.last_date})` : ''),
    }));
  },

  // Haifa municipality: tenders + openings tables; details live in PDFs, so only the title is available.
  async haifamuni() {
    const h = await (await get('https://www.haifa.muni.il/resident-service/jobs/')).text();
    const out = [];
    h.split(/<table/).slice(1).forEach((t, ti) => {
      for (const r of t.split(/<tr /).slice(1).filter(r => /data-end-date/.test(r))) {
        const a = r.match(/<a class="crm-pdf-file[^"]*" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
        const apply = (m1(r, /href="(https:\/\/www\.jobbing\.co\.il\/[^"]+)"/) || '').replace(/&amp;|&#038;/g, '&');
        const id = m1(apply, /FC=(\d+)/);
        if (!a || !id) continue;
        const deadline = m1(r, /data-new_publish_end="([^"]+)"/);
        out.push(job({
          id, title: txt(a[2]), department: ti === 0 ? 'מכרז' : 'דרושים', locations: ['חיפה'],
          url: apply || a[1].replace(/&#038;/g, '&'),
          description: `${ti === 0 ? 'מכרז כוח אדם' : 'משרה'} בעיריית חיפה. הפרטים המלאים בקובץ המכרז: ${a[1]}` + (deadline ? ` (מועד אחרון: ${deadline})` : ''),
        }));
      }
    });
    return out;
  },

  // Clalit: Niloosoft CandidateAPI, all jobs in one POST.
  async clalit() {
    const list = await (await get('https://jobs.clalitapps.co.il/CandidateAPI/api//position/Search/9E6C0368-A39E-4D83-803E-CF2AF0BA28DD', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=UTF-8', referer: 'https://jobs.clalitapps.co.il/clalit/index.html?ci=0' },
      body: JSON.stringify({ KeyWords: '', CategoryId: ['0'], countryId: 2, cityId: [] }),
    })).json();
    return (Array.isArray(list) ? list : list.positions || list.Positions || []).map(p => job({
      id: p.compPositionID, title: p.jobTitleText, department: [p.fieldDesc, p.affiliateDisplayName].filter(Boolean).join(' / '),
      locations: [p.location, p.displayLocation].filter(Boolean),
      url: `https://jobs.clalitapps.co.il/clalit/redmatch-apply/redmatch.apply.html?compPositionID=${p.compPositionID}`,
      postedAt: p.activationDate ? Date.parse(p.activationDate) : null, description: txt(p.description || p.shortDescription),
    }));
  },

  // Tower Semiconductor: SuccessFactors-fed WordPress table ("loactions" is the site's own spelling).
  async tower() {
    const h = await (await get('https://careers.towersemi.com/our-loactions/israel/')).text();
    return [...h.matchAll(/<tr data-job_id="(\d+)"><td><a href="([^"]+)"\s*>([^<]*)<\/a><\/td><td>([^<]*)<\/td><td>([^<]*)<\/td>/g)]
      .map(([, id, href, title, loc, div]) => job({ id, title: txt(title), department: txt(div), locations: [txt(loc)], url: href.replace(/&amp;/g, '&') }));
  },
  async towerDescribe(jobs) {
    for (const j of jobs) {
      try {
        const h = await (await get(`https://careers.towersemi.com/job-description/?job_id=${j.id}`)).text();
        j.description = txt(h).split('Job Description').slice(1).join(' ').slice(0, 4000);
      } catch { j.description = ''; }
    }
  },

  // ICL: SuccessFactors RMK search pages, 25 rows per page.
  async icl() {
    const out = [];
    for (let row = 0; row < 200; row += 25) {
      const h = await (await get(`https://careers.icl-group.com/search/?q=&locationsearch=Haifa&startrow=${row}`)).text();
      const rows = h.split('<tr class="data-row"').slice(1);
      for (const r of rows) {
        const href = m1(r, /class="jobTitle-link"[^>]*href="([^"]+)"/) || m1(r, /href="([^"]+)"[^>]*class="jobTitle-link"/);
        const id = m1(href || '', /\/(\d+)\/?$/);
        if (!id) continue;
        out.push(job({
          id, title: txt(m1(r, /class="jobTitle-link"[^>]*>([\s\S]*?)<\/a>/)), locations: [txt(m1(r, /class="jobLocation"[^>]*>([\s\S]*?)<\/span>/))],
          url: `https://careers.icl-group.com${href}`,
        }));
      }
      if (rows.length < 25) break;
    }
    return [...new Map(out.map(j => [j.id, j])).values()];
  },
  async iclDescribe(jobs) {
    for (const j of jobs) {
      try {
        const h = await (await get(`https://careers.icl-group.com/job/x/${j.id}/`)).text();
        j.description = txt(m1(h, /<span class="jobdescription"[^>]*>([\s\S]*?)<\/span>\s*<\/div>/) || m1(h, /class="jobdescription"[^>]*>([\s\S]*)/)).slice(0, 4000);
        const posted = m1(h, /itemprop="datePosted"[^>]*content="([^"]+)"/);
        if (posted) j.postedAt = Date.parse(posted);
      } catch { j.description = ''; }
    }
  },

  // GAV Systems: WordPress REST (JetEngine). Area filter is server-side; the body and job number are
  // only on the job page, fetched for candidates in gavDescribe.
  async gav() {
    const AREAS = { 63: 'חיפה והקריות', 36: 'חיפה והסביבה', 69: 'צפון', 48: 'צפון', 127: 'גב צפון' };
    const out = [];
    for (let page = 1; page <= 5; page++) {
      const r = await get(`https://gav.co.il/wp-json/wp/v2/jobs?per_page=100&page=${page}&areas=${Object.keys(AREAS).join(',')}`);
      for (const p of await r.json()) {
        out.push(job({
          id: p.id, title: txt(p.title?.rendered), locations: (p.areas || []).map(a => AREAS[a]).filter(Boolean),
          url: p.link, postedAt: p.date ? Date.parse(p.date) : null,
        }));
      }
      if (page >= Number(r.headers.get('x-wp-totalpages') || 1)) break;
    }
    return out;
  },
  async gavDescribe(jobs) {
    for (const j of jobs) {
      try {
        const h = await (await get(j.url)).text();
        j.ref = m1(h, /מס(?:פר|')? משרה[:\s]*(\d+)/);
        const t = txt(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<header[\s\S]*?<\/header>/g, ''));
        const k = t.indexOf('תיאור');
        j.description = t.slice(Math.max(k, 0), Math.max(k, 0) + 3000);
      } catch { j.description = ''; }
      await new Promise(r => setTimeout(r, 400));
    }
  },

  // Matrix: no API; jobs are listed per category page. Categories come from the menu and the sitemap
  // (the sitemap alone misses about half the jobs). The area appears on each card as "איזור: ...".
  async matrix() {
    const BASE = 'https://www.matrix.co.il/jobs/';
    const norm = u => { try { return encodeURI(decodeURI(u)); } catch { return u; } };
    const home = await (await get(BASE)).text();
    const sitemap = await get(BASE + 'job_category-sitemap.xml').then(r => r.text()).catch(() => '');
    const cats = new Set([
      ...[...home.matchAll(/href="(https:\/\/www\.matrix\.co\.il\/jobs\/(?:משרות|%d7%9e%d7%a9%d7%a8%d7%95%d7%aa)\/[^"]+)"/gi)].map(m => m[1]),
      ...[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]),
    ].map(norm).map(u => (u.endsWith('/') ? u : u + '/')));
    const dec = s => s.replace(/&#0?38;/g, '&').replace(/&#8211;/g, '-').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const jobs = new Map();
    for (const c of cats) {
      for (let page = 1; page <= 15; page++) {
        let h;
        try { h = await (await get(page === 1 ? c : `${c}page/${page}/`)).text(); } catch { break; }
        const parts = h.split('<div class="job-item"').slice(1);
        for (const p of parts) {
          const id = m1(p, /job-id="(\d+)"/);
          if (!id || jobs.has(id)) continue;
          const lines = p.replace(/<[^>]+>/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
          const ai = lines.findIndex(t => t.startsWith('איזור'));
          const area = ai >= 0 ? (lines[ai].replace(/איזור:?/, '').trim() || lines[ai + 1] || '') : '';
          jobs.set(id, job({
            id, ref: id, title: ai > 0 ? dec(lines[ai - 1]) : '', locations: area.split(',').map(s => s.trim()).filter(Boolean),
            url: m1(p, /data-soc-url="([^"]+)"/),
          }));
        }
        if (!parts.length || !h.includes(`page/${page + 1}/`)) break;
        await new Promise(r => setTimeout(r, 400));
      }
      await new Promise(r => setTimeout(r, 400));
    }
    return [...jobs.values()];
  },
  async matrixDescribe(jobs) {
    for (const j of jobs) {
      try {
        const h = await (await get(j.url)).text();
        const t = txt(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<header[\s\S]*?<\/header>|<nav[\s\S]*?<\/nav>/g, ''));
        const k = t.indexOf(j.title.slice(0, 20));
        j.description = t.slice(Math.max(k, 0), Math.max(k, 0) + 3000);
      } catch { j.description = ''; }
      await new Promise(r => setTimeout(r, 400));
    }
  },

  // Haifa Port: WordPress "jobs" posts embedded in the careers page as `var Yna = {...};`.
  // Expired postings stay on the page, so only those with last_date (MM/DD/YYYY) >= today are kept.
  async haifaport() {
    const h = await (await get('https://www.haifaport.co.il/careers/')).text();
    const raw = m1(h, /var Yna = (\{[\s\S]*?\});\s*\n/);
    if (!raw) throw new Error('jobs data (var Yna) not found');
    const mdy = s => { const [m, d, y] = String(s || '').split('/').map(Number); return y ? new Date(y, m - 1, d, 23, 59).getTime() : null; };
    const today = Date.now();
    return (JSON.parse(raw).annonce?.annonce || [])
      .filter(p => !mdy(p.last_date) || mdy(p.last_date) >= today)
      .map(p => job({
        id: p.ID, title: txt(p.post_title), locations: ['חיפה'],
        url: `https://www.haifaport.co.il/jobs/${p.post_name}/`, postedAt: mdy(p.publish_date),
        description: txt(p.post_content) + (p.last_date ? ` (מועד אחרון: ${p.last_date})` : ''),
      }));
  },

  // Maccabi: internal JSON API, all jobs in one call. No dates. Area tags are coarse (Yokneam/Carmel
  // jobs are tagged "צפון"), so the title is scanned too. Some jobs have JobUrl "#".
  async maccabi() {
    const d = await (await get('https://www.maccabi4u.co.il/api/maccabi/SearchJobsApi/FilterJobs', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ Areas: [], Professions: [], Jobs: [], FreeText: '', ResultsPerPage: '1000', PageNumber: 0, AdvertisingDestination: '1' }),
    })).json();
    return (d.Results || []).map(p => {
      const title = txt(p.Description);
      return job({
        id: p.Id, ref: p.JobId, title, department: [p.Profession, p.SubProfession].filter(Boolean).join(' / '),
        locations: (p.Areas || []).map(a => a.Description), areaText: title,
        url: p.JobUrl && p.JobUrl !== '#' ? p.JobUrl : 'https://www.maccabi4u.co.il/careers/search-job-positions/',
        description: txt(p.Notes),
      });
    });
  },

  // Meuhedet: the site is bot-protected, but its job list comes from Algolia (public search key).
  // GeoArea is inconsistent, so City/Branch decide the area. Descriptions come from a per-job API.
  async meuhedet() {
    const d = await (await get('https://hcpgnf9t5w-dsn.algolia.net/1/indexes/*/queries?x-algolia-api-key=0cd884fd17bbf3fb3cf348fcd50dbe8b&x-algolia-application-id=HCPGNF9T5W', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', referer: 'https://www.meuhedet.co.il/' },
      body: JSON.stringify({ requests: [{ indexName: 'prod_jobs', params: 'query=&hitsPerPage=1000&page=0&filters=ContentRating%3APublic' }] }),
    })).json();
    return (d.results?.[0]?.hits || []).map(p => job({
      // Branch names mix areas (e.g. "מרחב גליל מערבי חיפה" covers Shefa-Amr), so only City is a location.
      id: p.Id, ref: p.JobNumber || p.Id, title: txt(p.Description), department: [p.ProfessionDesc, p.Branch].filter(Boolean).join(' / '),
      locations: [p.City].filter(Boolean),
      url: `https://www.meuhedet.co.il/jobs/${p.Id}`,
      postedAt: p.CreatedDate ? Date.parse(p.CreatedDate) : null,
    }));
  },
  async meuhedetDescribe(jobs) {
    for (const j of jobs) {
      try {
        const d = await (await get(`https://www.meuhedet.co.il/api/job/${j.id}`, { method: 'POST', body: '', headers: { referer: 'https://www.meuhedet.co.il/' } })).json();
        j.description = txt(d.Job?.Notes);
      } catch { j.description = ''; }
      await new Promise(r => setTimeout(r, 300));
    }
  },

  // University of Haifa (administrative staff): WP REST. Posts are regenerated daily, so the job number
  // at the start of the title is the stable id.
  async haifauni() {
    const posts = await (await get('https://hr.haifa.ac.il/wp-json/wp/v2/posts?categories=8&per_page=100&_fields=id,date,link,title,content')).json();
    return posts.map(p => {
      const title = txt(p.title?.rendered);
      return job({
        id: m1(title, /^(\d+)/) || p.id, title: title.replace(/^\d+\s*/, ''), locations: ['חיפה'],
        url: p.link, description: txt(p.content?.rendered),
      });
    });
  },
};

export async function collect(c) {
  const fn = SITES[c.site];
  if (!fn) throw new Error(`unknown site "${c.site}"`);
  return fn(c);
}

export async function describe(c, ctx, jobs) {
  const fn = SITES[`${c.site}Describe`];
  if (fn) await fn(jobs);
}
