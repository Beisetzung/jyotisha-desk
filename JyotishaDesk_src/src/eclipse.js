// Solar and lunar eclipses in a date range (Swiss Ephemeris, Moshier mode), with the Vedic reading of each one:
// sidereal longitude of the eclipse point, nakshatra, houses from the natal lagna / Moon, natal points it touches,
// the nearest lunar node and visibility at a given place.
import * as swe from './swe.js';
import * as T from './tables.js';
import { norm, wrap180, signOf, degIn, DEFAULT_SETTINGS } from './astro.js';

const NAK = 360 / 27;
const nz = (x) => (x && Math.abs(x) > 1 ? x : null);          // swisseph returns 0 for "no such contact"

export function solarType(flags) {
  if (flags & 32) return 'hybrid';
  if (flags & 4) return 'total';
  if (flags & 8) return 'annular';
  return 'partial';
}
export function lunarType(flags) {
  if (flags & 4) return 'total';
  if (flags & 16) return 'partial';
  return 'penumbral';
}
export const TYPE_RU = {
  sol: { total: 'полное', annular: 'кольцеобразное', hybrid: 'гибридное', partial: 'частное' },
  lun: { total: 'полное', partial: 'частичное', penumbral: 'полутеневое' },
};

// Heavy part (about 6 ms per eclipse): the global search. Returns raw records; cache them per date range.
export function findRaw(jdFrom, jdTo, limit = 600) {
  const raw = [];
  for (const kind of ['sol', 'lun']) {
    let t = jdFrom - 2, n = 0;
    for (let guard = 0; guard < 1000 && n < limit; guard++) {
      const r = kind === 'sol' ? swe.solEclipseGlobal(t) : swe.lunEclipseGlobal(t);
      const max = r.t[0];
      if (!(max > 0) || max > jdTo) break;
      if (max >= jdFrom) { raw.push({ kind, flags: r.flags, t: r.t, jd: max }); n++; }
      t = max + 20;
    }
  }
  return raw.sort((a, b) => a.jd - b.jd).slice(0, limit);
}
// natal: chart from computeChart (optional); loc: { lon, lat, alt } for local visibility (optional, ~18 ms per eclipse)
export function decorateAll(raw, { natal = null, loc = null, st = DEFAULT_SETTINGS, orb = 5 } = {}) {
  return raw.map((e) => decorate(e, natal, loc, st, orb));
}
export function listEclipses(jdFrom, jdTo, { natal = null, loc = null, st = DEFAULT_SETTINGS, orb = 5, limit = 80 } = {}) {
  return decorateAll(findRaw(jdFrom, jdTo, limit), { natal, loc, st, orb });
}
// local circumstances of an already decorated eclipse
export function addLocal(out, loc) { out.local = localCircumstances({ kind: out.kind, jd: out.jd }, out, loc); return out.local; }

function decorate(e, natal, loc, st, orb) {
  const sol = e.kind === 'sol';
  const type = sol ? solarType(e.flags) : lunarType(e.flags);
  const body = sol ? swe.P.SUN : swe.P.MOON;
  const lon = norm(swe.calc(e.jd, body, true, st.ayanamsa).lon);
  const out = {
    kind: e.kind, type, typeRu: TYPE_RU[e.kind][type], jd: e.jd, flags: e.flags,
    central: sol ? !!(e.flags & 1) : null,
    lon, sign: signOf(lon), deg: degIn(lon), nak: Math.floor(lon / NAK), pada: Math.floor((lon % NAK) / (NAK / 4)) + 1,
  };
  // contacts (global)
  if (sol) {
    Object.assign(out, { partialBegin: nz(e.t[2]), partialEnd: nz(e.t[3]), centralBegin: nz(e.t[4]), centralEnd: nz(e.t[5]) });
    const w = swe.solEclipseWhere(e.jd);
    out.magnitude = w.attr[0]; out.greatest = { lon: w.lon, lat: w.lat };
  } else {
    Object.assign(out, { partialBegin: nz(e.t[2]), partialEnd: nz(e.t[3]), totalBegin: nz(e.t[4]), totalEnd: nz(e.t[5]), penBegin: nz(e.t[6]), penEnd: nz(e.t[7]) });
    const how = swe.lunEclipseHow(e.jd, loc ? loc.lon : 0, loc ? loc.lat : 0, loc ? loc.alt || 0 : 0);
    out.magnitude = how.attr[0]; out.penMagnitude = how.attr[1];
  }
  // nearest node: eclipses happen near the nodes
  const rahu = norm(swe.calcNode(e.jd, st.trueNode, true, st.ayanamsa, false).lon);
  const dR = Math.abs(wrap180(lon - rahu)), dK = Math.abs(wrap180(lon - (rahu + 180)));
  out.node = dR <= dK ? { id: T.RAHU, dist: dR } : { id: T.KETU, dist: dK };
  // reading against the natal chart
  if (natal) {
    out.fromLagna = ((out.sign - natal.lagnaSign + 12) % 12) + 1;
    out.fromMoon = ((out.sign - natal.planets[T.MOON].sign + 12) % 12) + 1;
    out.hits = [];
    const lagD = Math.abs(wrap180(lon - natal.lagna.lon));
    if (lagD <= orb) out.hits.push({ name: 'Lagna', id: -1, orb: lagD });
    natal.planets.forEach((p) => { const d = Math.abs(wrap180(lon - p.lon)); if (d <= orb) out.hits.push({ name: p.name, id: p.id, orb: d }); });
    out.hits.sort((a, b) => a.orb - b.orb);
  }
  // visibility at the place
  if (loc) out.local = localCircumstances(e, out, loc);
  return out;
}

function localCircumstances(e, out, loc) {
  const alt = loc.alt || 0;
  if (e.kind === 'sol') {
    const l = swe.solEclipseLocal(e.jd - 2, loc.lon, loc.lat, alt);
    if (!(Math.abs(l.t[0] - e.jd) < 1)) return { visible: false };
    return {
      visible: true, maxVisible: !!(l.flags & 256), max: l.t[0], first: nz(l.t[1]), second: nz(l.t[2]), third: nz(l.t[3]), fourth: nz(l.t[4]),
      sunriseDuring: nz(l.t[5]), sunsetDuring: nz(l.t[6]),
      magnitude: l.attr[0], obscuration: l.attr[2], sunAlt: l.attr[5], total: !!(l.flags & 4), annular: !!(l.flags & 8),
    };
  }
  const how = swe.lunEclipseHow(e.jd, loc.lon, loc.lat, alt);
  const l = swe.lunEclipseLocal(e.jd - 2, loc.lon, loc.lat, alt);
  const some = Math.abs(l.t[0] - e.jd) < 1 && !!(l.flags & 128);
  return {
    visible: how.attr[5] > 0 || some, maxVisible: how.attr[5] > 0, moonAlt: how.attr[5], moonAz: how.attr[4],
    umbralBeginVisible: !!(l.flags & 512), penumbral: out.type === 'penumbral',
  };
}
