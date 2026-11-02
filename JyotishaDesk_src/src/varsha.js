// Varshaphala (Tajika annual chart): solar return chart, Muntha, Tajika aspects with Ithasala / Ishrafa, candidates for the lord of the year,
// Mudda dasha (Vimshottari compressed into one year) and a year-by-year table.
// NOT implemented: Sahams, Pancha-vargiya strength (so the lord of the year is not chosen automatically), the remaining Tajika yogas.
import * as T from './tables.js';
import * as A from './astro.js';
const { SUN, MOON, MARS, MERCURY, JUPITER, VENUS, SATURN } = T;

// deeptamsa (orbs) of the seven planets, Tajika
export const ORB = { [SUN]: 15, [MOON]: 12, [MARS]: 8, [MERCURY]: 7, [JUPITER]: 9, [VENUS]: 7, [SATURN]: 9 };
// from the fastest to the slowest
export const SPEED_ORDER = [MOON, MERCURY, VENUS, SUN, MARS, JUPITER, SATURN];

export const ASPECT_RU = { conj: 'соединение', sextile: 'секстиль (3/11)', trine: 'тригон (5/9)', square: 'квадрат (4/10)', opp: 'оппозиция (7)' };
export const FRIENDLY = { sextile: true, trine: true, conj: true, square: false, opp: false };

// Tajika aspect between two signs: by sign distance (counting from a to b)
export function tajikaAspect(signA, signB) {
  const d = (signB - signA + 12) % 12;
  return { 0: 'conj', 2: 'sextile', 10: 'sextile', 3: 'square', 9: 'square', 4: 'trine', 8: 'trine', 6: 'opp' }[d] || null;
}

// Ithasala (applying) / Ishrafa (separating) between all pairs of the seven planets of a chart.
// The test is the usual textbook one: the planets stand in a Tajika aspect by sign, and the difference of their degrees inside the signs
// (slower minus faster) lies within half of the sum of the orbs; faster planet behind the slower one => Ithasala, ahead of it => Ishrafa.
export function tajikaPairs(chart) {
  const out = [];
  for (let i = 0; i < SPEED_ORDER.length; i++) for (let j = i + 1; j < SPEED_ORDER.length; j++) {
    const f = SPEED_ORDER[i], s = SPEED_ORDER[j], pf = chart.planets[f], ps = chart.planets[s];
    const asp = tajikaAspect(pf.sign, ps.sign);
    if (!asp) continue;
    const diff = ps.deg - pf.deg, lim = (ORB[f] + ORB[s]) / 2;
    let kind = null;
    if (Math.abs(diff) <= lim) kind = diff >= 0 ? 'ithasala' : 'ishrafa';
    out.push({ fast: f, slow: s, aspect: asp, friendly: FRIENDLY[asp], diff, limit: lim, kind, exact: Math.abs(diff) < 1 });
  }
  return out;
}

// tri-rashi pati (BPHS Tajika): lord by element of the Varsha lagna, by day or by night
const TRIRASHI = { 0: [SUN, JUPITER], 1: [VENUS, MOON], 2: [SATURN, MERCURY], 3: [VENUS, MARS] };     // element = sign % 4 : fire, earth, air, water ; [day, night]
export function triRashiPati(lagnaSign, day) { return TRIRASHI[lagnaSign % 4][day ? 0 : 1]; }

export function varshaChart(natal, year, loc, st = A.DEFAULT_SETTINGS) {
  const jd = A.solarReturn(natal, year, st);
  const rc = A.returnChart(natal, jd, loc.lon, loc.lat, loc.tz, st);
  const age = year - natal.input.year, munthaSign = (natal.lagnaSign + age) % 12;
  const day = ((rc.planets[SUN].lon - rc.lagna.lon + 720) % 360) >= 180;               // Sun above the horizon (houses 7..12)
  const munthaLord = T.SIGN_LORD[munthaSign];
  const cand = [
    { role: 'Лорд мунтхи', planet: munthaLord },
    { role: 'Лорд натальной лагны', planet: T.SIGN_LORD[natal.lagnaSign] },
    { role: 'Лорд лагны года', planet: T.SIGN_LORD[rc.lagnaSign] },
    { role: `Три-раши-пати (${day ? 'день' : 'ночь'})`, planet: triRashiPati(rc.lagnaSign, day) },
  ].map((c) => {
    const asp = tajikaAspect(rc.planets[c.planet].sign, rc.lagnaSign);
    return { ...c, aspectsLagna: asp, house: rc.planets[c.planet].house };
  });
  return {
    year, age, jd, chart: rc, day,
    muntha: { sign: munthaSign, house: ((munthaSign - rc.lagnaSign + 12) % 12) + 1, lord: munthaLord, lordHouse: rc.planets[munthaLord].house },
    candidates: cand, pairs: tajikaPairs(rc),
  };
}

// Mudda dasha: Vimshottari of the Varsha chart where 120 years are compressed into the length of this solar year (return to return)
export function muddaDasha(natal, year, loc, st = A.DEFAULT_SETTINGS) {
  const v = varshaChart(natal, year, loc, st), next = A.solarReturn(natal, year + 1, st);
  const len = next - v.jd, yl = len / 120;
  const sys = A.vimshottari(v.chart, { ...st, yearLen: yl });
  sys.system = 'Mudda'; sys.yearDays = len; sys.dayPerYear = yl;
  sys.maha = sys.maha.filter((m) => m.end > v.jd && m.start < next + 1e-9);
  return { sys, start: v.jd, end: next, chart: v.chart };
}

// compact year table
export function varshaTable(natal, fromYear, toYear, loc, st = A.DEFAULT_SETTINGS) {
  const rows = [];
  for (let y = fromYear; y <= toYear; y++) {
    const jd = A.solarReturn(natal, y, st), rc = A.returnChart(natal, jd, loc.lon, loc.lat, loc.tz, st);
    const age = y - natal.input.year, ms = (natal.lagnaSign + age) % 12;
    rows.push({ year: y, age, jd, lagnaSign: rc.lagnaSign, muntha: ms, munthaHouse: ((ms - rc.lagnaSign + 12) % 12) + 1, munthaLord: T.SIGN_LORD[ms], moonSign: rc.planets[MOON].sign });
  }
  return rows;
}
