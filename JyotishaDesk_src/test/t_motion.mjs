// Tests of the planet-motion functions: equivalence with the previous findEvents, brute-force cross-checks, known station dates.
import { setup } from './common.mjs';
const swe = await setup();
const A = await import('../src/astro.js');
const TX = await import('../src/transitx.js');
const OLD = await import('./fixtures/transitx_old.js').catch(() => null);
const T = await import('../src/tables.js');
const st = A.DEFAULT_SETTINGS;
let fails = 0; const ck = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const jd = (y, m, d) => swe.julday(y, m, d, 0);
const ymd = (j) => { const r = swe.revjul(j); return `${r.y}-${String(r.m).padStart(2, '0')}-${String(r.d).padStart(2, '0')}`; };

// 1. findEvents unchanged
if (OLD) {
  for (const [a, b] of [[jd(2000, 1, 1), jd(2012, 1, 1)], [jd(1950, 1, 1), jd(1962, 1, 1)], [jd(2024, 1, 1), jd(2030, 1, 1)]]) {
    for (const trueNode of [false, true]) {
      const s2 = { ...st, trueNode };
      const x = OLD.findEvents(a, b, undefined, s2), y = TX.findEvents(a, b, undefined, s2);
      const strip = (e) => ({ kind: e.kind, id: e.id, sign: e.sign, fromSign: e.fromSign, retro: e.retro });
      ck(x.length === y.length && x.every((e, i) => JSON.stringify(strip(e)) === JSON.stringify(strip(y[i])) && Math.abs(e.jd - y[i].jd) < 1e-4 && (e.deg === undefined || Math.abs(e.deg - y[i].deg) < 1e-4)), `findEvents same as the old one (times within 1e-4 d) (${ymd(a)}..${ymd(b)}, trueNode=${trueNode}, ${x.length} events)`);
    }
  }
}

// 2. stations: speed is zero there; the neighbouring samples are on both sides
for (const id of [T.MARS, T.MERCURY, T.JUPITER, T.VENUS, T.SATURN]) {
  const ev = TX.zoneEvents(jd(2010, 1, 1), jd(2030, 1, 1), id, st, 30, { cross: false, stations: true });
  const bad = ev.filter((e) => Math.abs(A.planetState(e.jd, id, st).speed) > 2e-4 || A.planetState(e.jd + 0.5, id, st).speed * (e.retro ? -1 : 1) < 0 || A.planetState(e.jd - 0.5, id, st).speed * (e.retro ? 1 : -1) < 0);
  let alt = true; for (let i = 1; i < ev.length; i++) if (ev[i].retro === ev[i - 1].retro) alt = false;
  ck(ev.length > 10 && !bad.length && alt, `${T.PLANETS[id]}: ${ev.length} stations in 20 years, speed ~0 at each, directions alternate`);
}

// 3. known retrograde periods (UT dates, tropical-independent): the sidereal longitude does not change the station times by more than a few hours
const known = [
  [T.MERCURY, 2024, '2024-04-01', '2024-04-25'], [T.JUPITER, 2024, '2024-10-09', '2025-02-04'], [T.SATURN, 2024, '2024-06-29', '2024-11-15'],
  [T.MARS, 2024, '2024-12-06', '2025-02-24'], [T.VENUS, 2025, '2025-03-02', '2025-04-13'],
];
for (const [id, y, a, b] of known) {
  const ps = TX.retroPeriods(id, jd(y, 1, 1), jd(y, 12, 31), st);
  const hit = ps.find((p) => Math.abs(p.start - Date.parse(a) / 86400000 - 2440587.5) < 2 && Math.abs(p.end - Date.parse(b) / 86400000 - 2440587.5) < 2);
  ck(!!hit, `${T.PLANETS[id]} retro ${a} .. ${b} found (${ps.map((p) => ymd(p.start) + '..' + ymd(p.end)).join('; ')})`);
}

