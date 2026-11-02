// Calculation core: charts, divisional charts, dignities, dashas, ashtakavarga, arudhas, special lagnas,
// panchanga, transits and solar returns. Classical Parashari definitions; written from the published methods.
import * as swe from './swe.js';
import * as T from './tables.js';
const { SUN, MOON, MARS, MERCURY, JUPITER, VENUS, SATURN, RAHU, KETU } = T;

export const DEFAULT_SETTINGS = {
  ayanamsa: 1,          // Lahiri
  trueNode: false,      // mean node by default (this is what the samples were stored with)
  houseSystem: 'O',     // Porphyry cusps = Sripati bhava madhyas
  yearLen: 365.25,      // days per dasha year
  sunriseCenter: false, // false: upper limb + refraction; true: disc centre, no refraction (traditional panchang)
  karakas: 7,
  charaDir: 'ninth',    // Chara dasha sequence direction: parity of the 9th sign from the lagna ('ninth') or of the lagna itself ('lagna')
  charaExaltAdj: false, // Chara dasha: +1 year for an exalted and -1 year for a debilitated lord
};

export const norm = (x) => ((x % 360) + 360) % 360;
export const wrap180 = (x) => { x = norm(x); return x > 180 ? x - 360 : x; };
export const signOf = (lon) => Math.floor(norm(lon) / 30);
export const degIn = (lon) => norm(lon) % 30;

export function birthJD(b) { return swe.julday(b.year, b.month, b.day, b.time - b.tzEast - (b.dst || 0)); }   // dst = hours of daylight saving included in the clock time
export function jdToLocal(jd, tzEast) {          // -> {y,m,d,h}
  return swe.revjul(jd + tzEast / 24);
}

// ---------------------------------------------------------------- planets & chart
export function planetState(jd, id, st) {
  if (id === RAHU || id === KETU) {
    const r = swe.calcNode(jd, st.trueNode, true, st.ayanamsa, id === KETU);
    return { lon: r.lon, speed: r.slon, lat: r.lat };
  }
  const ipl = [swe.P.SUN, swe.P.MOON, swe.P.MARS, swe.P.MERCURY, swe.P.JUPITER, swe.P.VENUS, swe.P.SATURN, null, null, swe.P.URANUS, swe.P.NEPTUNE, swe.P.PLUTO][id];
  const r = swe.calc(jd, ipl, true, st.ayanamsa);
  return { lon: r.lon, speed: r.slon, lat: r.lat };
}

export function planetsAt(jd, st = DEFAULT_SETTINGS) {
  return T.PLANETS.map((n, id) => {
    const s = planetState(jd, id, st);
    return makePlanet(id, s, st);
  });
}

// Uranus, Neptune and Pluto (ids 9..11), same fields as the grahas but no dignity/combustion
export function outerAt(jd, st = DEFAULT_SETTINGS) {
  return T.OUTER.map((id) => makePlanet(id, planetState(jd, id, st), st));
}

function makePlanet(id, s, st) {
  const lon = norm(s.lon), sign = signOf(lon), nakLen = 360 / 27;
  const nak = Math.floor(lon / nakLen);
  return {
    id, name: T.PLANETS[id] || T.OUTER_NAMES[id - 9], lon, speed: s.speed, lat: s.lat,
    retro: id === RAHU || id === KETU ? (st.trueNode ? s.speed < 0 : true) : s.speed < 0,
    sign, deg: degIn(lon), nak, pada: Math.floor((lon % nakLen) / (nakLen / 4)) + 1,
    nakFrac: (lon % nakLen) / nakLen,
    nakLord: T.VIM_ORDER[nak % 9],
  };
}

