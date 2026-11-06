// User settings (written by /start) and the company list for the sectors the user chose.
import path from 'node:path';
import { ROOT, readJson } from './util.mjs';

export const SECTORS = {
  banks: 'בנקים',
  insurance: 'ביטוח ובתי השקעות',
  fintech: 'כרטיסי אשראי ופינטק',
  hitech: 'הייטק',
  defense: 'ביטחון',
  industry: 'תעשייה וייצור',
  pharma: 'פארמה ומכשור רפואי',
  health: 'בריאות',
  retail: 'קמעונאות ומזון',
  telecom: 'תקשורת',
  energy: 'אנרגיה ותשתיות',
  transport: 'תחבורה ולוגיסטיקה',
  realestate: 'נדל"ן ובנייה',
  public: 'מגזר ציבורי',
  education: 'חינוך ועמותות',
};

export const SETTINGS_FILE = path.join(ROOT, 'settings.json');

const DEFAULTS = {
  sectors: Object.keys(SECTORS),
  area: { anywhere: true, places: [], remote: true },
  excludeTitles: [],
  desiredSalary: '',
  minScore: 5,
  alljobs: false,
};

export function loadSettings(file = SETTINGS_FILE) {
  const s = readJson(file, null);
  if (!s) throw new Error('settings.json is missing: run /start in Claude Code first');
  return { ...DEFAULTS, ...s, area: { ...DEFAULTS.area, ...(s.area || {}) } };
}

// Companies of the chosen sectors, plus every company the user added. AllJobs only when switched on.
export function loadCompanies(settings, root = ROOT) {
  const base = readJson(path.join(root, 'companies.json'), []).filter(c => settings.sectors.includes(c.sector));
  const mine = readJson(path.join(root, 'my-companies.json'), []);
  const ids = new Set(mine.map(c => c.id));
  return [...base.filter(c => !ids.has(c.id)), ...mine]
    .filter(c => c.enabled !== false && (c.platform !== 'alljobs' || settings.alljobs));
}
