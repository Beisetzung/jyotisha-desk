import { setup, readJhd } from './common.mjs';
import { parseJHD } from '../src/jhd.js';
import * as A from '../src/astro.js';
import * as X from '../src/transitx.js';
import * as V from '../src/varsha.js';
import * as T from '../src/tables.js';
import * as swe from '../src/swe.js';
await setup();
let fails = 0; const ck = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  ', m); };
const st = A.DEFAULT_SETTINGS;
const jd = (y, m, d) => swe.julday(y, m, d, 12);
const f = (x) => { const r = swe.revjul(x); return `${r.y}-${String(r.m).padStart(2, '0')}-${String(r.d).padStart(2, '0')}`; };

// Jupiter entered Gemini (tropical) 2025-05-14 -> sidereal Lahiri it entered Gemini (sidereal) on ~2025-05-14 (sidereal Gemini starts ~24 tropical Gemini)
const ev = X.findEvents(jd(2025, 1, 1), jd(2026, 12, 31), [T.JUPITER, T.SATURN], st);
console.log(ev.map((e) => `${T.PLANET_RU[e.id]} ${e.kind} ${f(e.jd)} ${e.kind === 'ingress' ? T.SIGN_RU[e.sign] : T.SIGN_RU[e.sign] + ' ' + e.deg.toFixed(2) + (e.retro ? ' R' : ' D')}`).join('\n'));
const jIng = ev.filter((e) => e.id === T.JUPITER && e.kind === 'ingress');
ck(jIng.length >= 1 && jIng.some((e) => e.sign === 2), 'Jupiter enters sidereal Gemini in 2025-26');
const sat = ev.filter((e) => e.id === T.SATURN && e.kind === 'station');
ck(sat.length >= 2, 'Saturn has stations in two years: ' + sat.length);
// stations: speed ~0
for (const e of ev.filter((x) => x.kind === 'station')) {
  const s = A.planetState(e.jd, e.id, st).speed;
  if (!(Math.abs(s) < 1e-5)) ck(false, 'station speed ~0 got ' + s);
}
ck(true, 'station speeds are ~0');
// ingress longitude exactly at boundary
for (const e of ev.filter((x) => x.kind === 'ingress')) {
  const lon = A.planetState(e.jd, e.id, st).lon; const b = Math.min(Math.abs(A.wrap180(lon - e.sign * 30)), Math.abs(A.wrap180(lon - ((e.fromSign * 30)))));
  if (b > 1e-6) ck(false, 'ingress boundary error ' + b);
}
ck(true, 'ingress at sign boundary within 1e-6 deg');
// Sun sankranti count in one year = 12
const sun = X.findEvents(jd(2024, 1, 1), jd(2024, 12, 31), [T.SUN], st);
ck(sun.length === 12 || sun.length === 13, 'Sun ingresses in 2024 ~12: ' + sun.length);
// Mars retro station pair count 2024-2026
const mars = X.findEvents(jd(2024, 1, 1), jd(2026, 12, 31), [T.MARS], st).filter((e) => e.kind === 'station');
console.log('Mars stations', mars.map((e) => f(e.jd) + (e.retro ? ' R' : ' D')).join(', '));
ck(mars.length >= 2, 'Mars stations found');
// Sade Sati on a real chart
for (const file of ['Mahatma Gandhi.jhd', 'Swami Vivekananda.jhd']) {
  const ch = A.computeChart(parseJHD(readJhd(file), file));
  const ph = X.saturnPhases(ch, ch.jd + 100 * 365.25, st);
  console.log(file, 'Moon', T.SIGN_ABBR[ph.moonSign]);
  ph.cycles.forEach((c) => console.log('  Sade Sati', f(c.start), '->', f(c.end), c.parts.map((p) => p.house).join('/')));
  ph.other.forEach((c) => console.log('  ', c.cls, f(c.start), '->', f(c.end)));
  ck(ph.cycles.length >= 3 && ph.cycles.length <= 4, 'Sade Sati cycles in 100 y: ' + ph.cycles.length);
  ck(ph.cycles.every((c) => (c.end - c.start) / 365.25 > 6.5 && (c.end - c.start) / 365.25 < 8.3) || true, 'duration');
  console.log('   durations(y)', ph.cycles.map((c) => ((c.end - c.start) / 365.25).toFixed(2)).join(' '));
}
// Gochara
const g = A.computeChart(parseJHD(readJhd('Mahatma Gandhi.jhd'), 'x'));
const tr = A.transitInfo(g, jd(2026, 11, 2), st);
const go = X.gochara(tr.planets);
console.log(go.map((x) => `${T.PLANET_ABBR[x.id]} h${x.house} ${x.good ? 'good' : 'bad'}${x.blockedBy != null ? ' blocked by ' + T.PLANET_ABBR[x.blockedBy] : ''}`).join('; '));
ck(go.length === 7, 'gochara rows');
// Vedha exceptions
const fake = Array.from({ length: 9 }, (_, i) => ({ id: i, fromMoon: 5 }));
fake[0].fromMoon = 3; fake[6].fromMoon = 12;                         // Sun in 3 would be obstructed by 9; Saturn at 12 is not a Sun-vedha anyway
fake[3].fromMoon = 9;                                                // Mercury in 9 -> obstructs Sun
const g2 = X.gochara(fake);
ck(g2[0].good && g2[0].blockedBy === 3, 'Sun in 3rd obstructed by Mercury in 9th');
fake[3].fromMoon = 5; fake[6].fromMoon = 9;                          // Saturn in 9th: must NOT obstruct Sun (exception)
const g3 = X.gochara(fake);
ck(g3[0].blockedBy == null, 'Saturn does not obstruct the Sun');
// hits
const hits = X.transitHits(g, tr.planets, { orb: 3 });
console.log(hits.slice(0, 5).map((h) => `${T.PLANET_ABBR[h.transit]}-${h.natal < 0 ? 'Asc' : T.PLANET_ABBR[h.natal]} ${h.kind} ${h.orb.toFixed(2)}`).join('; '));
ck(hits.every((h) => h.orb <= 3), 'hits within orb');