export function computeChart(b, st = DEFAULT_SETTINGS) {
  const jd = birthJD(b);
  const planets = planetsAt(jd, st);
  const h = swe.houses(jd, b.lat, b.lonEast, st.houseSystem, true, st.ayanamsa);
  const asc = norm(h.asc);
  const lagna = makePlanet(-1, { lon: asc, speed: 0, lat: 0 }, st);
  lagna.name = 'Lagna';
  // whole-sign house numbers
  const ls = signOf(asc);
  planets.forEach((p) => { p.house = ((p.sign - ls + 12) % 12) + 1; });
  // bhava (Sripati): cusps[i] = bhava madhya; start = midpoint with previous madhya
  const madhya = h.cusps.slice(1, 13).map(norm);
  const bhavaStart = madhya.map((m, i) => { const prev = madhya[(i + 11) % 12]; return norm(prev + wrap180(m - prev) / 2); });
  planets.forEach((p) => {
    for (let i = 0; i < 12; i++) {
      const a = bhavaStart[i], z = bhavaStart[(i + 1) % 12];
      if (norm(p.lon - a) < norm(z - a)) { p.bhava = i + 1; break; }
    }
  });
  const ay = swe.ayanamsa(jd, st.ayanamsa);
  const outer = outerAt(jd, st);
  outer.forEach((p) => {
    p.house = ((p.sign - ls + 12) % 12) + 1;
    for (let i = 0; i < 12; i++) {
      const a = bhavaStart[i], z = bhavaStart[(i + 1) % 12];
      if (norm(p.lon - a) < norm(z - a)) { p.bhava = i + 1; break; }
    }
  });
  const chart = { jd, input: b, settings: st, planets, outer, lagna, lagnaSign: ls, mc: norm(h.mc), madhya, bhavaStart, ayanamsa: ay };
  planets.forEach((p) => { p.dignity = dignity(chart, p.id, p.sign, p.deg); p.combust = isCombust(chart, p); });
  chart.karakas = charaKarakas(chart, st.karakas);
  return chart;
}

const COMBUST_ORB = { [MOON]: 12, [MARS]: 17, [MERCURY]: 14, [JUPITER]: 11, [VENUS]: 10, [SATURN]: 15 };
function isCombust(chart, p) {
  if (!(p.id in COMBUST_ORB)) return false;
  const sun = chart.planets[SUN];
  let orb = COMBUST_ORB[p.id];
  if (p.retro && p.id === MERCURY) orb = 12;
  if (p.retro && p.id === VENUS) orb = 8;
  return Math.abs(wrap180(p.lon - sun.lon)) < orb;
}

// ---------------------------------------------------------------- relationships & dignity
export function naturalRelation(a, b) {            // a's attitude to b: 1 friend, 0 neutral, -1 enemy
  if (a === b || a > SATURN || b > SATURN) return 0;
  if (T.FRIENDS[a].includes(b)) return 1;
  if (T.ENEMIES[a].includes(b)) return -1;
  return 0;
}
// temporary relation: planet b in 2,3,4,10,11,12 from a  => friend
export function temporaryRelation(signA, signB) {
  const d = ((signB - signA + 12) % 12) + 1;
  return [2, 3, 4, 10, 11, 12].includes(d) ? 1 : -1;
}
export const COMPOUND_NAMES = { 2: 'Adhimitra', 1: 'Mitra', 0: 'Sama', '-1': 'Shatru', '-2': 'Adhishatru' };
// Panchadha maitri: natural + temporary
export function compoundRelation(a, signA, b, signB) {
  const n = naturalRelation(a, b), t = temporaryRelation(signA, signB);
  return n + t;           // 2 great friend, 1 friend, 0 neutral, -1 enemy, -2 great enemy
}

export function dignity(chart, id, sign, deg) {
  if (id > SATURN) return '';
  const ex = T.EXALT[id];
  if (sign === ex[0]) return 'Exalted';
  if (sign === (ex[0] + 6) % 12) return 'Debilitated';
  const mt = T.MOOLATRIKONA[id];
  if (sign === mt[0] && deg >= mt[1] && deg < mt[2]) return 'Moolatrikona';
  if (T.OWN_SIGNS[id].includes(sign)) return 'Own';
  const lord = T.SIGN_LORD[sign];
  const rel = chart ? compoundRelation(id, sign, lord, chart.planets[lord].sign) : naturalRelation(id, lord);
  return COMPOUND_NAMES[rel] ?? '';
}

// ---------------------------------------------------------------- divisional charts
export const VARGAS = [1, 2, 3, 4, 7, 9, 10, 12, 16, 20, 24, 27, 30, 40, 45, 60];
export const VARGA_NAMES = { 1: 'Rasi', 2: 'Hora', 3: 'Drekkana', 4: 'Chaturthamsa', 7: 'Saptamsa', 9: 'Navamsa', 10: 'Dasamsa', 12: 'Dwadasamsa', 16: 'Shodasamsa', 20: 'Vimsamsa', 24: 'Chaturvimsamsa', 27: 'Bhamsa', 30: 'Trimsamsa', 40: 'Khavedamsa', 45: 'Akshavedamsa', 60: 'Shashtiamsa' };

