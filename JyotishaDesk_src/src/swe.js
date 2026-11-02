// Thin wrapper over the Swiss Ephemeris WebAssembly module (Moshier ephemeris, no data files needed).
// Swiss Ephemeris is (c) Astrodienst AG, licensed AGPL-3.0 (or commercial). See the notes in the app's "About" tab.

let M = null, xx, serr, cusps, ascmc, geo, tret, ibuf, etret, eattr, egeo;
let sidMode = -1;

export const P = { SUN: 0, MOON: 1, MERCURY: 2, VENUS: 3, MARS: 4, JUPITER: 5, SATURN: 6, URANUS: 7, NEPTUNE: 8, PLUTO: 9, MEAN_NODE: 10, TRUE_NODE: 11 };
const F_MOSEPH = 4, F_SPEED = 256, F_SIDEREAL = 65536;

export async function initSwe(createModule, wasmBinary) {
  M = await createModule({ wasmBinary });
  xx = M._malloc(8 * 8); serr = M._malloc(256); cusps = M._malloc(8 * 16);
  ascmc = M._malloc(8 * 12); geo = M._malloc(8 * 4); tret = M._malloc(8 * 8); ibuf = M._malloc(16);
  etret = M._malloc(8 * 12); eattr = M._malloc(8 * 24); egeo = M._malloc(8 * 4);
  sidMode = -1;
  return M;
}
const f64 = (p, i) => M.getValue(p + 8 * i, 'double');
const err = () => M.UTF8ToString(serr);

export function setSidMode(mode) {
  if (mode !== sidMode) { M._swe_set_sid_mode(mode, 0, 0); sidMode = mode; }
}
export function julday(y, m, d, hourUT) { return M._swe_julday(y, m, d, hourUT, 1); }
export function revjul(jd) {
  M._swe_revjul(jd, 1, ibuf, ibuf + 4, ibuf + 8, tret);
  return { y: M.getValue(ibuf, 'i32'), m: M.getValue(ibuf + 4, 'i32'), d: M.getValue(ibuf + 8, 'i32'), h: f64(tret, 0) };
}
export function deltaT(jd) { return M._swe_deltat(jd); }
export function ayanamsa(jd, mode) { setSidMode(mode); return M._swe_get_ayanamsa_ut(jd); }

// ipl: P.* ; sidereal: true => sidereal longitude using the sid mode. Ketu is derived from Rahu.
export function calc(jd, ipl, sidereal = true, mode = 1) {
  if (sidereal) setSidMode(mode);
  const ketu = ipl === 'KETU';
  const id = ketu ? P.MEAN_NODE : ipl;
  const r = M._swe_calc_ut(jd, id, F_MOSEPH | F_SPEED | (sidereal ? F_SIDEREAL : 0), xx, serr);
  if (r < 0) throw new Error('swe_calc_ut: ' + err());
  let lon = f64(xx, 0), slon = f64(xx, 3);
  if (ketu) lon = (lon + 180) % 360;
  return { lon, lat: f64(xx, 1), dist: f64(xx, 2), slon, slat: f64(xx, 4) };
}
export function calcNode(jd, trueNode, sidereal = true, mode = 1, ketu = false) {
  if (sidereal) setSidMode(mode);
  const r = M._swe_calc_ut(jd, trueNode ? P.TRUE_NODE : P.MEAN_NODE, F_MOSEPH | F_SPEED | (sidereal ? F_SIDEREAL : 0), xx, serr);
  if (r < 0) throw new Error('swe_calc_ut: ' + err());
  let lon = f64(xx, 0);
  if (ketu) lon = (lon + 180) % 360;
  return { lon, lat: f64(xx, 1), dist: f64(xx, 2), slon: f64(xx, 3), slat: f64(xx, 4) };
}


// Tropical declination (equator of date, true position incl. ecliptic latitude), degrees
export function declination(jd, ipl) {
  const r = M._swe_calc_ut(jd, ipl, F_MOSEPH | 2048, xx, serr);          // 2048 = SEFLG_EQUATORIAL
  if (r < 0) throw new Error('swe_calc_ut: ' + err());
  return f64(xx, 1);
}
// Geocentric true longitude referred to the fixed J2000 equinox (used for Cheshta bala)
export function lonJ2000(jd, ipl) {
  const r = M._swe_calc_ut(jd, ipl, F_MOSEPH | 32, xx, serr);            // 32 = SEFLG_J2000
  if (r < 0) throw new Error('swe_calc_ut: ' + err());
  return f64(xx, 0);
}

