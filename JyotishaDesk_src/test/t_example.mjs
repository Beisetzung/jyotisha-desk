// Example chart from the user (Shchuchin, Belarus): parse + atlas lookup + time zone check
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as AT from '../src/app/atlas.js';
import { parseJHD } from '../src/jhd.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const b64 = fs.readFileSync(path.join(here, '../data/atlas.tsv.gz')).toString('base64');
await AT.loadAtlas(b64);
const ex = process.argv[2] || path.join(here, 'fixtures/shchuchin.jhd');
const c = parseJHD(fs.readFileSync(ex, 'latin1'), 'ex');
console.log('parsed:', JSON.stringify({ y: c.year, m: c.month, d: c.day, time: c.time, tzEast: c.tzEast, dst: c.dst, lat: c.lat, lon: c.lonEast, place: c.place, country: c.country, fmt: c.format }));
for (const q of ['Shchuchin', 'Shchuchyn', 'Щучин', 'Щучин, Беларусь', 'Щучин, Белоруссия', 'Shchuchin, Belarus', 'Shchuchin, BY', 'Szczuczyn', 'Щучин, Belarus']) {
  const r = AT.search(q, 5); console.log(`"${q}":`, r.map((x) => `${x.name}${x.ru ? ' (' + x.ru + ')' : ''}, ${x.country} ${x.lat.toFixed(3)},${x.lon.toFixed(3)} ${x.zone}`).join(' | ') || '—');
}
const r = AT.search('Shchuchin, Belarus', 1)[0];
if (r) { const zi = AT.zoneInfo(r.zone, c.year, c.month, c.day, c.time); console.log('atlas zone info at birth:', JSON.stringify(zi)); }

// ---- checks
const { serializeJHD } = await import('../src/jhd.js');
let fails = 0; const ck = (cond, m) => { console.log(cond ? 'ok  ' : 'FAIL', m); if (!cond) fails++; };
const text = fs.readFileSync(ex, 'latin1');
ck(c.tzEast === 2 && c.dst === 1, 'example: zone +2, DST 1 h (lines 9 and 10 are -2.0 and -3.0)');
{ const a = text.split('\r\n'), b = serializeJHD(c).split('\r\n');
  ck(a.length === b.length && a.every((x, i) => (i === 3 ? Math.abs(parseFloat(x) - parseFloat(b[i])) < 1e-6 : x === b[i])), 'example: parse -> serialize gives the same file (unknown lines are kept; time to 6 decimals)'); }
const c2 = parseJHD(serializeJHD({ ...c, dst: 0, tzEast: 3, raw: [] }), 'x'); ck(c2.dst === 0 && c2.tzEast === 3, 'round trip without DST');
const c3 = parseJHD(serializeJHD({ ...c, dst: 1, tzEast: 3, raw: [] }), 'x'); ck(c3.dst === 1 && c3.tzEast === 3, 'round trip with DST 1 h');
// a file written by the previous version (DST hours in line 11, lines 9 and 10 equal)
const old = text.replace('-3.000000', '-2.000000').replace(/\r\n0\r\n19\r\n/, '\r\n1\r\n19\r\n');
const c4 = parseJHD(old, 'x'); ck(c4.dst === 1 && c4.tzEast === 2, 'older files of this program (DST in line 11) are still read');
// sample charts of the user: nothing changes
import { DATA } from './common.mjs';
for (const f of fs.readdirSync(DATA).filter((n) => /\.jhd$/i.test(n))) { const p = parseJHD(fs.readFileSync(path.join(DATA, f), 'latin1'), f); if (p.dst) ck(false, 'sample with DST? ' + f); }
ck(true, 'sample charts: DST stays 0');
console.log(fails ? 'FAILS ' + fails : 'ALL OK');