// Parashara divisional charts. Returns sign index 0..11 for a sidereal longitude.
export function vargaSign(lon, n) {
  lon = norm(lon);
  const s = signOf(lon), d = lon % 30;
  const odd = s % 2 === 0;                       // Aries(0) is an odd sign
  const kind = s % 3;                            // 0 movable, 1 fixed, 2 dual
  const idx = (parts) => Math.min(parts - 1, Math.floor(d / (30 / parts)));
  switch (n) {
    case 1: return s;
    case 2: return odd ? (d < 15 ? 4 : 3) : (d < 15 ? 3 : 4);               // Sun's hora = Leo, Moon's = Cancer
    case 3: return (s + 4 * idx(3)) % 12;
    case 4: return (s + 3 * idx(4)) % 12;
    case 7: return (s + (odd ? 0 : 6) + idx(7)) % 12;
    case 9: return (s * 9 + idx(9)) % 12;
    case 10: return (s + (odd ? 0 : 8) + idx(10)) % 12;
    case 12: return (s + idx(12)) % 12;
    case 16: return ([0, 4, 8][kind] + idx(16)) % 12;
    case 20: return ([0, 8, 4][kind] + idx(20)) % 12;
    case 24: return ((odd ? 4 : 3) + idx(24)) % 12;
    case 27: return ([0, 3, 6, 9][s % 4] + idx(27)) % 12;                    // fire Aries, earth Cancer, air Libra, water Capricorn
    case 30: {                                                               // by degrees, not equal parts
      const odds = [[5, 0], [10, 10], [18, 8], [25, 2], [30, 6]];            // Mars-Aries, Sat-Aquarius, Jup-Sagittarius, Mer-Gemini, Ven-Libra
      const evens = [[5, 1], [12, 5], [20, 11], [25, 9], [30, 7]];           // Ven-Taurus, Mer-Virgo, Jup-Pisces, Sat-Capricorn, Mar-Scorpio
      for (const [lim, sg] of odd ? odds : evens) if (d < lim) return sg;
      return odd ? 6 : 7;
    }
    case 40: return ((odd ? 0 : 6) + idx(40)) % 12;
    case 45: return ([0, 4, 8][kind] + idx(45)) % 12;
    case 60: return (s + Math.min(59, Math.floor(d * 2))) % 12;
    default: throw new Error('Unsupported varga D' + n);
  }
}
// element grouping check: s%4 -> 0 fire(Aries,Leo,Sag), 1 earth(Taurus,Virgo,Cap), 2 air, 3 water  (signs 0..11 cycle fire,earth,air,water)

// Degree (0..30) inside the sign of the divisional chart: the place within the division the planet is in, stretched to the whole sign
// (Navamsa: each 3 deg 20 min part of a sign becomes a whole sign, so 1 deg inside the part = 9 deg in D9). D30 uses its own unequal parts (5/5/8/7/5).
export function vargaDeg(lon, n) {
  lon = norm(lon);
  const s = signOf(lon), d = lon % 30;
  if (n === 1) return d;
  let lo, hi;
  if (n === 30) {
    const lim = s % 2 === 0 ? [5, 10, 18, 25, 30] : [5, 12, 20, 25, 30];
    let k = 0; while (k < 4 && d >= lim[k]) k++;
    lo = k ? lim[k - 1] : 0; hi = lim[k];
  } else {
    const parts = n === 2 ? 2 : n, size = 30 / parts, i = Math.min(parts - 1, Math.floor(d / size));
    lo = i * size; hi = lo + size;
  }
  return Math.min(29.999999, Math.max(0, ((d - lo) / (hi - lo)) * 30));
}

export function vargaChart(chart, n) {
  return {
    n, name: VARGA_NAMES[n] || ('D' + n),
    lagna: vargaSign(chart.lagna.lon, n),
    planets: chart.planets.map((p) => vargaSign(p.lon, n)),
    lagnaDeg: vargaDeg(chart.lagna.lon, n),
    degs: chart.planets.map((p) => vargaDeg(p.lon, n)),
    outer: (chart.outer || []).map((p) => vargaSign(p.lon, n)),
    outerDegs: (chart.outer || []).map((p) => vargaDeg(p.lon, n)),
  };
}

// ---------------------------------------------------------------- aspects, karakas, bhava lords
export function houseSign(chart, h) { return (chart.lagnaSign + h - 1) % 12; }
export function houseLord(chart, h) { return T.SIGN_LORD[houseSign(chart, h)]; }
const ASPECTS = { [SUN]: [7], [MOON]: [7], [MARS]: [4, 7, 8], [MERCURY]: [7], [JUPITER]: [5, 7, 9], [VENUS]: [7], [SATURN]: [3, 7, 10], [RAHU]: [5, 7, 9], [KETU]: [5, 7, 9] };
export function aspectedSigns(planet) {          // signs receiving a graha drishti
  return (ASPECTS[planet.id] || [7]).map((k) => (planet.sign + k - 1) % 12);
}

