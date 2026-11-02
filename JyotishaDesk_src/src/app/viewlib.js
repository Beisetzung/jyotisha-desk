// Helpers shared by the tab renderers.
import * as swe from '../swe.js';
import * as T from '../tables.js';
import * as A from '../astro.js';
import { esc, pad } from './util.js';
import { drawChart } from './svgcharts.js';

export const DIGNITY_RU = { Exalted: 'экзальтация', Debilitated: 'падение', Moolatrikona: 'мулатрикона', Own: 'свой знак', Adhimitra: 'большой друг', Mitra: 'друг', Sama: 'нейтрал', Shatru: 'враг', Adhishatru: 'большой враг' };
export const DIGNITY_CLS = { Exalted: 'ex', Debilitated: 'db', Moolatrikona: 'own', Own: 'own' };
export const WD_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export const pn = (id) => `${T.PLANET_RU[id]} <span class="ab">${T.PLANET_ABBR[id]}</span>`;
export const sn = (s) => `${T.SIGN_RU[s]} <span class="ab">${T.SIGN_ABBR[s]}</span>`;
export const dms = (lon) => A.lonToString(lon);
export const cache = (ctx, key, fn) => (key in ctx.cache ? ctx.cache[key] : (ctx.cache[key] = fn()));
export const jdNow = () => { const d = new Date(); return swe.julday(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600); };
export const nowLocal = (tz) => swe.revjul(jdNow() + tz / 24);
export const isoDate = (y, m, d) => `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;
export const parseIsoDate = (s) => { const m = /^(-?\d{1,6})-(\d{1,2})-(\d{1,2})$/.exec(String(s).trim()); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; };
export const tab = (ctx, name, init) => (ctx.v[name] ||= init());
export const addDays = (iso, k) => { const d = parseIsoDate(iso); const t = new Date(Date.UTC(d.y, d.m - 1, d.d + k)); return isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
export const addMonths = (iso, k) => { const d = parseIsoDate(iso); const t = new Date(Date.UTC(d.y, d.m - 1 + k, d.d)); return isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };

// Chara karakas: Jaimini roles with short labels, names and meanings
export const KARAKA_ABBR = { Atmakaraka: 'AK', Amatyakaraka: 'AmK', Bhratrikaraka: 'BK', Matrikaraka: 'MK', Pitrikaraka: 'PiK', Putrakaraka: 'PK', Gnatikaraka: 'GK', Darakaraka: 'DK' };
export const KARAKA_RU = { Atmakaraka: 'Атмакарака', Amatyakaraka: 'Аматьякарака', Bhratrikaraka: 'Бхратрикарака', Matrikaraka: 'Матрикарака', Pitrikaraka: 'Питрикарака', Putrakaraka: 'Путракарака', Gnatikaraka: 'Гнатикарака', Darakaraka: 'Даракарака' };
export const KARAKA_MEANING = {
  Atmakaraka: 'душа, суть личности, главный урок жизни', Amatyakaraka: 'карьера, призвание, советники', Bhratrikaraka: 'братья и сёстры, смелость, усилия',
  Matrikaraka: 'мать, образование, душевный покой', Pitrikaraka: 'отец, наставники', Putrakaraka: 'дети, творчество, ученики', Gnatikaraka: 'родственники, соперники, болезни, долги', Darakaraka: 'супруг(а), партнёры',
};
export function karakaMap(chart) {                    // planet id -> { abbr, role }
  const m = {};
  for (const k of chart.karakas || []) m[k.planet] = { abbr: KARAKA_ABBR[k.role] || '', role: k.role };
  return m;
}
export const chartOpts = (ctx) => ({ degrees: ctx.ui.degrees !== false, karakas: ctx.ui.marks !== false, outer: ctx.ui.outer !== false });
const showR = (p) => p.retro && p.id !== T.RAHU && p.id !== T.KETU;

export function cellsD1(chart, { degrees = true, karakas = false, outer = false } = {}) {
  const cells = Array.from({ length: 12 }, () => []);
  const km = karakas ? karakaMap(chart) : {};
  cells[chart.lagnaSign].push({ t: 'Asc ' + Math.floor(chart.lagna.deg) + '°', c: 'asc' });
  chart.planets.forEach((p) => {
    cells[p.sign].push({ t: T.PLANET_ABBR[p.id] + (degrees ? ' ' + Math.floor(p.deg) + '°' : '') + (showR(p) ? 'ᴿ' : ''), c: DIGNITY_CLS[p.dignity] || '', k: km[p.id] ? km[p.id].abbr : '' });
  });
  if (outer && chart.outer) chart.outer.forEach((p) => cells[p.sign].push({ t: T.PLANET_ABBR[p.id] + (degrees ? ' ' + Math.floor(p.deg) + '°' : '') + (showR(p) ? 'ᴿ' : ''), c: 'out' }));
  return cells;
}
export function chartBox(ctx, svgOpts, caption) {
  const st = ctx.ui.style;
  const styles = st === 'both' ? ['south', 'north'] : [st];
  return styles.map((s) => `<figure class="fig">${drawChart(s, svgOpts)}${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>`).join('');
}
export const seg = (act, key, items, cur, attr = 's') => `<div class="seg" role="group">${items.map(([k, l]) => `<button data-act="${act}" data-${attr}="${k}" class="${cur === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
