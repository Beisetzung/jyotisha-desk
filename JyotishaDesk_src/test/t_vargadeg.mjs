// Degrees in divisional charts, outer planets (Uranus, Neptune, Pluto), karaka marks in the chart cells.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setup } from './common.mjs';
const swe = await setup();
const A = await import('../src/astro.js');
const T = await import('../src/tables.js');
const { parseJHD } = await import('../src/jhd.js');
const V = await import('../src/app/viewlib.js').catch((e) => { console.log('(viewlib not importable in node: ' + e.message + ')'); return null; });
const here = path.dirname(fileURLToPath(import.meta.url));
let fails = 0; const ck = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

// 1. vargaDeg: by hand
ck(near(A.vargaDeg(12.5, 1), 12.5), 'D1: degree in the sign');
ck(near(A.vargaDeg(1, 9), 9), 'D9: 1° inside a 3°20′ part = 9° (1/3.3333*30)');
ck(near(A.vargaDeg(3 + 20 / 60 + 1e-7, 9), 0, 1e-3), 'D9: just after the boundary of the second part ≈ 0°'); ck(A.vargaDeg(3 + 20 / 60 - 1e-7, 9) > 29.99, 'D9: just before the boundary ≈ 30°');
ck(near(A.vargaDeg(30 * 4 + 29.999999, 9), 30 - 9e-6 * 9, 1e-4) || A.vargaDeg(30 * 4 + 29.999999, 9) > 29.9, 'D9: the end of the sign is close to 30°');
ck(near(A.vargaDeg(10, 2), 20), 'D2: first half of the sign, 10° of 15° = 20°');
ck(near(A.vargaDeg(20, 2), 10), 'D2: second half, 5° of 15° = 10°');
ck(near(A.vargaDeg(3, 30), 18), 'D30 odd sign (Aries), 3° of 0-5° = 18°');
ck(near(A.vargaDeg(30 + 6, 30), (1 / 7) * 30), 'D30 even sign (Taurus), 1° of 5-12° (7°) = 4.2857°');
ck(near(A.vargaDeg(26, 30), (1 / 5) * 30), 'D30 odd sign: 26° is in the last part (25-30°)');
for (const n of A.VARGAS) { let ok = true; for (let l = 0; l < 360; l += 0.37) { const d = A.vargaDeg(l, n); if (!(d >= 0 && d < 30 + 1e-9)) ok = false; } ck(ok, `D${n}: degree always in [0, 30)`); }
// the sign of the varga and the degree agree: the degree grows with the longitude inside one part
{ let ok = true; for (const n of [3, 9, 12, 27, 60]) for (let l = 0; l < 359; l += 0.173) { if (A.vargaSign(l, n) === A.vargaSign(l + 0.001, n) && A.vargaDeg(l + 0.001, n) < A.vargaDeg(l, n)) ok = false; } ck(ok, 'the degree grows with the longitude inside a part'); }

// 2. the example chart
const text = fs.readFileSync(path.join(here, 'fixtures/shchuchin.jhd'), 'latin1');
const b = parseJHD(text, 'ex');
const st = A.DEFAULT_SETTINGS;
const c = A.computeChart(b, st);
ck(c.outer && c.outer.length === 3, 'chart.outer has Uranus, Neptune, Pluto');
ck(c.planets.length === 9, 'the nine grahas are untouched');
console.log('  outer:', c.outer.map((p) => `${p.name} ${A.lonToString(p.lon)} ${T.SIGN_ABBR[p.sign]} house ${p.house}${p.retro ? ' R' : ''}`).join(' | '));
// positions are checked against known ephemeris values in test/t_motion.mjs (Pluto 2000-01-01 ≈ 11°27′ Sagittarius; retrograde dates of 2020)
// here: sanity of the sidereal values in the example chart (10.11.1986; Lahiri ayanamsa ≈ 23°41′): Pluto ≈ 7-8° Scorpio, Uranus ≈ 20-21° Sagittarius, Neptune ≈ 3-4° Capricorn (tropical)
const trop = (p) => (p.lon + c.ayanamsa + 360) % 360;
ck(Math.abs(trop(c.outer[2]) - (210 + 7.7)) < 1.5, 'Pluto tropical ≈ 7-8° Scorpio: ' + trop(c.outer[2]).toFixed(2));
ck(Math.abs(trop(c.outer[0]) - (240 + 20.5)) < 1.5, 'Uranus tropical ≈ 20-21° Sagittarius: ' + trop(c.outer[0]).toFixed(2));
ck(Math.abs(trop(c.outer[1]) - (270 + 3.9)) < 1.5, 'Neptune tropical ≈ 3-4° Capricorn: ' + trop(c.outer[1]).toFixed(2));
ck(c.outer.every((p) => p.house >= 1 && p.house <= 12 && Number.isFinite(p.speed)), 'outer planets have a house and a speed');
for (const n of [1, 2, 9, 30, 60]) {
  const v = A.vargaChart(c, n);
  ck(v.degs.length === 9 && v.outer.length === 3 && v.outerDegs.length === 3 && Number.isFinite(v.lagnaDeg), `vargaChart(D${n}) has degrees for nine planets, lagna and three outer`);
  ck(c.planets.every((p, i) => v.planets[i] === A.vargaSign(p.lon, n) && near(v.degs[i], A.vargaDeg(p.lon, n))), `D${n}: planets match vargaSign/vargaDeg`);
}
// the Navamsha degrees of the example by hand
{ const sun = c.planets[0], i = Math.min(8, Math.floor(sun.deg / (30 / 9))), expect = (sun.deg - i * (30 / 9)) / (30 / 9) * 30; ck(near(A.vargaDeg(sun.lon, 9), expect, 1e-9), `Sun D9 degree by hand: ${expect.toFixed(3)}`); }

// 3. transit: outer planets
const tr = A.transitInfo(c, c.jd + 365.25 * 10, st);
ck(tr.outer && tr.outer.length === 3 && tr.outer.every((p) => p.fromLagna >= 1 && p.fromMoon >= 1), 'transitInfo has outer planets with houses from the lagna and the Moon');

// 4. karakas
ck(c.karakas.length === 7 && c.karakas.every((k) => Number.isFinite(k.d)), '7 chara karakas with their degrees');
ck(c.karakas.every((k, i, a) => !i || a[i - 1].d >= k.d), 'karakas are sorted by degree, descending');
if (V) {
  const km = V.karakaMap(c);
  ck(Object.keys(km).length === 7 && km[c.karakas[0].planet].abbr === 'AK' && km[c.karakas[6].planet].abbr === 'DK', 'karakaMap: AK first, DK last');
  const cells = V.cellsD1(c, { degrees: true, karakas: true, outer: true }).flat();
  ck(cells.some((x) => x.k === 'AK') && cells.some((x) => x.k === 'DK'), 'cellsD1: karaka marks');
  ck(cells.filter((x) => x.c === 'out').length === 3, 'cellsD1: three outer planets with class "out"');
  ck(cells.some((x) => /^Su \d+°/.test(x.t)), 'cellsD1: degrees next to the planets');
  const no = V.cellsD1(c, { degrees: false, karakas: false, outer: false }).flat();
  ck(no.every((x) => !x.k) && !no.some((x) => x.c === 'out') && no.some((x) => /^Su$/.test(x.t)), 'cellsD1: all three switches off');
  ck(V.chartOpts({ ui: {} }).degrees === true && V.chartOpts({ ui: { degrees: false } }).degrees === false, 'chartOpts: defaults on');
}
console.log(fails ? 'FAILS ' + fails : 'ALL OK');
process.exit(fails ? 1 : 0);