export function charaKarakas(chart, scheme = 7) {
  const names = scheme === 8 ? ['Atmakaraka', 'Amatyakaraka', 'Bhratrikaraka', 'Matrikaraka', 'Pitrikaraka', 'Putrakaraka', 'Gnatikaraka', 'Darakaraka']
    : ['Atmakaraka', 'Amatyakaraka', 'Bhratrikaraka', 'Matrikaraka', 'Putrakaraka', 'Gnatikaraka', 'Darakaraka'];
  const ids = scheme === 8 ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1, 2, 3, 4, 5, 6];
  const list = ids.map((id) => {
    const p = chart.planets[id];
    return { id, d: id === RAHU ? 30 - p.deg : p.deg };
  }).sort((a, b) => b.d - a.d);
  return list.map((x, i) => ({ role: names[i], planet: x.id, d: x.d }));
}

// ---------------------------------------------------------------- arudhas (Jaimini)
export function arudhas(chart) {
  const out = [];
  for (let h = 1; h <= 12; h++) {
    const hs = houseSign(chart, h), lord = T.SIGN_LORD[hs], ls = chart.planets[lord].sign;
    const d = (ls - hs + 12) % 12;
    let a = (ls + d) % 12;
    if (a === hs || a === (hs + 6) % 12) a = (hs + 9) % 12;
    out.push({ house: h, name: h === 1 ? 'AL' : 'A' + h, sign: a });
  }
  return out;
}

// ---------------------------------------------------------------- ashtakavarga
export function ashtakavarga(chart) {
  const sc = chart.planets.slice(0, 7).map((p) => p.sign);
  const lag = chart.lagnaSign;
  const bav = {};
  for (let rcv = SUN; rcv <= SATURN; rcv++) {
    const row = new Array(12).fill(0);
    const table = T.AV_TABLE[rcv];
    for (const key of Object.keys(table)) {
      const from = key === 'L' ? lag : sc[Number(key)];
      for (const h of table[key]) row[(from + h - 1) % 12] += 1;
    }
    bav[rcv] = row;
  }
  const sav = new Array(12).fill(0);
  for (let r = SUN; r <= SATURN; r++) bav[r].forEach((v, i) => { sav[i] += v; });
  return { bav, sav };
}

// ---------------------------------------------------------------- dashas
// A period: { lord, start, end } with start/end as Julian days (UT)
function subPeriods(parent, order, years, total) {
  const dur = parent.end - parent.start, out = [];
  const startAt = order.indexOf(parent.lord);
  let t = parent.start;
  for (let i = 0; i < order.length; i++) {
    const lord = order[(startAt + i) % order.length];
    const d = (dur * years(lord)) / total;
    out.push({ lord, start: t, end: t + d });
    t += d;
  }
  return out;
}

export function vimshottari(chart, st = DEFAULT_SETTINGS) {
  const moon = chart.planets[MOON];
  const order = T.VIM_ORDER, y = (l) => T.VIM_YEARS[l];
  const first = order[moon.nak % 9];
  const yl = st.yearLen;
  const start = chart.jd - moon.nakFrac * y(first) * yl;
  const maha = [];
  let t = start;
  for (let c = 0; c < 2; c++) for (let i = 0; i < 9; i++) {         // 240 years is more than enough
    const lord = order[(moon.nak % 9 + i) % 9];
    const end = t + y(lord) * yl;
    maha.push({ lord, start: t, end });
    t = end;
  }
  return {
    system: 'Vimshottari', total: 120, order, levels: ['Maha', 'Antar', 'Pratyantar', 'Sookshma', 'Prana'],
    maha: maha.filter((m) => m.start < chart.jd + 125 * yl),
    balanceYears: (1 - moon.nakFrac) * y(first),
    children: (p) => subPeriods(p, order, y, 120),
    label: (lord) => T.PLANETS[lord],
  };
}

