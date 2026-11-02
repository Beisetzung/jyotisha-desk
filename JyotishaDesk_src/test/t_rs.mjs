import { setup } from './common.mjs';
import * as swe from '../src/swe.js';
await setup();
const jd = swe.julday(2024, 3, 20, 0);
const h = (x) => (((x + 0.5) % 1) * 24).toFixed(3);
for (const opts of [{}, { center: true }]) {
  const r = swe.riseTrans(jd, swe.P.SUN, 'rise', 0, 0, 0, opts), s = swe.riseTrans(jd, swe.P.SUN, 'set', 0, 0, 0, opts);
  console.log(JSON.stringify(opts), 'rise', h(r), 'set', h(s), 'jd', r, s);
}
// Delhi 2024-06-21 : sunrise 05:23 IST => 23:53 UT prev day ; sunset 19:22 IST => 13:52 UT
const jd2 = swe.julday(2024, 6, 20, 12);
const r = swe.riseTrans(jd2, swe.P.SUN, 'rise', 77.2, 28.6, 0, {}), s = swe.riseTrans(jd2, swe.P.SUN, 'set', 77.2, 28.6, 0, {});
console.log('Delhi Jun21 rise UT', h(r), '(expect ~23.9 => 05:25 IST)', 'set UT', h(s), '(expect ~13.9 => 19:25 IST)');
