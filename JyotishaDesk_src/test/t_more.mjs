import { setup, readJhd } from './common.mjs';
import * as swe from '../src/swe.js';
import { parseJHD, formatHM } from '../src/jhd.js';
import * as A from '../src/astro.js';
import * as T from '../src/tables.js';
await setup();
let fails = 0; const ck = (c, m) => { if (!c) { console.log('  FAIL:', m); fails++; } };
const fmt = (jd, tz) => { const l = A.jdToLocal(jd, tz); return `${l.y}-${String(l.m).padStart(2,'0')}-${String(l.d).padStart(2,'0')} ${formatHM(l.h)}`; };

const b = parseJHD(readJhd('Mahatma Gandhi.jhd'), 'Mahatma Gandhi.jhd');
console.log('Gandhi parsed:', JSON.stringify({ t: b.time, tz: b.tzEast, lon: b.lonEast, lat: b.lat }));
const c = A.computeChart(b);
const pg = A.panchanga(c.jd, b.lonEast, b.lat, b.tzEast);
console.log('vara', pg.varaName, '| sunrise', fmt(pg.sunrise, b.tzEast), 'sunset', fmt(pg.sunset, b.tzEast));
console.log('tithi', pg.tithi.paksha, pg.tithi.name, fmt(pg.tithi.start, b.tzEast), '->', fmt(pg.tithi.end, b.tzEast));
console.log('nak', pg.nakshatra.name, fmt(pg.nakshatra.start, b.tzEast), '->', fmt(pg.nakshatra.end, b.tzEast), '| yoga', pg.yoga.name, '| karana', pg.karana.name);
console.log('rahu kala', fmt(pg.segments.rahu.start, b.tzEast), '-', fmt(pg.segments.rahu.end, b.tzEast), '| hora lord', T.PLANETS[pg.horaLord]);
ck(pg.vara === 6, 'Gandhi was born on a Saturday');
ck(pg.tithi.start <= c.jd && c.jd < pg.tithi.end && pg.nakshatra.start <= c.jd && c.jd < pg.nakshatra.end, 'tithi/nakshatra contain birth instant');
ck(Math.abs(pg.nakshatra.index - c.planets[1].nak) === 0, 'nakshatra matches chart');
const el = A.norm(c.planets[1].lon - c.planets[0].lon);
ck(Math.floor(el / 12) + 1 === pg.tithi.index, 'tithi index matches elongation');
// sunrise should be ~6h local-mean at Porbandar in early October
const sunriseLocalH = (pg.sunrise + b.tzEast / 24 + 0.5) % 1 * 24;
ck(sunriseLocalH > 5.5 && sunriseLocalH < 6.5, 'sunrise near 06:00 LMT, got ' + sunriseLocalH.toFixed(2));

// sunrise at the equinox on the equator ~ 6:00 UT-ish: sanity for rise/set API
const jdEq = swe.julday(2024, 3, 20, 0);
const r0 = swe.riseTrans(jdEq, swe.P.SUN, 'rise', 0, 0, 0, {}), s0 = swe.riseTrans(jdEq, swe.P.SUN, 'set', 0, 0, 0, {});
// equation of time (-7 min) + refraction + upper limb => about 06:04 and 18:10 UT
ck(Math.abs(((r0 + 0.5) % 1) * 24 - 6.07) < 0.05 && Math.abs(((s0 + 0.5) % 1) * 24 - 18.18) < 0.05, 'equator equinox sunrise ~06:04 / sunset ~18:10 UT');
// New Delhi, 2024-06-21: sunrise 05:24 IST, sunset 19:23 IST (published almanac values)
const jdD = swe.julday(2024, 6, 20, 12);
const dr = ((swe.riseTrans(jdD, swe.P.SUN, 'rise', 77.2, 28.6, 0, {}) + 0.5) % 1) * 24, ds = ((swe.riseTrans(jdD, swe.P.SUN, 'set', 77.2, 28.6, 0, {}) + 0.5) % 1) * 24;
ck(Math.abs(dr - 23.9) < 0.1 && Math.abs(ds - 13.88) < 0.1, 'Delhi solstice sunrise/sunset ' + dr.toFixed(2) + ' / ' + ds.toFixed(2));