// 4. nakshatra / pada crossings against brute force sampling
function brute(id, unit, a, b, dt) { const n = Math.round(360 / unit); let z = Math.floor(A.norm(A.planetState(a, id, st).lon) / unit) % n, c = 0; for (let t = a + dt; t <= b; t += dt) { const z2 = Math.floor(A.norm(A.planetState(t, id, st).lon) / unit) % n; if (z2 !== z) { c++; z = z2; } } return c; }
for (const [id, unit, a, b, dt, name] of [
  [T.MOON, TX.ZONE.nak, jd(2020, 1, 1), jd(2020, 4, 1), 1 / 144, 'Moon nakshatras'], [T.MERCURY, TX.ZONE.nak, jd(2023, 1, 1), jd(2025, 1, 1), 1 / 24, 'Mercury nakshatras'],
  [T.SATURN, TX.ZONE.nak, jd(2000, 1, 1), jd(2030, 1, 1), 0.25, 'Saturn nakshatras'], [T.JUPITER, TX.ZONE.pada, jd(2000, 1, 1), jd(2030, 1, 1), 0.25, 'Jupiter padas'],
  [T.MARS, TX.ZONE.pada, jd(2022, 1, 1), jd(2026, 1, 1), 0.25, 'Mars padas'], [T.MERCURY, TX.ZONE.sign, jd(1990, 1, 1), jd(2010, 1, 1), 0.25, 'Mercury signs'],
  [T.VENUS, TX.ZONE.pada, jd(2022, 1, 1), jd(2024, 1, 1), 0.1, 'Venus padas'],
]) {
  const t0 = Date.now(); const ev = TX.zoneEvents(a, b, id, st, unit); const ms = Date.now() - t0;
  const bf = brute(id, unit, a, b, dt);
  ck(ev.length === bf, `${name}: ${ev.length} crossings, brute force ${bf} (${ms} ms)`);
  const off = ev.filter((e) => { const lon = A.planetState(e.jd, id, st).lon; const r = A.norm(lon) % unit; return Math.min(r, unit - r) > 1e-4; });
  ck(!off.length, `${name}: every crossing is on a boundary`);
}

// 5. stays
{
  const j = jd(1985, 7, 10) + 0.3;
  for (const id of [T.SUN, T.MOON, T.MARS, T.MERCURY, T.JUPITER, T.VENUS, T.SATURN, T.RAHU]) {
    for (const unit of [TX.ZONE.sign, TX.ZONE.nak, TX.ZONE.pada]) {
      const s = TX.stayAround(j, id, st, unit);
      const okEdges = s.start != null && s.end != null && s.start <= j && j < s.end;
      const mid = (s.start + s.end) / 2, zm = Math.floor(A.norm(A.planetState(mid, id, st).lon) / unit) % Math.round(360 / unit);
      if (!okEdges || zm !== s.zone) { ck(false, `stay ${T.PLANETS[id]} unit ${unit.toFixed(2)}: ${s.start} ${s.end} zone ${s.zone} mid ${zm}`); }
    }
  }
  ck(true, 'stayAround: edges enclose the moment and the zone matches in the middle (8 planets x 3 units)');
  const m = TX.motionAt(j, T.SATURN, st);
  console.log('  Saturn 1985-07-10:', m.state, m.speed.toFixed(4), 'sign', ymd(m.sign.start), '..', ymd(m.sign.end), 'nak', ymd(m.nak.start), '..', ymd(m.nak.end), 'prev st', ymd(m.prevStation.jd), 'next', ymd(m.nextStation.jd));
}

// 6. zonePeriods: continuous, clipped ends use the real boundaries
{
  const ps = TX.zonePeriods(T.SATURN, jd(2020, 1, 1), jd(2030, 1, 1), st, TX.ZONE.sign);
  let cont = true; for (let i = 1; i < ps.length; i++) if (Math.abs(ps[i].start - ps[i - 1].end) > 1e-9) cont = false;
  console.log('  Saturn signs 2020-2030:', ps.map((p) => `${T.SIGN_RU[p.zone]} ${ymd(p.start)}..${ymd(p.end)}${p.startRetro ? 'R' : ''}`).join(' | '));
  ck(cont && ps[0].start <= jd(2020, 1, 1) && ps[ps.length - 1].end >= jd(2030, 1, 1), 'zonePeriods are continuous and cover the range');
}

// 7. motionState
ck(TX.motionState(T.MERCURY, 0.05, st) === 'stat_retro' && TX.motionState(T.MERCURY, -0.05, st) === 'stat_direct' && TX.motionState(T.MERCURY, -0.5, st) === 'retro' && TX.motionState(T.SUN, 1, st) === 'direct' && TX.motionState(T.RAHU, -0.05, st) === 'retro', 'motionState classes');

