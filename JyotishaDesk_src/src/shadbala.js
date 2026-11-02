// Shadbala (six-fold strength) of the seven planets, classical Parashari scheme (BPHS ch. 27 as commonly taught).
// Units: virupas (shashtiamsas); 60 virupas = 1 rupa. Yuddha bala (planetary war) is not included.
// This is an independent implementation from the published rules; individual components can differ from other
// programs because several of them (Abda/Masa lords, special-aspect values, Cheshta) have more than one accepted form.
import * as swe from './swe.js';
import * as T from './tables.js';
import { norm, wrap180, signOf, degIn, vargaSign, compoundRelation, sunriseBefore, panchanga, DEFAULT_SETTINGS } from './astro.js';
const { SUN, MOON, MARS, MERCURY, JUPITER, VENUS, SATURN } = T;

export const REQUIRED = { [SUN]: 390, [MOON]: 360, [MARS]: 300, [MERCURY]: 420, [JUPITER]: 390, [VENUS]: 330, [SATURN]: 300 };
const NAISARGIKA = { [SUN]: 60, [MOON]: 51.43, [VENUS]: 42.86, [JUPITER]: 34.29, [MERCURY]: 25.71, [MARS]: 17.14, [SATURN]: 8.57 };
const SWE_ID = [swe.P.SUN, swe.P.MOON, swe.P.MARS, swe.P.MERCURY, swe.P.JUPITER, swe.P.VENUS, swe.P.SATURN];

// ---- Sthana bala -------------------------------------------------------------------------------------------
function uchcha(p) {
  const [s, d] = T.EXALT[p.id];
  const debil = norm(s * 30 + d + 180);
  return Math.abs(wrap180(p.lon - debil)) / 3;
}
const SAPTA_POINTS = { 2: 22.5, 1: 15, 0: 7.5, '-1': 3.75, '-2': 1.875 };
function saptavargaja(chart, p) {
  let total = 0; const parts = {};
  for (const n of [1, 2, 3, 7, 9, 12, 30]) {
    const vs = n === 1 ? p.sign : vargaSign(p.lon, n);
    const lord = T.SIGN_LORD[vs];
    let v;
    if (n === 1 && p.dignity === 'Moolatrikona') v = 45;
    else if (lord === p.id) v = 30;
    else v = SAPTA_POINTS[compoundRelation(p.id, p.sign, lord, chart.planets[lord].sign)];
    parts[n] = v; total += v;
  }
  return { total, parts };
}
function ojayugma(p) {
  const female = p.id === MOON || p.id === VENUS;
  const good = (sign) => (female ? sign % 2 === 1 : sign % 2 === 0);
  return (good(p.sign) ? 15 : 0) + (good(vargaSign(p.lon, 9)) ? 15 : 0);
}
function kendradi(chart, p) {
  const h = ((p.sign - chart.lagnaSign + 12) % 12) + 1;
  return [1, 4, 7, 10].includes(h) ? 60 : [2, 5, 8, 11].includes(h) ? 30 : 15;
}
function drekkana(p) {
  const part = Math.floor(p.deg / 10);                         // 0,1,2
  const want = [SUN, MARS, JUPITER].includes(p.id) ? 0 : [MOON, VENUS].includes(p.id) ? 2 : 1;
  return part === want ? 15 : 0;
}

// ---- Dig bala ----------------------------------------------------------------------------------------------
function digBala(chart, p) {
  const asc = chart.lagna.lon, mc = chart.mc;
  const weak = { [JUPITER]: asc + 180, [MERCURY]: asc + 180, [SUN]: mc + 180, [MARS]: mc + 180, [SATURN]: asc, [MOON]: mc, [VENUS]: mc }[p.id];
  return Math.abs(wrap180(p.lon - weak)) / 3;
}

// ---- Kala bala ---------------------------------------------------------------------------------------------
const wd = (jdLocal) => (Math.floor(jdLocal + 0.5) + 1) % 7;
const elong = (jd, st) => norm(swe.calc(jd, swe.P.MOON, true, st.ayanamsa).lon - swe.calc(jd, swe.P.SUN, true, st.ayanamsa).lon);

