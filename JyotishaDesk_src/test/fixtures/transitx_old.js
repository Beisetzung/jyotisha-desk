// Transit tools: sign ingresses and stations of the planets, Saturn passages over the natal Moon (Sade Sati, Kantaka, Ashtama),
// the classical Gochara reading (favourable houses from the Moon with Vedha obstruction) and transit-to-natal conjunctions/oppositions.
import * as swe from '../../src/swe.js';
import * as T from '../../src/tables.js';
import * as A from '../../src/astro.js';
const { SUN, MOON, MARS, MERCURY, JUPITER, VENUS, SATURN, RAHU, KETU } = T;

const lonSpeed = (jd, id, st) => { const s = A.planetState(jd, id, st); return { lon: A.norm(s.lon), speed: s.speed }; };
const signAt = (jd, id, st) => A.signOf(lonSpeed(jd, id, st).lon);
// Largest step (days) between samples: far shorter than the interval between stations of the planet, and the planet moves well under 30 degrees in it
const maxStep = (id, st) => ({ [MOON]: 0.5, [SUN]: 5, [MERCURY]: 3, [VENUS]: 5, [MARS]: 8, [JUPITER]: 15, [SATURN]: 20, [RAHU]: st.trueNode ? 10 : 40, [KETU]: st.trueNode ? 10 : 40 }[id] || 3);
export const EVENT_PLANETS = [SUN, MARS, MERCURY, JUPITER, VENUS, SATURN, RAHU, KETU];