// returns { cusps[1..12], asc, mc, armc, vertex }  (sidereal when requested)
export function houses(jd, lat, lon, hsys = 'O', sidereal = true, mode = 1) {
  if (sidereal) setSidMode(mode);
  const r = M._swe_houses_ex(jd, F_MOSEPH | (sidereal ? F_SIDEREAL : 0), lat, lon, hsys.charCodeAt(0), cusps, ascmc);
  if (r < 0) throw new Error('swe_houses_ex failed');
  const c = [null]; for (let i = 1; i <= 12; i++) c.push(f64(cusps, i));
  return { cusps: c, asc: f64(ascmc, 0), mc: f64(ascmc, 1), armc: f64(ascmc, 2), vertex: f64(ascmc, 3) };
}

// rise/set. kind: 'rise' | 'set'. opts.center => disc centre without refraction (traditional Indian panchang)
export function riseTrans(jd, ipl, kind, lonEast, lat, alt = 0, opts = {}) {
  M.setValue(geo, lonEast, 'double'); M.setValue(geo + 8, lat, 'double'); M.setValue(geo + 16, alt, 'double');
  let rsmi = kind === 'rise' ? 1 : 2;
  if (opts.center) rsmi |= 256 | 512;
  const r = M._swe_rise_trans(jd, ipl, 0, F_MOSEPH, rsmi, geo, opts.pressure ?? 1013.25, opts.temp ?? 15, tret, serr);
  if (r === -2) return null;           // no rise/set (polar)
  if (r < 0) throw new Error('swe_rise_trans: ' + err());
  return f64(tret, 0);
}

// ---- eclipses (Moshier mode). flags: 1 central, 2 non-central, 4 total, 8 annular, 16 partial, 32 hybrid, 64 penumbral,
// 128 visible, 256 max visible, 512..4096 contacts visible
const arr = (p, n) => Array.from({ length: n }, (_, i) => f64(p, i));
export function solEclipseGlobal(jdStart, backward = false) {
  const r = M._swe_sol_eclipse_when_glob(jdStart, F_MOSEPH, 0, etret, backward ? 1 : 0, serr);
  if (r < 0) throw new Error('swe_sol_eclipse_when_glob: ' + err());
  return { flags: r, t: arr(etret, 10) };
}
export function lunEclipseGlobal(jdStart, backward = false) {
  const r = M._swe_lun_eclipse_when(jdStart, F_MOSEPH, 0, etret, backward ? 1 : 0, serr);
  if (r < 0) throw new Error('swe_lun_eclipse_when: ' + err());
  return { flags: r, t: arr(etret, 10) };
}
function setGeo(lon, lat, alt) { M.setValue(egeo, lon, 'double'); M.setValue(egeo + 8, lat, 'double'); M.setValue(egeo + 16, alt || 0, 'double'); }
export function solEclipseLocal(jdStart, lon, lat, alt = 0, backward = false) {
  setGeo(lon, lat, alt);
  const r = M._swe_sol_eclipse_when_loc(jdStart, F_MOSEPH, egeo, etret, eattr, backward ? 1 : 0, serr);
  if (r < 0) throw new Error('swe_sol_eclipse_when_loc: ' + err());
  return { flags: r, t: arr(etret, 10), attr: arr(eattr, 20) };
}
export function lunEclipseLocal(jdStart, lon, lat, alt = 0, backward = false) {
  setGeo(lon, lat, alt);
  const r = M._swe_lun_eclipse_when_loc(jdStart, F_MOSEPH, egeo, etret, eattr, backward ? 1 : 0, serr);
  if (r < 0) throw new Error('swe_lun_eclipse_when_loc: ' + err());
  return { flags: r, t: arr(etret, 10), attr: arr(eattr, 20) };
}
export function solEclipseWhere(jd) {                 // position of the greatest eclipse and global attributes
  const r = M._swe_sol_eclipse_where(jd, F_MOSEPH, egeo, eattr, serr);
  if (r < 0) throw new Error('swe_sol_eclipse_where: ' + err());
  return { flags: r, lon: f64(egeo, 0), lat: f64(egeo, 1), attr: arr(eattr, 20) };
}
export function lunEclipseHow(jd, lon, lat, alt = 0) {
  setGeo(lon, lat, alt);
  const r = M._swe_lun_eclipse_how(jd, F_MOSEPH, egeo, eattr, serr);
  if (r < 0) throw new Error('swe_lun_eclipse_how: ' + err());
  return { flags: r, attr: arr(eattr, 20) };
}