export function yogini(chart, st = DEFAULT_SETTINGS) {
  const moon = chart.planets[MOON];
  let idx = (moon.nak + 1 + 3) % 8; if (idx === 0) idx = 8;           // (nakshatra number 1..27 + 3) mod 8
  const firstIdx = idx - 1, yl = st.yearLen;
  const order = T.YOGINI.map((_, i) => i);
  const years = (i) => T.YOGINI[i].years;
  let t = chart.jd - moon.nakFrac * years(firstIdx) * yl;
  const maha = [];
  for (let c = 0; c < 4; c++) for (let i = 0; i < 8; i++) {
    const lord = (firstIdx + i) % 8, end = t + years(lord) * yl;
    maha.push({ lord, start: t, end }); t = end;
  }
  return {
    system: 'Yogini', total: 36, order, levels: ['Maha', 'Antar', 'Pratyantar'],
    maha: maha.filter((m) => m.start < chart.jd + 125 * yl),
    balanceYears: (1 - moon.nakFrac) * years(firstIdx),
    children: (p) => subPeriods(p, order, years, 36),
    label: (i) => `${T.YOGINI[i].name} (${T.PLANET_ABBR[T.YOGINI[i].lord]})`,
  };
}

export function dashaAt(system, jd) {            // path of periods containing jd
  const path = [];
  let list = system.maha;
  for (let lvl = 0; lvl < system.levels.length; lvl++) {
    const p = list.find((x) => jd >= x.start && jd < x.end);
    if (!p) break;
    path.push(p);
    list = system.children(p);
  }
  return path;
}

// ---------------------------------------------------------------- sunrise, vara, panchanga
const wd = (jdLocal) => (Math.floor(jdLocal + 0.5) + 1) % 7;      // 0 = Sunday

export function sunriseBefore(jd, lonEast, lat, st = DEFAULT_SETTINGS) {
  const opts = { center: st.sunriseCenter };
  let r = swe.riseTrans(jd - 1.5, swe.P.SUN, 'rise', lonEast, lat, 0, opts);
  if (r === null) return null;
  for (let i = 0; i < 4; i++) {
    const n = swe.riseTrans(r + 0.2, swe.P.SUN, 'rise', lonEast, lat, 0, opts);
    if (n !== null && n <= jd) r = n; else break;
  }
  const next = swe.riseTrans(r + 0.2, swe.P.SUN, 'rise', lonEast, lat, 0, opts);
  const set = swe.riseTrans(r, swe.P.SUN, 'set', lonEast, lat, 0, opts);
  return { rise: r, set, nextRise: next };
}

function sunMoon(jd, st) {
  const s = swe.calc(jd, swe.P.SUN, true, st.ayanamsa).lon, m = swe.calc(jd, swe.P.MOON, true, st.ayanamsa).lon;
  return { s, m };
}
const elong = (jd, st) => { const { s, m } = sunMoon(jd, st); return norm(m - s); };