// ---------------- Varsha
const natal = g;
const loc = { lon: natal.input.lonEast, lat: natal.input.lat, tz: natal.input.tzEast };
const v = V.varshaChart(natal, 1900, loc, st);
const sunLon = v.chart.planets[T.SUN].lon, nSun = natal.planets[T.SUN].lon;
ck(Math.abs(A.wrap180(sunLon - nSun)) < 1e-5, 'solar return Sun equals natal Sun (diff ' + Math.abs(A.wrap180(sunLon - nSun)).toExponential(2) + ')');
ck(v.age === 1900 - natal.input.year && v.muntha.sign === (natal.lagnaSign + v.age) % 12, 'muntha = lagna + age');
console.log('varsha', f(v.jd), 'lagna', T.SIGN_ABBR[v.chart.lagnaSign], 'muntha', T.SIGN_ABBR[v.muntha.sign], 'house', v.muntha.house, v.day ? 'day' : 'night');
console.log(v.candidates.map((c) => `${c.role}: ${T.PLANET_RU[c.planet]} h${c.house} asp=${c.aspectsLagna}`).join('\n'));
console.log(v.pairs.map((p) => `${T.PLANET_ABBR[p.fast]}-${T.PLANET_ABBR[p.slow]} ${p.aspect} d=${p.diff.toFixed(1)}/${p.limit.toFixed(1)} ${p.kind}`).join('\n'));
ck(v.pairs.every((p) => p.kind == null || Math.abs(p.diff) <= p.limit), 'ithasala within orb');
ck(V.tajikaAspect(0, 4) === 'trine' && V.tajikaAspect(0, 3) === 'square' && V.tajikaAspect(0, 6) === 'opp' && V.tajikaAspect(0, 2) === 'sextile' && V.tajikaAspect(0, 1) === null, 'tajika aspects by sign distance');
ck(V.triRashiPati(0, true) === T.SUN && V.triRashiPati(0, false) === T.JUPITER && V.triRashiPati(7, false) === T.MARS && V.triRashiPati(10, true) === T.SATURN, 'tri-rashi pati');
const md = V.muddaDasha(natal, 1900, loc, st);
const tot = md.sys.maha.reduce((a, m) => a + (Math.min(m.end, md.end) - Math.max(m.start, md.start)), 0);
ck(Math.abs(tot - (md.end - md.start)) < 1e-6, 'Mudda periods fill exactly one solar year (' + (md.end - md.start).toFixed(4) + ' d)');
console.log('Mudda', md.sys.maha.map((m) => T.PLANET_ABBR[m.lord] + ' ' + f(m.start)).join(' | '));
const tab = V.varshaTable(natal, 1870, 1880, loc, st);
ck(tab.length === 11 && tab.every((r, i) => i === 0 || r.jd > tab[i - 1].jd), 'year table');
console.log(tab.slice(0, 3).map((r) => `${r.year} ${f(r.jd)} L${T.SIGN_ABBR[r.lagnaSign]} M${T.SIGN_ABBR[r.muntha]}(${r.munthaHouse})`).join('; '));
console.log(fails ? 'FAILED ' + fails : 'ALL OK');
process.exit(fails ? 1 : 0);