function bisect(f, a, b, iters = 24) {          // f(a) and f(b) have different signs
  let fa = f(a);
  for (let i = 0; i < iters; i++) {
    const m = (a + b) / 2, fm = f(m);
    if ((fm < 0) === (fa < 0) && fm !== 0) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}

// Ingresses ("ingress") and stations ("station", direction after the station in .retro) of the given planets in [jdFrom, jdTo].
// The path is sampled with large steps; a step that contains a station is split at the station so that every piece is monotonic
// and a planet that crosses a sign boundary and comes back within one step is not missed.
export function findEvents(jdFrom, jdTo, ids = EVENT_PLANETS, st = A.DEFAULT_SETTINGS, { ingress = true, stations = true } = {}) {
  const out = [];
  for (const id of ids) {
    const step = maxStep(id, st);
    const crossing = (ta, sa, tb, sb) => {               // monotonic piece
      const sg0 = A.signOf(sa.lon), sg1 = A.signOf(sb.lon);
      if (sg0 === sg1) return;
      const boundary = sg1 === (sg0 + 1) % 12 ? sg1 * 30 : sg0 * 30;                // edge shared by the two signs
      const tj = bisect((t) => A.wrap180(lonSpeed(t, id, st).lon - boundary), ta, tb);
      out.push({ kind: 'ingress', id, jd: tj, fromSign: sg0, sign: sg1, retro: lonSpeed(tj, id, st).speed < 0 });
    };
    let t0 = jdFrom, s0 = lonSpeed(t0, id, st);
    while (t0 < jdTo) {
      const t1 = Math.min(t0 + step, jdTo), s1 = lonSpeed(t1, id, st);
      if (id !== SUN && id !== MOON && s0.speed * s1.speed < 0) {
        const ts = bisect((t) => lonSpeed(t, id, st).speed, t0, t1), ss = lonSpeed(ts, id, st);
        if (stations) out.push({ kind: 'station', id, jd: ts, sign: A.signOf(ss.lon), deg: A.degIn(ss.lon), retro: s1.speed < 0 });
        if (ingress) { crossing(t0, s0, ts, ss); crossing(ts, ss, t1, s1); }
      } else if (ingress) crossing(t0, s0, t1, s1);
      t0 = t1; s0 = s1;
    }
  }
  return out.sort((a, b) => a.jd - b.jd);
}

// ---------------------------------------------------------------- Saturn over the natal Moon
export function signIntervals(id, jdFrom, jdTo, st = A.DEFAULT_SETTINGS) {
  const ev = findEvents(jdFrom, jdTo, [id], st, { stations: false });
  const out = []; let sign = signAt(jdFrom, id, st), start = jdFrom;
  for (const e of ev) { out.push({ sign, start, end: e.jd }); sign = e.sign; start = e.jd; }
  out.push({ sign, start, end: jdTo });
  return out;
}
export const SADE_PHASE = { 12: 'первый этап (12-й от Луны)', 1: 'второй этап (над Луной)', 2: 'третий этап (2-й от Луны)' };

// Segments of Saturn's passage through the 12th/1st/2nd (Sade Sati), 4th (Kantaka) and 8th (Ashtama) from the natal Moon
export function saturnPhases(natal, jdTo, st = A.DEFAULT_SETTINGS) {
  const moon = natal.planets[MOON].sign;
  const segs = signIntervals(SATURN, natal.jd, jdTo, st).map((x) => ({ ...x, house: ((x.sign - moon + 12) % 12) + 1 }));
  const cls = (h) => ([12, 1, 2].includes(h) ? 'sade' : h === 4 ? 'kantaka' : h === 8 ? 'ashtama' : null);
  const tagged = segs.map((x) => ({ ...x, cls: cls(x.house) })).filter((x) => x.cls);
  // group: Sade Sati cycles = runs of 'sade' segments separated by less than a year (Saturn may step back into the previous sign)
  const cycles = [];
  for (const x of tagged.filter((y) => y.cls === 'sade')) {
    const last = cycles[cycles.length - 1];
    if (last && x.start - last.end < 366) { last.end = x.end; last.parts.push(x); } else cycles.push({ start: x.start, end: x.end, parts: [x] });
  }
  const other = [];
  for (const x of tagged.filter((y) => y.cls !== 'sade')) {
    const last = other[other.length - 1];
    if (last && last.cls === x.cls && x.start - last.end < 366) { last.end = x.end; last.parts.push(x); } else other.push({ cls: x.cls, start: x.start, end: x.end, parts: [x] });
  }
  return { moonSign: moon, cycles, other: other.sort((a, b) => a.start - b.start) };
}

// ---------------------------------------------------------------- Gochara
export const GOCHARA_GOOD = {
  [SUN]: [3, 6, 10, 11], [MOON]: [1, 3, 6, 7, 10, 11], [MARS]: [3, 6, 11], [MERCURY]: [2, 4, 6, 8, 10, 11],
  [JUPITER]: [2, 5, 7, 9, 11], [VENUS]: [1, 2, 3, 4, 5, 8, 9, 11, 12], [SATURN]: [3, 6, 11],
};
// Vedha: when the planet is in house key (from the Moon), a planet in house value obstructs the good result
export const GOCHARA_VEDHA = {
  [SUN]: { 3: 9, 6: 12, 10: 4, 11: 5 },
  [MOON]: { 1: 5, 3: 9, 6: 12, 7: 2, 10: 4, 11: 8 },
  [MARS]: { 3: 12, 6: 9, 11: 5 },
  [MERCURY]: { 2: 5, 4: 3, 6: 9, 8: 1, 10: 8, 11: 12 },
  [JUPITER]: { 2: 12, 5: 4, 7: 3, 9: 10, 11: 8 },
  [VENUS]: { 1: 8, 2: 7, 3: 1, 4: 10, 5: 9, 8: 5, 9: 11, 11: 6, 12: 3 },
  [SATURN]: { 3: 12, 6: 9, 11: 5 },
};
const NO_VEDHA = (a, b) => (a === SUN && b === SATURN) || (a === SATURN && b === SUN) || (a === MOON && b === MERCURY) || (a === MERCURY && b === MOON);

// transit: array of planet objects with .fromMoon (from A.transitInfo)
export function gochara(transitPlanets) {
  const fm = (id) => transitPlanets[id].fromMoon;
  return [SUN, MOON, MARS, MERCURY, JUPITER, VENUS, SATURN].map((id) => {
    const h = fm(id), good = GOCHARA_GOOD[id].includes(h);
    let blockedBy = null;
    if (good) {
      const vh = GOCHARA_VEDHA[id][h];
      const b = [SUN, MOON, MARS, MERCURY, JUPITER, VENUS, SATURN, RAHU, KETU].find((o) => o !== id && fm(o) === vh && !NO_VEDHA(id, o));
      if (b != null) blockedBy = b;
    }
    return { id, house: h, good, blockedBy, effective: good && blockedBy == null };
  });
}

// ---------------------------------------------------------------- transit to natal
// conjunctions and oppositions within the orb (degrees) between transit planets and natal planets / Lagna
export function transitHits(natal, transitPlanets, { orb = 3, transitIds = [MARS, JUPITER, SATURN, RAHU, KETU, SUN, MERCURY, VENUS] } = {}) {
  const natPoints = [{ id: -1, name: 'Lagna', lon: natal.lagna.lon }, ...natal.planets.map((p) => ({ id: p.id, name: p.name, lon: p.lon }))];
  const out = [];
  for (const id of transitIds) {
    const tp = transitPlanets[id];
    for (const n of natPoints) {
      const dc = Math.abs(A.wrap180(tp.lon - n.lon)), dop = Math.abs(180 - dc);
      if (dc <= orb) out.push({ transit: id, natal: n.id, kind: 'conj', orb: dc });
      else if (dop <= orb && !((id === RAHU || id === KETU) && (n.id === RAHU || n.id === KETU))) out.push({ transit: id, natal: n.id, kind: 'opp', orb: dop });
    }
  }
  return out.sort((a, b) => a.orb - b.orb);
}
void swe;