// time near `jd` where angleFn(jd) crosses `target` (increasing, so bisection on wrap180 works) inside [lo, hi]
function crossing(angleFn, target, lo, hi) {
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (wrap180(angleFn(mid) - target) < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function limb(angleFn, size, jd) {          // start/end of the division of width `size` containing jd
  const a = angleFn(jd), idx = Math.floor(a / size), b0 = idx * size, b1 = (idx + 1) * size;
  const start = crossing(angleFn, b0, jd - 1.6, jd + 1e-9);
  const end = crossing(angleFn, b1, jd, jd + 1.6);
  return { idx, start, end };
}

export function panchanga(jd, lonEast, lat, tzEast, st = DEFAULT_SETTINGS) {
  const sr = sunriseBefore(jd, lonEast, lat, st);
  const sunriseJD = sr ? sr.rise : Math.floor(jd + tzEast / 24 - 0.25 + 0.5) - tzEast / 24 + 0.25;
  const vara = wd(sunriseJD + tzEast / 24);
  const e = elong(jd, st);
  const tith = limb((t) => elong(t, st), 12, jd);
  const nakA = (t) => norm(swe.calc(t, swe.P.MOON, true, st.ayanamsa).lon);
  const nak = limb(nakA, 360 / 27, jd);
  const yogA = (t) => { const { s, m } = sunMoon(t, st); return norm(s + m); };
  const yog = limb(yogA, 360 / 27, jd);
  const kar = limb((t) => elong(t, st), 6, jd);
  const ki = kar.idx;                                   // 0..59
  const karanaName = ki === 0 ? 'Kimstughna' : ki >= 57 ? ['Shakuni', 'Chatushpada', 'Naga'][ki - 57] : T.KARANA_MOVING[(ki - 1) % 7];
  const ti = tith.idx;                                  // 0..29
  const tithiName = ti === 14 ? 'Purnima' : ti === 29 ? 'Amavasya' : T.TITHI_NAMES[ti % 15];
  // 8-part day segments
  const segs = {};
  if (sr && sr.set) {
    const len = (sr.set - sr.rise) / 8;
    const seg = (n) => ({ start: sr.rise + len * (n - 1), end: sr.rise + len * n });
    segs.rahu = seg([8, 2, 7, 5, 6, 4, 3][vara]);
    segs.yamaganda = seg([5, 4, 3, 2, 1, 7, 6][vara]);
    segs.gulika = seg([7, 6, 5, 4, 3, 2, 1][vara]);
  }
  // hora lord at jd: 24 horas from sunrise, first hora ruled by the weekday lord, then Sat-Jup-Mar-Sun-Ven-Mer-Moo order
  const horaOrder = [SATURN, JUPITER, MARS, SUN, VENUS, MERCURY, MOON];
  let hora = null;
  if (sr && sr.set && sr.nextRise) {
    const isDay = jd < sr.set;
    const hrs = isDay ? 12 : 12;
    const base = isDay ? sr.rise : sr.set, span = isDay ? sr.set - sr.rise : sr.nextRise - sr.set;
    const k = Math.min(11, Math.floor(((jd - base) / span) * hrs)) + (isDay ? 0 : 12);
    const startIdx = horaOrder.indexOf(T.WEEKDAY_LORD[vara]);
    hora = horaOrder[(startIdx + k) % 7];
  }
  return {
    jd, vara, varaName: T.WEEKDAYS[vara],
    sunrise: sr ? sr.rise : null, sunset: sr ? sr.set : null, nextSunrise: sr ? sr.nextRise : null,
    tithi: { index: ti + 1, name: tithiName, paksha: ti < 15 ? 'Shukla' : 'Krishna', start: tith.start, end: tith.end, elong: e },
    nakshatra: { index: nak.idx, name: T.NAKSHATRAS[nak.idx], lord: T.VIM_ORDER[nak.idx % 9], start: nak.start, end: nak.end },
    yoga: { index: yog.idx, name: T.YOGA_NAMES[yog.idx], start: yog.start, end: yog.end },
    karana: { name: karanaName, start: kar.start, end: kar.end },
    segments: segs, horaLord: hora,
  };
}

// ---------------------------------------------------------------- special lagnas
export function specialLagnas(chart, st = DEFAULT_SETTINGS) {
  const b = chart.input, out = {};
  const sr = sunriseBefore(chart.jd, b.lonEast, b.lat, st);
  if (sr) {
    const sunAtRise = swe.calc(sr.rise, swe.P.SUN, true, st.ayanamsa).lon;
    const ghatis = (chart.jd - sr.rise) * 24 * 2.5;                // 1 ghati = 24 minutes
    out.bhava = norm(sunAtRise + ghatis * 6);
    out.hora = norm(sunAtRise + ghatis * 12);
    out.ghati = norm(sunAtRise + ghatis * 30);
    out.sunrise = sr.rise;
  }
  const moon = chart.planets[MOON];
  out.sri = norm(chart.lagna.lon + moon.nakFrac * 360);
  const kala = { [SUN]: 30, [MOON]: 16, [MARS]: 6, [MERCURY]: 8, [JUPITER]: 10, [VENUS]: 12, [SATURN]: 1 };
  const l9 = T.SIGN_LORD[(chart.lagnaSign + 8) % 12], m9 = T.SIGN_LORD[(moon.sign + 8) % 12];
  let rem = (kala[l9] + kala[m9]) % 12; if (rem === 0) rem = 12;
  out.induSign = (moon.sign + rem - 1) % 12;
  return out;
}

// ---------------------------------------------------------------- yogas (classical definitions; listed with the condition that triggered them)
export function yogas(chart) {
  const P = chart.planets, out = [];
  const add = (name, why) => out.push({ name, why });
  const s = (id) => P[id].sign, h = (id) => P[id].house;
  const lagna = chart.lagnaSign;
  const fromMoon = (id) => ((P[id].sign - P[MOON].sign + 12) % 12) + 1;
  const fromSun = (id) => ((P[id].sign - P[SUN].sign + 12) % 12) + 1;
  const kendra = [1, 4, 7, 10], trikona = [1, 5, 9];
  const N = (id) => T.PLANETS[id];

  if (kendra.includes(fromMoon(JUPITER))) add('Gajakesari', 'Юпитер в кендре от Луны (' + fromMoon(JUPITER) + '-й дом)');
  if (s(SUN) === s(MERCURY)) add('Budhaditya', 'Солнце и Меркурий в одном знаке');
  if (s(MOON) === s(MARS)) add('Chandra-Mangala', 'Луна и Марс в одном знаке');
  const pm = [[MARS, 'Ruchaka'], [MERCURY, 'Bhadra'], [JUPITER, 'Hamsa'], [VENUS, 'Malavya'], [SATURN, 'Sasa']];
  for (const [id, nm] of pm) {
    const d = P[id].dignity;
    if (kendra.includes(h(id)) && (d === 'Own' || d === 'Exalted' || d === 'Moolatrikona')) add(nm + ' (Pancha Mahapurusha)', `${N(id)} в ${d === 'Exalted' ? 'экзальтации' : 'своём знаке'} в ${h(id)}-м доме`);
  }
  // Moon-based
  const around = [2, 12].map((k) => (P[MOON].sign + k - 1) % 12);
  const planetsIn = (sign, ex) => [MARS, MERCURY, JUPITER, VENUS, SATURN].filter((id) => P[id].sign === sign && !ex.includes(id));
  const in2 = planetsIn(around[0], []), in12 = planetsIn(around[1], []);
  const withMoon = [MARS, MERCURY, JUPITER, VENUS, SATURN].filter((id) => P[id].sign === P[MOON].sign);
  if (in2.length && in12.length) add('Durudhara', 'Планеты во 2-м и 12-м от Луны');
  else if (in2.length) add('Sunapha', 'Планеты во 2-м от Луны: ' + in2.map(N).join(', '));
  else if (in12.length) add('Anapha', 'Планеты в 12-м от Луны: ' + in12.map(N).join(', '));
  else if (!withMoon.length) add('Kemadruma', 'Нет планет во 2-м, 12-м и вместе с Луной (без учёта отмен)');
  // Sun-based
  const sIn2 = [MARS, MERCURY, JUPITER, VENUS, SATURN].filter((id) => P[id].sign === (P[SUN].sign + 1) % 12);
  const sIn12 = [MARS, MERCURY, JUPITER, VENUS, SATURN].filter((id) => P[id].sign === (P[SUN].sign + 11) % 12);
  if (sIn2.length && sIn12.length) add('Ubhayachari', 'Планеты по обе стороны от Солнца');
  else if (sIn2.length) add('Vesi', 'Планеты во 2-м от Солнца: ' + sIn2.map(N).join(', '));
  else if (sIn12.length) add('Vosi', 'Планеты в 12-м от Солнца: ' + sIn12.map(N).join(', '));
  // Raja yogas: kendra lord + trikona lord together
  const lordsOf = (hs) => hs.map((x) => T.SIGN_LORD[(lagna + x - 1) % 12]);
  const kl = new Set(lordsOf([4, 7, 10])), tl = new Set(lordsOf([5, 9]));
  const seen = new Set();
  for (const a of kl) for (const b of tl) {
    if (a === b) continue;
    const key = [a, b].sort().join('-'); if (seen.has(key)) continue; seen.add(key);
    if (s(a) === s(b)) add('Raja yoga', `соединение управителей кендры и трикона: ${N(a)} + ${N(b)}`);
  }
  const l9 = T.SIGN_LORD[(lagna + 8) % 12], l10 = T.SIGN_LORD[(lagna + 9) % 12];
  if (l9 !== l10 && s(l9) === s(l10)) add('Dharma-Karmadhipati', `управители 9-го и 10-го вместе: ${N(l9)} + ${N(l10)}`);
  const l2 = T.SIGN_LORD[(lagna + 1) % 12], l11 = T.SIGN_LORD[(lagna + 10) % 12];
  if (l2 !== l11 && s(l2) === s(l11)) add('Dhana yoga', `управители 2-го и 11-го вместе: ${N(l2)} + ${N(l11)}`);
  // Parivartana
  for (let a = SUN; a <= SATURN; a++) for (let b = a + 1; b <= SATURN; b++) {
    if (T.OWN_SIGNS[a].includes(s(b)) && T.OWN_SIGNS[b].includes(s(a)) && s(a) !== s(b)) add('Parivartana', `обмен знаками: ${N(a)} ↔ ${N(b)}`);
  }
  // Viparita Raja
  const dusth = [6, 8, 12];
  [['Harsha', 6], ['Sarala', 8], ['Vimala', 12]].forEach(([nm, hh]) => {
    const lord = T.SIGN_LORD[(lagna + hh - 1) % 12];
    if (dusth.includes(h(lord)) && lord <= SATURN) add(nm + ' (Viparita Raja)', `управитель ${hh}-го (${N(lord)}) в ${h(lord)}-м доме`);
  });
  // Neecha bhanga (simple form)
  for (let id = SUN; id <= SATURN; id++) {
    if (P[id].dignity !== 'Debilitated') continue;
    const dispositor = T.SIGN_LORD[s(id)];
    const exLord = T.SIGN_LORD[T.EXALT[id][0]];
    const okK = (pl) => kendra.includes(h(pl)) || kendra.includes(fromMoon(pl));
    if (okK(dispositor) || okK(exLord)) add('Neecha Bhanga', `${N(id)} в падении; управитель знака (${N(dispositor)}) или экзальтации (${N(exLord)}) в кендре от Лагны/Луны`);
  }
  if (s(JUPITER) === s(RAHU)) add('Guru-Chandala', 'Юпитер вместе с Раху');
  // Kala Sarpa
  const rl = P[RAHU].lon;
  const side = P.slice(0, 7).map((p) => norm(p.lon - rl) < 180);
  if (side.every((x) => x) || side.every((x) => !x)) add('Kala Sarpa', 'все семь планет по одну сторону оси Раху-Кету');
  // Mangal dosha
  const md = [1, 2, 4, 7, 8, 12];
  const mFromL = h(MARS), mFromM = ((P[MARS].sign - P[MOON].sign + 12) % 12) + 1, mFromV = ((P[MARS].sign - P[VENUS].sign + 12) % 12) + 1;
  const parts = [];
  if (md.includes(mFromL)) parts.push(`от Лагны (${mFromL})`);
  if (md.includes(mFromM)) parts.push(`от Луны (${mFromM})`);
  if (md.includes(mFromV)) parts.push(`от Венеры (${mFromV})`);
  if (parts.length) add('Mangal dosha', 'Марс в 1/2/4/7/8/12 ' + parts.join(', '));
  // Amala
  const ben = [MOON, MERCURY, JUPITER, VENUS].filter((id) => P[id].house === 10);
  if (ben.length) add('Amala', 'благая планета в 10-м от Лагны: ' + ben.map(N).join(', '));
  return out;
}

// ---------------------------------------------------------------- transits & returns
export function transitInfo(natal, jd, st = DEFAULT_SETTINGS) {
  const now = planetsAt(jd, st);
  const moonSign = natal.planets[MOON].sign;
  now.forEach((p) => {
    p.fromLagna = ((p.sign - natal.lagnaSign + 12) % 12) + 1;
    p.fromMoon = ((p.sign - moonSign + 12) % 12) + 1;
  });
  const sat = now[SATURN];
  const sadeSati = [12, 1, 2].includes(sat.fromMoon) ? { phase: { 12: 'первый этап (12-й от Луны)', 1: 'второй этап (над Луной)', 2: 'третий этап (2-й от Луны)' }[sat.fromMoon] } : null;
  const outer = outerAt(jd, st);
  outer.forEach((p) => { p.fromLagna = ((p.sign - natal.lagnaSign + 12) % 12) + 1; p.fromMoon = ((p.sign - moonSign + 12) % 12) + 1; });
  return { jd, planets: now, outer, sadeSati };
}

export function solarReturn(natal, year, st = DEFAULT_SETTINGS) {
  const targetLon = natal.planets[SUN].lon;
  let jd = natal.jd + (year - natal.input.year) * 365.2422;
  for (let i = 0; i < 30; i++) {
    const s = swe.calc(jd, swe.P.SUN, true, st.ayanamsa);
    const d = wrap180(targetLon - s.lon);
    jd += d / s.slon;
    if (Math.abs(d) < 1e-9) break;
  }
  return jd;
}

export function returnChart(natal, jd, lonEast, lat, tzEast, st = DEFAULT_SETTINGS) {
  const loc = jdToLocal(jd, tzEast);
  const b = { name: 'Return', year: loc.y, month: loc.m, day: loc.d, time: loc.h, tzEast, lonEast, lat, place: '' };
  const c = computeChart(b, st);
  c.jd = jd;                                     // use the exact solved instant (avoids rounding through the calendar)
  return c;
}

export function muntha(natal, year) { return (natal.lagnaSign + (year - natal.input.year)) % 12; }

export function lonToString(lon) {
  const d = degIn(lon), dd = Math.floor(d), m = (d - dd) * 60, mm = Math.floor(m), ss = Math.floor((m - mm) * 60);
  return `${dd}°${String(mm).padStart(2, '0')}'${String(ss).padStart(2, '0')}"`;
}