// solar return
const yr = 1900; const jdr = A.solarReturn(c, yr);
const sunR = swe.calc(jdr, swe.P.SUN, true, 1).lon;
console.log('solar return', yr, fmt(jdr, b.tzEast), 'sun diff', Math.abs(A.wrap180(sunR - c.planets[0].lon)).toExponential(2));
ck(Math.abs(A.wrap180(sunR - c.planets[0].lon)) < 1e-6, 'solar return sun longitude');
const rc = A.returnChart(c, jdr, b.lonEast, b.lat, b.tzEast);
console.log('return lagna', T.SIGNS[rc.lagnaSign], 'muntha', T.SIGNS[A.muntha(c, yr)]);

// transit
const now = swe.julday(2026, 11, 2, 11);
const tr = A.transitInfo(c, now);
console.log('transits 2026-11-02:', tr.planets.map(p => T.PLANET_ABBR[p.id] + ' ' + T.SIGN_ABBR[p.sign] + ' ' + p.deg.toFixed(1) + (p.retro ? 'R' : '')).join(' | '), '| sade sati:', tr.sadeSati ? tr.sadeSati.phase : 'no');

// misc blocks run
const sl = A.specialLagnas(c); console.log('special lagnas: bhava', A.lonToString(sl.bhava), T.SIGNS[A.signOf(sl.bhava)], '| hora', T.SIGNS[A.signOf(sl.hora)], '| ghati', T.SIGNS[A.signOf(sl.ghati)], '| sri', T.SIGNS[A.signOf(sl.sri)], '| indu', T.SIGNS[sl.induSign]);
console.log('arudhas:', A.arudhas(c).map(a => a.name + '=' + T.SIGN_ABBR[a.sign]).join(' '));
console.log('yogas:', A.yogas(c).map(y => y.name).join(', '));
console.log('karakas:', c.karakas.map(k => k.role.slice(0, 2) + '=' + T.PLANET_ABBR[k.planet]).join(' '));
console.log('lagna', T.SIGNS[c.lagnaSign], A.lonToString(c.lagna.lon), '| planets:', c.planets.map(p => T.PLANET_ABBR[p.id] + ' ' + T.SIGN_ABBR[p.sign] + ' h' + p.house + (p.dignity ? ' ' + p.dignity : '')).join(' | '));

// true-node and other ayanamsa still run
for (const st of [{ ...A.DEFAULT_SETTINGS, trueNode: true }, { ...A.DEFAULT_SETTINGS, ayanamsa: 3 }, { ...A.DEFAULT_SETTINGS, houseSystem: 'W' }, { ...A.DEFAULT_SETTINGS, houseSystem: 'P' }]) A.computeChart(b, st);

// serialization round trip
import { serializeJHD } from '../src/jhd.js';
const out = parseJHD(serializeJHD(b), 'x.jhd');
ck(Math.abs(out.time - b.time) < 1e-5 && Math.abs(out.tzEast - b.tzEast) < 1e-5 && Math.abs(out.lonEast - b.lonEast) < 1e-5 && Math.abs(out.lat - b.lat) < 1e-5 && out.year === b.year && out.month === b.month && out.day === b.day, 'jhd round trip');
const au = parseJHD(readJhd('Author of this software.jhd'), 'Author.jhd');
const out2 = parseJHD(serializeJHD(au), 'x.jhd');
ck(Math.abs(out2.time - au.time) < 1e-5 && out2.place === 'Machilipatnam' && Math.abs(out2.tzEast - 5.5) < 1e-9, 'jhd round trip (author) ' + JSON.stringify([au.time, au.tzEast, au.lonEast, au.lat]));
console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
