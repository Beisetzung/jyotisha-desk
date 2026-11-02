import { setup, readJhd } from './common.mjs';
import { parseJHD } from '../src/jhd.js';
import * as A from '../src/astro.js';
import { shadbala } from '../src/shadbala.js';
await setup();
let fails = 0; const ck = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } };
const names = ['Su','Mo','Ma','Me','Ju','Ve','Sa'];
for (const f of ['Mahatma Gandhi.jhd', 'Swami Vivekananda.jhd'].filter(Boolean)) {
  let txt; try { txt = readJhd(f); } catch { continue; }
  const b = parseJHD(txt, f), c = A.computeChart(b), sb = shadbala(c);
  console.log('==', f, 'lagna', c.lagnaSign, 'abda', sb.info.abdaLord, 'masa', sb.info.masaLord, 'vara', sb.info.varaLord, 'hora', sb.info.horaLord, 'tri', sb.info.triLord, sb.info.isDay ? 'day' : 'night');
  for (let id = 0; id < 7; id++) {
    const o = sb.planets[id];
    console.log(names[id].padEnd(3), 'sth', o.sthana.total.toFixed(1).padStart(6), 'dig', o.dig.toFixed(1).padStart(5), 'kala', o.kala.total.toFixed(1).padStart(6),
      'ches', o.cheshta.toFixed(1).padStart(5), 'nais', o.naisargika.toFixed(1).padStart(5), 'drik', o.drik.toFixed(1).padStart(6),
      '| total', o.total.toFixed(1).padStart(6), 'rupa', o.rupas.toFixed(2), 'ratio', o.ratio.toFixed(2), 'rank', o.rank, c.planets[id].retro ? 'R' : '');
    ck(o.sthana.uchcha >= 0 && o.sthana.uchcha <= 60.0001, 'uchcha range');
    ck(o.dig >= 0 && o.dig <= 60.0001, 'dig range');
    ck(o.cheshta >= 0 && o.cheshta <= 60.0001, 'cheshta range ' + names[id] + ' ' + o.cheshta);
    ck(o.kala.natonnata >= -1e-9 && o.kala.natonnata <= 60.0001, 'nata range');
    ck(Number.isFinite(o.total), 'finite total');
  }
}
// cheshta sanity: outer planet retrograde => high cheshta, near-conjunction => low
{
  const b = parseJHD(readJhd('Mahatma Gandhi.jhd'), 'Mahatma Gandhi.jhd'), c = A.computeChart(b), sb = shadbala(c);
  const retro = [2,3,4,5,6].filter((i) => c.planets[i].retro).map((i) => names[i] + ':' + sb.planets[i].cheshta.toFixed(0));
  console.log('retro cheshta:', retro.join(' '));
  for (const i of [2,3,4,5,6]) if (c.planets[i].retro) ck(sb.planets[i].cheshta > 40, names[i] + ' retrograde should have high cheshta');
}
// monotonic checks on dig: Jupiter exactly on asc => 60
{
  const b = parseJHD(readJhd('Mahatma Gandhi.jhd'), 'Mahatma Gandhi.jhd'), c = A.computeChart(b);
  c.planets[4].lon = c.lagna.lon; c.planets[4].sign = A.signOf(c.lagna.lon); c.planets[4].deg = A.degIn(c.lagna.lon);
  const sb = shadbala(c); ck(Math.abs(sb.planets[4].dig - 60) < 1e-6, 'Jupiter on lagna dig=60, got ' + sb.planets[4].dig);
}
console.log(fails ? fails + ' FAILED' : 'ALL OK');
