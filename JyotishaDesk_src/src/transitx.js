// Transit tools: sign ingresses and stations of the planets, Saturn passages over the natal Moon (Sade Sati, Kantaka, Ashtama),
// the classical Gochara reading (favourable houses from the Moon with Vedha obstruction) and transit-to-natal conjunctions/oppositions.
import * as swe from './swe.js';
import * as T from './tables.js';
import * as A from './astro.js';
const { SUN, MOON, MARS, MERCURY, JUPITER, VENUS, SATURN, RAHU, KETU, URANUS, NEPTUNE, PLUTO } = T;

const lonSpeed = (jd, id, st) => { const s = A.planetState(jd, id, st); return { lon: A.norm(s.lon), speed: s.speed }; };
const signAt = (jd, id, st) => A.signOf(lonSpeed(jd, id, st).lon);
// Largest step (days) between samples: far shorter than the interval between stations of the planet, and the planet moves well under 30 degrees in it
const maxStep = (id, st) => ({ [MOON]: 0.5, [SUN]: 5, [MERCURY]: 3, [VENUS]: 5, [MARS]: 8, [JUPITER]: 15, [SATURN]: 20, [RAHU]: st.trueNode ? 10 : 40, [KETU]: st.trueNode ? 10 : 40, [URANUS]: 40, [NEPTUNE]: 40, [PLUTO]: 40 }[id] || 3);
export const EVENT_PLANETS = [SUN, MARS, MERCURY, JUPITER, VENUS, SATURN, RAHU, KETU];

