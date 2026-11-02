// Builds data/atlas.tsv.gz from the GeoNames "cities1000" dump (CC BY 4.0, https://www.geonames.org).
// Source file: cities1000.txt (npm package cities-1000-structured ships it in dist/, or download from download.geonames.org/export/dump/cities15000.zip variants).
// Usage: node tools/build_atlas.mjs path/to/cities1000.txt
import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';
import { translit, skeleton } from '../src/translit.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src) { console.error('usage: node tools/build_atlas.mjs cities1000.txt'); process.exit(1); }
const lines = fs.readFileSync(src, 'utf8').split('\n').filter(Boolean);
const NON_RU = /[іїєґўђћљњџәғқңөұүһ]/i;
const cyrOnly = /^[Ѐ-ӿ][Ѐ-ӿ\s'’.\-]*$/;
const tzs = [], tzIndex = new Map();
const recs = [], seats = {};
for (const ln of lines) {
  const f = ln.split('\t');
  const [, name, ascii, alts, lat, lon, fclass, fcode, cc, , adm, , , , pop, , , tz] = f;
  if (fclass !== 'P') continue;
  const cyr = [], seen = new Set();
  for (const a of (alts || '').split(',')) {
    if (!cyrOnly.test(a) || a.length > 40) continue;
    const key = a.toLowerCase().replace(/ё/g, 'е');
    if (seen.has(key)) continue; seen.add(key); cyr.push(a);
  }
  const sk = skeleton(name || ascii);
  const rank = (a) => (NON_RU.test(a) ? 2 : 0) + (skeleton(translit(a)) === sk ? 0 : 1);          // Russian-looking and sounding like the Latin name first
  cyr.sort((a, b) => rank(a) - rank(b) || a.length - b.length);
  if (!tzIndex.has(tz)) { tzIndex.set(tz, tzs.length); tzs.push(tz); }
  const flag = fcode === 'PPLC' ? 'C' : fcode === 'PPLA' ? 'A' : '';
  const rec = { name: name || ascii, cyr: cyr.slice(0, 8), cc, adm: adm || '', lat: (+lat).toFixed(4), lon: (+lon).toFixed(4), pop: +pop || 0, tz: tzIndex.get(tz), flag };
  recs.push(rec);
  if (flag === 'A' || flag === 'C') {
    const k = cc + '.' + rec.adm, cur = seats[k];
    if (!cur || cur.pop < rec.pop || (flag === 'A' && cur.flag === 'C')) seats[k] = { name: rec.name, pop: rec.pop, flag };
  }
}
// a few well-known Russian spellings that GeoNames lacks or ranks low
const EXTRA = [['Saint Petersburg', 'RU', 'Санкт-Петербург'], ['Kyiv', 'UA', 'Киев'], ['Mumbai', 'IN', 'Бомбей'], ['Kolkata', 'IN', 'Калькутта'], ['Varanasi', 'IN', 'Бенарес'], ['Chennai', 'IN', 'Мадрас'], ['Kathmandu', 'NP', 'Катманду'], ['New Delhi', 'IN', 'Нью-Дели'], ['Delhi', 'IN', 'Дели']];
for (const [nm, cc, ru] of EXTRA) {
  const r = recs.filter((x) => x.name === nm && x.cc === cc).sort((a, b) => b.pop - a.pop)[0];
  if (r && !r.cyr.some((x) => x.toLowerCase() === ru.toLowerCase())) r.cyr.unshift(ru);
}
recs.sort((a, b) => b.pop - a.pop);
const seatNames = Object.fromEntries(Object.entries(seats).map(([k, v]) => [k, v.name]));
const header = JSON.stringify({ v: 1, n: recs.length, tz: tzs, seats: seatNames });
const body = recs.map((r) => [r.name, r.cyr.join('|'), r.cc, r.adm, r.lat, r.lon, r.pop, r.tz, r.flag].join('\t')).join('\n');
const text = header + '\n' + body;
const gz = zlib.gzipSync(Buffer.from(text, 'utf8'), { level: 9 });
fs.mkdirSync(path.join(here, '../data'), { recursive: true });
fs.writeFileSync(path.join(here, '../data/atlas.tsv.gz'), gz);
console.log('records', recs.length, 'raw', (text.length / 1e6).toFixed(2) + ' MB', 'gz', (gz.length / 1e6).toFixed(2) + ' MB', 'tz', tzs.length, 'seats', Object.keys(seatNames).length);
console.log('with cyrillic', recs.filter((r) => r.cyr.length).length);
