import { setup, readJhd, DATA } from './common.mjs';
import fs from 'fs';
import { parseJHD } from '../src/jhd.js';
import * as A from '../src/astro.js';
import { allYogas, GROUP_ORDER } from '../src/yogas2.js';
import * as T from '../src/tables.js';
await setup();
let fails = 0; const ck = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  ', m); };
const files = fs.readdirSync(DATA).filter((f) => /\.jhd$/i.test(f));
let total = 0; const names = new Map();
for (const f of files) {
  const ch = A.computeChart(parseJHD(readJhd(f), f));
  const ys = allYogas(ch);
  total += ys.length;
  ys.forEach((y) => names.set(y.name, (names.get(y.name) || 0) + 1));
  if (!ys.every((y) => GROUP_ORDER.includes(y.group) && y.name && y.why)) ck(false, f + ': every yoga has group/name/why');
  if (/Gandhi|Vivekananda/.test(f)) console.log('  ', f, ys.map((y) => y.name).join(' | '));
}
console.log('charts', files.length, 'yogas', total);
console.log([...names].sort((a, b) => b[1] - a[1]).map(([n, c]) => n + ':' + c).join('  '));
ck(files.length > 0 && total > 0, 'yogas found in sample charts');
// mock checks
const mock = (signs, lagna = 0) => {
  const planets = signs.map((s, id) => ({ id, name: T.PLANETS[id], sign: s, lon: s * 30 + 10, deg: 10, dignity: '', house: ((s - lagna + 12) % 12) + 1, combust: false }));
  planets.forEach((p) => { p.dignity = A.dignity(null, p.id, p.sign, p.deg); });
  return { lagnaSign: lagna, jd: 2450000, planets };
};
// all seven in Aries..: Sun Mo Ma Me Ju Ve Sa Ra Ke
let c = mock([0, 0, 0, 0, 0, 0, 0, 6, 0], 0);
let n = allYogas(c).map((y) => y.name);
ck(n.includes('Gola') && n.includes('Rajju'), 'all seven in Aries: Gola + Rajju');
c = mock([0, 6, 0, 6, 0, 6, 0, 6, 0], 0);           // 1st and 7th house only
n = allYogas(c).map((y) => y.name);
ck(n.includes('Shakata') && n.includes('Yuga'), 'planets only in 1st/7th: Shakata + Yuga');
// Hamsa: Jupiter in Cancer (exalted) in kendra for Aries lagna (4th house)
c = mock([0, 1, 2, 3, 3, 5, 6, 7, 1], 0);
n = allYogas(c).map((y) => y.name);
ck(n.some((x) => /Hamsa/.test(x)), 'Jupiter exalted in 4th: Hamsa');
// Parivartana: Sun in Taurus (Venus's), Venus in Leo (Sun's) -> Aries lagna houses 2 and 5 -> Maha
c = mock([1, 0, 0, 2, 0, 4, 6, 7, 1], 0);
n = allYogas(c).filter((y) => /Parivartana/.test(y.name));
ck(n.length === 1 && n[0].name === 'Maha Parivartana', 'Sun/Venus exchange in houses 2 and 5 => Maha: ' + n.map((y) => y.name));
// Dainya: Mars in Virgo (6th for Aries) and Mercury in Aries
c = mock([0, 0, 5, 0, 0, 0, 0, 7, 1], 0);
n = allYogas(c).filter((y) => /Parivartana/.test(y.name));
ck(n.length === 1 && n[0].name === 'Dainya Parivartana', 'Mars in Virgo / Mercury in Aries (6th) => Dainya');
// Vesi: no Moon counting. Moon in 2nd from Sun alone must give no Vesi.
c = mock([0, 1, 5, 6, 8, 9, 10, 7, 1], 0);
n = allYogas(c).map((y) => y.name);
ck(!n.includes('Vesi'), 'Moon alone 2nd from Sun: no Vesi');
// Kemadruma and its cancellation
c = mock([0, 4, 0, 0, 0, 0, 0, 7, 1], 0);                  // Moon in Leo alone, nobody next to it: planets in Aries (Moon is 9th from Aries). Moon in 5th house (not kendra)
n = allYogas(c).map((y) => y.name);
ck(n.some((x) => /Kemadruma/.test(x)), 'Kemadruma detected: ' + n.filter((x) => /Kema/.test(x)));
console.log(fails ? 'FAILED ' + fails : 'ALL OK');
process.exit(fails ? 1 : 0);