function bisect(f, a, b, iters = 24) {          // f(a) and f(b) have different signs
  let fa = f(a);
  for (let i = 0; i < iters; i++) {
    const m = (a + b) / 2, fm = f(m);
    if ((fm < 0) === (fa < 0) && fm !== 0) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}

// Time when the longitude of the planet passes the boundary; f(ta) = fa and f(tb) = fb (distance to the boundary, signed) have different signs
// and the longitude is monotonic in between. Newton steps (the speed is the derivative) inside a bracket that is narrowed all the time.
function solveCross(id, st, boundary, ta, fa, tb, fb) {
  let a = ta, b = tb, fA = fa, fB = fb;
  let t = fB === fA ? (a + b) / 2 : a + (b - a) * (-fA) / (fB - fA), last = { t, speed: 0 };
  for (let i = 0; i < 40; i++) {
    const s = lonSpeed(t, id, st), f = A.wrap180(s.lon - boundary);
    last = { t, speed: s.speed };
    if (Math.abs(f) < 1e-8) break;                                               // 1e-8 degree: well under a millisecond for the Moon
    if ((f < 0) === (fA < 0)) { a = t; fA = f; } else { b = t; fB = f; }
    let tn = s.speed !== 0 ? t - f / s.speed : NaN;
    if (!(tn > a && tn < b)) tn = (a + b) / 2;
    if (Math.abs(tn - t) < 1e-10) { last = { t: tn, speed: s.speed }; break; }
    t = tn;
  }
  return last;
}

// Zone width in degrees: a sign, a nakshatra, a pada (quarter of a nakshatra)
export const ZONE = { sign: 30, nak: 360 / 27, pada: 360 / 108 };
const zoneOf = (lon, unit) => Math.floor(A.norm(lon) / unit) % Math.round(360 / unit);

// Crossings of zone boundaries ("cross": from zone index -> to zone index, .retro = the planet moves backwards at that moment)
// and stations ("station", direction after the station in .retro) of one planet in [jdFrom, jdTo].
// The path is sampled with large steps; a step that contains a station is split at the station so that every piece is monotonic
// and a planet that crosses a boundary and comes back within one step is not missed. The step shrinks together with the zone width.
export function zoneEvents(jdFrom, jdTo, id, st = A.DEFAULT_SETTINGS, unit = ZONE.sign, { cross = true, stations = false } = {}) {
  const out = [], n = Math.round(360 / unit), step = maxStep(id, st) * Math.min(1, unit / 30);
  const crossing = (ta, sa, tb, sb) => {                // monotonic piece
    const z0 = zoneOf(sa.lon, unit), z1 = zoneOf(sb.lon, unit);
    if (z0 === z1) return;
    const boundary = z1 === (z0 + 1) % n ? z1 * unit : z0 * unit;                    // edge shared by the two zones
    const r = solveCross(id, st, boundary, ta, A.wrap180(sa.lon - boundary), tb, A.wrap180(sb.lon - boundary));
    out.push({ kind: 'cross', id, jd: r.t, from: z0, to: z1, retro: r.speed < 0 });
  };
  let t0 = jdFrom, s0 = lonSpeed(t0, id, st);
  while (t0 < jdTo) {
    const t1 = Math.min(t0 + step, jdTo), s1 = lonSpeed(t1, id, st);
    if (id !== SUN && id !== MOON && s0.speed * s1.speed < 0) {
      const ts = bisect((t) => lonSpeed(t, id, st).speed, t0, t1), ss = lonSpeed(ts, id, st);
      if (stations) out.push({ kind: 'station', id, jd: ts, lon: ss.lon, sign: A.signOf(ss.lon), deg: A.degIn(ss.lon), retro: s1.speed < 0 });
      if (cross) { crossing(t0, s0, ts, ss); crossing(ts, ss, t1, s1); }
    } else if (cross) crossing(t0, s0, t1, s1);
    t0 = t1; s0 = s1;
  }
  return out.sort((a, b) => a.jd - b.jd);
}

// Ingresses ("ingress") and stations ("station", direction after the station in .retro) of the given planets in [jdFrom, jdTo].
export function findEvents(jdFrom, jdTo, ids = EVENT_PLANETS, st = A.DEFAULT_SETTINGS, { ingress = true, stations = true } = {}) {
  const out = [];
  for (const id of ids) {
    for (const e of zoneEvents(jdFrom, jdTo, id, st, ZONE.sign, { cross: ingress, stations })) {
      out.push(e.kind === 'cross' ? { kind: 'ingress', id, jd: e.jd, fromSign: e.from, sign: e.to, retro: e.retro } : e);
    }
  }
  return out.sort((a, b) => a.jd - b.jd);
}

// ---------------------------------------------------------------- stays in signs / nakshatras / padas, stations, retrograde periods
// Average daily motion (deg/day), used to size search windows
export const MEAN_SPEED = { [SUN]: 0.9856, [MOON]: 13.176, [MARS]: 0.524, [MERCURY]: 1.0, [JUPITER]: 0.083, [VENUS]: 1.0, [SATURN]: 0.0335, [RAHU]: 0.053, [KETU]: 0.053, [URANUS]: 0.0117, [NEPTUNE]: 0.006, [PLUTO]: 0.004 };
// Reference speed for "stationary": the planet is called stationary when |speed| is below STATIONARY_FRACTION of it.
// (An arbitrary but fixed convention: the windows come out at about +-1 day for Mercury, +-2.5 days for Venus and +-4 days for Mars, Jupiter and Saturn.)
export const STATIONARY_FRACTION = 0.1;
export const SPEED_REF = { [MARS]: 0.56, [MERCURY]: 1.2, [JUPITER]: 0.13, [VENUS]: 1.05, [SATURN]: 0.073, [RAHU]: 0.05, [KETU]: 0.05, [URANUS]: 0.034, [NEPTUNE]: 0.0215, [PLUTO]: 0.0173 };
export const hasStations = (id, st = A.DEFAULT_SETTINGS) => id !== SUN && id !== MOON && ((id !== RAHU && id !== KETU) || !!st.trueNode);

// 'direct' | 'retro' | 'stat_retro' (stationary, about to turn retrograde) | 'stat_direct' (stationary, about to turn direct)
// For the Sun and the Moon: always 'direct'. For mean nodes: always 'retro'.
export function motionState(id, speed, st = A.DEFAULT_SETTINGS) {
  if (id === SUN || id === MOON) return 'direct';
  if ((id === RAHU || id === KETU) && !st.trueNode) return 'retro';
  if (Math.abs(speed) < STATIONARY_FRACTION * SPEED_REF[id]) return speed >= 0 ? 'stat_retro' : 'stat_direct';
  return speed < 0 ? 'retro' : 'direct';
}

// The stay of the planet in the sign/nakshatra/pada that contains jd: when it entered and when it will leave (null = not found in the search range).
// A retrograde planet may leave a zone and come back, so this is the continuous stay around jd, not the total time in the zone.
export function stayAround(jd, id, st = A.DEFAULT_SETTINGS, unit = ZONE.sign) {
  let W = Math.max(unit / MEAN_SPEED[id], 0.2), prev = null, next = null;
  for (let k = 0; k < 7; k++, W *= 2) {
    const ev = zoneEvents(jd - W, jd + W, id, st, unit);
    prev = [...ev].reverse().find((e) => e.jd <= jd) || null; next = ev.find((e) => e.jd > jd) || null;
    if (prev && next) break;
  }
  const lon = lonSpeed(jd, id, st).lon;
  return { zone: zoneOf(lon, unit), start: prev ? prev.jd : null, from: prev ? prev.from : null, startRetro: prev ? prev.retro : null, end: next ? next.jd : null, to: next ? next.to : null, endRetro: next ? next.retro : null };
}

// Last station at or before jd and next station after it
export function stationsAround(jd, id, st = A.DEFAULT_SETTINGS) {
  if (!hasStations(id, st)) return { prev: null, next: null };
  let W = { [MERCURY]: 90, [VENUS]: 300, [MARS]: 400, [JUPITER]: 300, [SATURN]: 300 }[id] || 400, prev = null, next = null;
  for (let k = 0; k < 6; k++, W *= 2) {
    const ev = zoneEvents(jd - W, jd + W, id, st, ZONE.sign, { cross: false, stations: true });
    prev = [...ev].reverse().find((e) => e.jd <= jd) || null; next = ev.find((e) => e.jd > jd) || null;
    if (prev && next) break;
  }
  return { prev, next };
}

// Consecutive stays in zones over [jdFrom, jdTo]; the first and the last stay are given with their real start and end (outside the range)
export function zonePeriods(id, jdFrom, jdTo, st = A.DEFAULT_SETTINGS, unit = ZONE.sign) {
  const ev = zoneEvents(jdFrom, jdTo, id, st, unit);
  const first = stayAround(jdFrom, id, st, unit), out = [];
  let zone = first.zone, start = first.start, startRetro = first.startRetro, from = first.from;
  for (const e of ev) { out.push({ zone, start, end: e.jd, startRetro, endRetro: e.retro, from, to: e.to }); zone = e.to; start = e.jd; startRetro = e.retro; from = e.from; }
  const last = ev.length ? stayAround(jdTo, id, st, unit) : first;
  out.push({ zone, start, end: last.end, startRetro, endRetro: last.endRetro, from, to: last.to });
  return out;
}

// Retrograde periods that overlap [jdFrom, jdTo]: from the station that starts the retrograde motion to the station that ends it
export function retroPeriods(id, jdFrom, jdTo, st = A.DEFAULT_SETTINGS) {
  if (!hasStations(id, st)) return [];
  const ev = zoneEvents(jdFrom - 200, jdTo + 200, id, st, ZONE.sign, { cross: false, stations: true });     // 200 days > any retrograde period
  const out = [];
  for (let i = 0; i + 1 < ev.length; i++) {
    const a = ev[i], b = ev[i + 1];
    if (!a.retro || b.retro) continue;
    if (b.jd < jdFrom || a.jd > jdTo) continue;
    out.push({ id, start: a.jd, end: b.jd, startLon: a.lon, endLon: b.lon, back: A.norm(a.lon - b.lon) });
  }
  return out;
}

// Longest span (days) for which a list of crossings of the given zone stays within about `limit` entries (retrograde re-crossings included)
export const maxSpanDays = (id, unit, limit = 5000) => Math.max(1, (limit * unit) / (MEAN_SPEED[id] * 1.3));

// Everything about the motion of one planet at a moment
export function motionAt(jd, id, st = A.DEFAULT_SETTINGS) {
  const s = lonSpeed(jd, id, st), stn = stationsAround(jd, id, st);
  return {
    id, jd, lon: s.lon, speed: s.speed, state: motionState(id, s.speed, st),
    prevStation: stn.prev, nextStation: stn.next,
    sign: stayAround(jd, id, st, ZONE.sign), nak: stayAround(jd, id, st, ZONE.nak), pada: stayAround(jd, id, st, ZONE.pada),
  };
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
