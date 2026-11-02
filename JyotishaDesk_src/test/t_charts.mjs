import { setup, DATA } from './common.mjs';
import fs from 'fs';
import { parseJHD } from '../src/jhd.js';
import * as A from '../src/astro.js';
import * as T from '../src/tables.js';
await setup();
let fails = 0;
const ck = (c, m) => { if (!c) { console.log('  FAIL:', m); fails++; } };

// 1) engine vs. longitudes JHora stored in the old-format files
for (const f of fs.readdirSync(DATA).filter(f => f.endsWith('.jhd'))) {
  const b = parseJHD(fs.readFileSync(DATA + '/' + f, 'latin1'), f);
  if (!b.storedPlanets) continue;
  const c = A.computeChart(b);
  const ref = b.storedPlanets;                   // [Sun Moon Mars Mer Jup Ven Sat Rahu Lagna]
  const mine = [c.planets[0], c.planets[1], c.planets[2], c.planets[3], c.planets[4], c.planets[5], c.planets[6], c.planets[7], c.lagna].map(p => p.lon);
  const d = mine.map((v, i) => Math.abs(A.wrap180(v - ref[i])));
  const mx = Math.max(...d);
  console.log(f.padEnd(34), 'max |diff| deg =', mx.toFixed(4));
  ck(mx < 0.05, f + ' differs by ' + mx);
}

// 2) varga sanity (known anchor values)
const vs = A.vargaSign;
ck(vs(0.1, 9) === 0 && vs(3.4, 9) === 1 && vs(29.9, 9) === 8, 'D9 of Aries: 0.1->Ar, 3.4->Ta, 29.9->Sg');
ck(vs(30.1, 9) === 9, 'D9 Taurus starts Capricorn');
ck(vs(60.1, 9) === 6, 'D9 Gemini starts Libra');
ck(vs(90.1, 9) === 3, 'D9 Cancer starts Cancer');
ck(vs(10, 2) === 4 && vs(20, 2) === 3 && vs(40, 2) === 3 && vs(50, 2) === 4, 'D2 hora');
ck(vs(5, 3) === 0 && vs(15, 3) === 4 && vs(25, 3) === 8, 'D3');
ck(vs(1, 30) === 0 && vs(7, 30) === 10 && vs(15, 30) === 8 && vs(20, 30) === 2 && vs(27, 30) === 6, 'D30 odd sign');
ck(vs(31, 30) === 1 && vs(40, 30) === 5 && vs(49, 30) === 11 && vs(54, 30) === 9 && vs(59, 30) === 7, 'D30 even sign');
ck(vs(29.99, 60) === (0 + 59) % 12, 'D60 last part of Aries');
for (const n of A.VARGAS) for (let l = 0; l < 360; l += 0.37) { const x = vs(l, n); if (!(x >= 0 && x < 12)) { ck(false, 'varga range D' + n); break; } }
// D1 identity, each varga is consistent over equal parts count
let counts = {};
for (let l = 0; l < 30; l += 0.01) counts[vs(l, 12)] = (counts[vs(l, 12)] || 0) + 1;
ck(Object.keys(counts).length === 12, 'D12 covers 12 signs within one sign');

// 3) Ashtakavarga: totals must match the classical numbers
const b = parseJHD(fs.readFileSync(DATA + '/Mahatma Gandhi.jhd', 'latin1'), 'Mahatma Gandhi.jhd');
const c = A.computeChart(b);
const av = A.ashtakavarga(c);
for (let p = 0; p <= 6; p++) ck(av.bav[p].reduce((a, x) => a + x, 0) === T.AV_TOTALS[p], 'BAV total of ' + T.PLANETS[p]);
ck(av.sav.reduce((a, x) => a + x, 0) === 337, 'SAV total 337');
// every BAV cell is 0..8
ck(Object.values(av.bav).every(r => r.every(x => x >= 0 && x <= 8)), 'BAV cell range');

// 4) Dasha: tiling and balance
const v = A.vimshottari(c);
for (let i = 1; i < v.maha.length; i++) ck(Math.abs(v.maha[i].start - v.maha[i - 1].end) < 1e-9, 'maha continuity');
const m0 = v.maha[0]; const kids = v.children(m0);
ck(Math.abs(kids[0].start - m0.start) < 1e-9 && Math.abs(kids[8].end - m0.end) < 1e-9, 'antardashas tile the maha');
ck(kids[0].lord === m0.lord, 'first antar = maha lord');
const total = v.maha.slice(1, 10).reduce((a, m) => a + (m.end - m.start), 0) / 365.25;
console.log('Gandhi Moon', A.lonToString(c.planets[1].lon), T.SIGNS[c.planets[1].sign], T.NAKSHATRAS[c.planets[1].nak], 'first dasha', T.PLANETS[m0.lord], 'balance', v.balanceYears.toFixed(2), 'y');
const yg = A.yogini(c); console.log('Yogini first', yg.label(yg.maha[0].lord), 'balance', yg.balanceYears.toFixed(2));
const path = A.dashaAt(v, c.jd + 365.25 * 30);
console.log('Gandhi age 30 vimshottari path:', path.map(p => T.PLANETS[p.lord]).join(' > '));

console.log(fails ? fails + ' FAILED' : 'ALL OK');
process.exit(fails ? 1 : 0);