// 8. timing
{
  const t0 = Date.now(); TX.zoneEvents(jd(1990, 1, 1), jd(2030, 1, 1), T.MOON, st, TX.ZONE.pada); console.log('  Moon padas over 40 years:', Date.now() - t0, 'ms');
  const t1 = Date.now(); const all = [T.SUN, T.MARS, T.MERCURY, T.JUPITER, T.VENUS, T.SATURN, T.RAHU].map((id) => TX.zoneEvents(jd(1990, 1, 1), jd(2030, 1, 1), id, st, TX.ZONE.pada).length); console.log('  7 planets padas over 40 years:', Date.now() - t1, 'ms', all);
  const t2 = Date.now(); for (const id of [0, 1, 2, 3, 4, 5, 6, 7, 8]) TX.motionAt(jd(2026, 11, 2), id, st); console.log('  motionAt x9:', Date.now() - t2, 'ms');
}
console.log(fails ? `FAILS: ${fails}` : 'ALL OK');

// ---- Uranus, Neptune, Pluto: same machinery
{
  let ok2 = true;
  for (const id of [T.URANUS, T.NEPTUNE, T.PLUTO]) {
    const ev = TX.zoneEvents(jd(2000, 1, 1), jd(2024, 1, 1), id, st, 30, { cross: false, stations: true });
    let alt = true; for (let i = 1; i < ev.length; i++) if (ev[i].retro === ev[i - 1].retro) alt = false;
    const bad = ev.filter((e) => Math.abs(A.planetState(e.jd, id, st).speed) > 2e-4);
    ck(ev.length >= 40 && alt && !bad.length, `${T.PLANET_RU[id]}: ${ev.length} stations in 24 years, speed ~0 there, directions alternate`);
    const bf = brute(id, TX.ZONE.nak, jd(2000, 1, 1), jd(2024, 1, 1), 0.5), z = TX.zoneEvents(jd(2000, 1, 1), jd(2024, 1, 1), id, st, TX.ZONE.nak).length;
    ck(z === bf, `${T.PLANET_RU[id]} nakshatra crossings ${z} = brute force ${bf}`);
    const rp = TX.retroPeriods(id, jd(2020, 1, 1), jd(2021, 1, 1), st);
    ck(rp.length >= 1 && rp.every((p) => p.end - p.start > 120 && p.end - p.start < 175), `${T.PLANET_RU[id]} retro periods 2020: ${rp.map((p) => ymd(p.start) + '..' + ymd(p.end)).join('; ')}`);
    const m = TX.motionAt(jd(2020, 6, 1), id, st); ok2 = ok2 && m.sign.start != null && m.sign.end != null && m.nak.start != null && m.pada.end != null;
  }
  ck(ok2, 'motionAt: stays found for the outer planets');
  // known: Pluto retro 2020-04-25 .. 2020-10-04, Neptune 2020-06-24 .. 2020-11-29, Uranus 2020-08-15 .. 2021-01-14
  const dd = (s) => Date.parse(s) / 86400000 + 2440587.5;
  for (const [id, a, b] of [[T.PLUTO, '2020-04-25', '2020-10-04'], [T.NEPTUNE, '2020-06-24', '2020-11-29'], [T.URANUS, '2020-08-15', '2021-01-14']]) {
    const rp = TX.retroPeriods(id, jd(2020, 1, 1), jd(2021, 3, 1), st).find((p) => Math.abs(p.start - dd(a)) < 2 && Math.abs(p.end - dd(b)) < 2);
    ck(!!rp, `${T.PLANET_RU[id]} retro ${a}..${b} found`);
  }
  // positions: Pluto at 2000-01-01 was at about 11 deg 27 min Sagittarius (tropical), Uranus 11 Aq 30 (tropical, from published ephemerides)
  const pl = A.planetState(jd(2000, 1, 1) + 0.5, T.PLUTO, { ...st, ayanamsa: 1 }); const ay = swe.ayanamsa(jd(2000, 1, 1) + 0.5, 1);
  console.log('  Pluto 2000-01-01 12h UT: sidereal', pl.lon.toFixed(3), 'tropical', (pl.lon + ay).toFixed(3));
  ck(Math.abs(((pl.lon + ay) % 360) - (240 + 11.45)) < 0.2, 'Pluto 2000-01-01 tropical about 11 deg 27 min Sagittarius');
}
console.log(fails ? `FAILS: ${fails}` : 'ALL OK (2)');