function prevNewMoon(jd, st) {
  const e = elong(jd, st);
  let lo = jd - e / 12.19 - 2, hi = jd - e / 12.19 + 2;
  for (let i = 0; i < 45; i++) {
    const mid = (lo + hi) / 2;
    if (wrap180(elong(mid, st)) < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
// weekday lord of the first sunrise after jd
function lordAfter(jd, b) {
  const r = swe.riseTrans(jd, swe.P.SUN, 'rise', b.lonEast, b.lat, 0, {});
  return r === null ? null : { lord: T.WEEKDAY_LORD[wd(r + b.tzEast / 24)], jd: r };
}
// Abda lord: weekday of Chaitra Shukla Pratipada (first sunrise after the new moon that has the Sun in sidereal Meena),
// Masa lord: weekday of the first sunrise after the latest new moon. (No adhika-masa handling.)
function yearMonthLords(chart, st) {
  const b = chart.input;
  let nm = prevNewMoon(chart.jd, st);
  const month = lordAfter(nm, b);
  let year = null;
  for (let i = 0; i < 14; i++) {
    const sunSign = signOf(swe.calc(nm, swe.P.SUN, true, st.ayanamsa).lon);
    if (sunSign === 11) { year = lordAfter(nm, b); break; }
    nm = prevNewMoon(nm - 1, st);
  }
  return { masa: month && month.lord, abda: year && year.lord };
}

function ayanaBala(jd, id) {
  const d = swe.declination(jd, SWE_ID[id]);
  const eps = 23.45;
  let v;
  if (id === MOON || id === SATURN) v = ((eps - d) / (2 * eps)) * 60;
  else if (id === MERCURY) v = ((eps + Math.abs(d)) / (2 * eps)) * 60;
  else v = ((eps + d) / (2 * eps)) * 60;
  v = Math.max(0, Math.min(60, v));
  return { v: id === SUN ? v * 2 : v, base: v, decl: d };
}

function kalaBala(chart, st, out) {
  const b = chart.input, jd = chart.jd;
  const sr = sunriseBefore(jd, b.lonEast, b.lat, st);
  const pg = panchanga(jd, b.lonEast, b.lat, b.tzEast, st);
  const lords = yearMonthLords(chart, st);
  const e = wrap180(elong(jd, st));
  const dMoonSun = Math.abs(e);                                 // 0..180
  const pakshaBase = dMoonSun / 3;
  const benefic = { [JUPITER]: true, [VENUS]: true, [MERCURY]: true, [MOON]: pakshaBase >= 30, [SUN]: false, [MARS]: false, [SATURN]: false };

  // night/day, thirds of the day/night
  let isDay = true, dayFrac = 0.5, noonDelta = 0;
  if (sr && sr.set && sr.nextRise) {
    isDay = jd < sr.set;
    const noon = (sr.rise + sr.set) / 2;
    noonDelta = ((((jd - noon + 0.5) % 1) + 1) % 1 - 0.5) * 24;           // hours from local noon (-12..12)
    dayFrac = isDay ? (jd - sr.rise) / (sr.set - sr.rise) : (jd - sr.set) / (sr.nextRise - sr.set);
  }
  const third = Math.min(2, Math.floor(dayFrac * 3));
  const triLord = isDay ? [MERCURY, SUN, SATURN][third] : [MOON, VENUS, MARS][third];
  const nataFromMidnight = 12 - Math.abs(noonDelta);                       // hours from the nearest midnight
  const horaLord = pg.horaLord, varaLord = T.WEEKDAY_LORD[pg.vara];

  for (let id = SUN; id <= SATURN; id++) {
    const c = {};
    if (id === MERCURY) c.natonnata = 60;
    else if ([SUN, JUPITER, VENUS].includes(id)) c.natonnata = 5 * nataFromMidnight;
    else c.natonnata = 60 - 5 * nataFromMidnight;
    c.paksha = benefic[id] ? pakshaBase : 60 - pakshaBase;
    if (id === MOON) c.paksha *= 2;
    c.tribhaga = id === JUPITER || id === triLord ? 60 : 0;
    c.abda = lords.abda === id ? 15 : 0;
    c.masa = lords.masa === id ? 30 : 0;
    c.vara = varaLord === id ? 45 : 0;
    c.hora = horaLord === id ? 60 : 0;
    const ay = ayanaBala(jd, id);
    c.ayana = ay.v;
    c.total = c.natonnata + c.paksha + c.tribhaga + c.abda + c.masa + c.vara + c.hora + c.ayana;
    out[id].kala = c;
    out[id].decl = ay.decl;
    out[id]._ayanaBase = ay.base;
    out[id]._paksha = pakshaBase;
  }
  return { abdaLord: lords.abda, masaLord: lords.masa, varaLord, horaLord, triLord, isDay };
}

// ---- Cheshta bala ------------------------------------------------------------------------------------------
// Standish (JPL) mean heliocentric longitudes, J2000 mean ecliptic & equinox, degrees; T in Julian centuries.
const MEAN_L = {
  [MERCURY]: [252.2503235, 149472.67411175], [VENUS]: [181.9790995, 58517.81538729],
  EMB: [100.46457166, 35999.37244981], [MARS]: [-4.55343205, 19140.30268499],
  [JUPITER]: [34.39644051, 3034.74612775], [SATURN]: [49.95424423, 1222.49362201],
};
const meanL = (key, T_) => norm(MEAN_L[key][0] + MEAN_L[key][1] * T_);
function cheshtaKendra(jd, id) {
  const T_ = (jd - 2451545) / 36525;
  const meanSun = norm(meanL('EMB', T_) + 180);
  const trueGeo = swe.lonJ2000(jd, SWE_ID[id]);
  let se, ms;
  if (id === MARS || id === JUPITER || id === SATURN) {
    const mp = meanL(id, T_);
    se = meanSun; ms = mp + wrap180(trueGeo - mp) / 2;
  } else {
    se = meanL(id, T_); ms = meanSun + wrap180(trueGeo - meanSun) / 2;
  }
  return Math.abs(wrap180(se - ms));
}

// ---- Drik bala ---------------------------------------------------------------------------------------------
function aspectValue(fromId, d) {              // d = longitude of receiver minus longitude of aspecting planet, 0..360
  let v;
  if (d < 30) v = 0;
  else if (d < 60) v = (d - 30) / 2;
  else if (d < 90) v = d - 60 + 15;
  else if (d < 120) v = 45 - (d - 90) / 2;
  else if (d < 150) v = 30 - (d - 120);
  else if (d < 180) v = (d - 150) * 2;
  else if (d < 300) v = (300 - d) / 2;
  else v = 0;
  if (fromId === MARS && ((d >= 90 && d < 120) || (d >= 210 && d < 240))) v = 60;
  if (fromId === JUPITER && ((d >= 120 && d < 150) || (d >= 240 && d < 270))) v = 60;
  if (fromId === SATURN && ((d >= 60 && d < 90) || (d >= 270 && d < 300))) v = 60;
  return v;
}
function drikBala(chart, id, benefic) {
  let sum = 0;
  for (let a = SUN; a <= SATURN; a++) {
    if (a === id) continue;
    const v = aspectValue(a, norm(chart.planets[id].lon - chart.planets[a].lon));
    sum += benefic[a] ? v : -v;
  }
  return sum / 4;
}

// ---- main --------------------------------------------------------------------------------------------------
export function shadbala(chart, st = DEFAULT_SETTINGS) {
  const out = {};
  for (let id = SUN; id <= SATURN; id++) out[id] = { id };
  const info = kalaBala(chart, st, out);
  const benefic = { [JUPITER]: true, [VENUS]: true, [MERCURY]: true, [MOON]: out[MOON]._paksha >= 30, [SUN]: false, [MARS]: false, [SATURN]: false };
  for (let id = SUN; id <= SATURN; id++) {
    const p = chart.planets[id], o = out[id];
    const sv = saptavargaja(chart, p);
    o.sthana = { uchcha: uchcha(p), sapta: sv.total, saptaParts: sv.parts, ojayugma: ojayugma(p), kendra: kendradi(chart, p), drekkana: drekkana(p) };
    o.sthana.total = o.sthana.uchcha + o.sthana.sapta + o.sthana.ojayugma + o.sthana.kendra + o.sthana.drekkana;
    o.dig = digBala(chart, p);
    if (id === SUN) o.cheshta = o._ayanaBase;
    else if (id === MOON) o.cheshta = o._paksha;
    else { o.cheshtaKendra = cheshtaKendra(chart.jd, id); o.cheshta = o.cheshtaKendra / 3; }
    o.naisargika = NAISARGIKA[id];
    o.drik = drikBala(chart, id, benefic);
    o.total = o.sthana.total + o.dig + o.kala.total + o.cheshta + o.naisargika + o.drik;
    o.rupas = o.total / 60;
    o.required = REQUIRED[id];
    o.ratio = o.total / o.required;
    o.ishta = Math.sqrt(Math.max(0, o.sthana.uchcha * o.cheshta));
    o.kashta = Math.sqrt(Math.max(0, (60 - o.sthana.uchcha) * (60 - o.cheshta)));
    delete o._ayanaBase; delete o._paksha;
  }
  const order = Object.values(out).sort((a, b) => b.ratio - a.ratio);
  order.forEach((o, i) => { o.rank = i + 1; });
  return { planets: out, info };
}
