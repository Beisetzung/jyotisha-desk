// City atlas: GeoNames "cities1000" (about 140 000 places with 1000+ inhabitants, CC BY 4.0) embedded as gzip+base64 and decoded on first use,
// plus the time zone (IANA name from the same table) -> UTC offset at the birth date through the browser's own tz database (Intl).
import { fold, translit, skeleton, hasCyrillic } from '../translit.js';

let DB = null, loading = null;
export const atlasReady = () => !!DB;

async function gunzip(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Браузер не поддерживает распаковку (DecompressionStream). Нужен Chrome или Edge.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
export function loadAtlas(b64 = typeof window !== 'undefined' ? window.__ATLAS__ : undefined) {
  if (DB) return Promise.resolve(DB);
  if (loading) return loading;
  loading = (async () => {
    if (!b64) throw new Error('Данные атласа не найдены в файле.');
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const text = await gunzip(bytes);
    const nl = text.indexOf('\n'), head = JSON.parse(text.slice(0, nl));
    const rows = text.slice(nl + 1).split('\n'), n = rows.length;
    const db = { tzNames: head.tz, seats: head.seats, n, name: new Array(n), cyr: new Array(n), cc: new Array(n), adm: new Array(n), lat: new Float32Array(n), lon: new Float32Array(n), pop: new Int32Array(n), tz: new Uint16Array(n), flag: new Array(n), fName: new Array(n), fCyr: new Array(n), skel: null };
    for (let i = 0; i < n; i++) {
      const f = rows[i].split('\t');
      db.name[i] = f[0]; db.cyr[i] = f[1] ? f[1].split('|') : []; db.cc[i] = f[2]; db.adm[i] = f[3];
      db.lat[i] = +f[4]; db.lon[i] = +f[5]; db.pop[i] = +f[6]; db.tz[i] = +f[7]; db.flag[i] = f[8] || '';
      db.fName[i] = fold(f[0]);
      db.fCyr[i] = db.cyr[i].map(fold);
    }
    DB = db;
    if (typeof window !== 'undefined' && b64 === window.__ATLAS__) delete window.__ATLAS__;
    return db;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

let dn = null, dnEn = null;
export function countryName(cc) {
  try { dn ||= new Intl.DisplayNames(['ru'], { type: 'region' }); return dn.of(cc) || cc; } catch { return cc; }
}
function countryNameEn(cc) {
  try { dnEn ||= new Intl.DisplayNames(['en'], { type: 'region' }); return dnEn.of(cc) || cc; } catch { return cc; }
}
export function seatOf(i) { return DB.seats[DB.cc[i] + '.' + DB.adm[i]] || ''; }

function lev(a, b) {                                  // edit distance between two short strings
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
function wordStart(hay, q) { return hay.startsWith(q) ? 1 : hay.includes(' ' + q) ? 2 : hay.includes(q) ? 3 : 0; }

// query: "москва", "Paris, US", "Бангалор, Индия"
export function search(query, limit = 12) {
  if (!DB) return [];
  const parts = String(query).split(',');
  const q = fold(parts[0]);
  if (q.length < 2) return [];
  const filt = fold(parts.slice(1).join(' '));
  const cyr = hasCyrillic(q);
  const ALIAS = { сша: 'US', оаэ: 'AE', англия: 'GB', америка: 'US', 'великобритания': 'GB', эмираты: 'AE', 'ю а р': 'ZA', юар: 'ZA', белоруссия: 'BY', usa: 'US', uk: 'GB', uae: 'AE', 'great britain': 'GB', england: 'GB', 'south africa': 'ZA', 'russian federation': 'RU' };
  const alias = ALIAS[filt] || '';
  const okCache = new Map();
  const countryOk = filt ? (i) => {
    const cc = DB.cc[i];
    let r = okCache.get(cc);
    if (r === undefined) { const cn = fold(countryName(cc)), en = fold(countryNameEn(cc)); r = alias ? alias === cc : (fold(cc) === filt || (filt.length >= 3 && (cn.startsWith(filt) || cn.includes(filt) || en.startsWith(filt) || en.includes(filt)))); okCache.set(cc, r); }
    return r || fold(DB.adm[i]) === filt || fold(seatOf(i)).startsWith(filt);
  } : null;
  const hits = [];
  const scan = (get) => {
    for (let i = 0; i < DB.n; i++) {
      let best = 0, label = '';
      const v = get(i);
      if (Array.isArray(v)) {
        for (let k = 0; k < v.length; k++) { const s = v[k] === q ? 0.5 : wordStart(v[k], q); if (s && (!best || s < best)) { best = s; label = DB.cyr[i][k]; } }
      } else best = v === q ? 0.5 : wordStart(v, q);
      if (best && (!countryOk || countryOk(i))) hits.push({ i, score: best, label });
    }
  };
  if (cyr) scan((i) => DB.fCyr[i]); else scan((i) => DB.fName[i]);
  if (!cyr && hits.length < 3) {                      // Latin spelling differs between sources (Shchuchin / Shchuchyn): compare consonant skeletons
    const sk = skeleton(q);
    if (sk.length >= 3) {
      DB.skel ||= DB.name.map(skeleton);
      const seen = new Set(hits.map((h) => h.i));
      for (let i = 0; i < DB.n; i++) {
        if (seen.has(i) || !DB.skel[i].startsWith(sk) || (countryOk && !countryOk(i))) continue;
        hits.push({ i, score: (DB.skel[i] === sk ? 0.8 : 2.5) + Math.min(lev(DB.fName[i], q), 40) / 100, label: '' });
      }
    }
  }
  if (!hits.length && cyr) {                          // fallback: consonant skeleton of the transliteration
    const sk = skeleton(translit(q));
    if (sk.length >= 2) {
      DB.skel ||= DB.name.map(skeleton);
      for (let i = 0; i < DB.n; i++) if (DB.skel[i].startsWith(sk) && (!countryOk || countryOk(i))) hits.push({ i, score: 2.5, label: '' });
    }
  }
  hits.sort((a, b) => a.score - b.score || DB.pop[b.i] - DB.pop[a.i]);
  return hits.slice(0, limit).map((h) => {
    const i = h.i, seat = seatOf(i);
    return { i, name: DB.name[i], ru: h.label || '', cc: DB.cc[i], country: countryName(DB.cc[i]), adm: DB.adm[i], seat: seat && seat !== DB.name[i] ? seat : '', lat: DB.lat[i], lon: DB.lon[i], pop: DB.pop[i], zone: DB.tzNames[DB.tz[i]] };
  });
}

// Atlas entry nearest to the point (within maxKm), or null
export function nearest(lat, lon, maxKm = 20) {
  if (!DB || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const k = Math.cos((lat * Math.PI) / 180);
  let best = -1, bd = Infinity;
  for (let i = 0; i < DB.n; i++) {
    const dy = DB.lat[i] - lat; if (Math.abs(dy) > maxKm / 100) continue;
    let dx = Math.abs(DB.lon[i] - lon); if (dx > 180) dx = 360 - dx;
    const d = Math.hypot(dy, dx * k) * 111.2;
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0 || bd > maxKm) return null;
  const seat = seatOf(best);
  return { i: best, name: DB.name[best], ru: DB.cyr[best][0] || '', cc: DB.cc[best], country: countryName(DB.cc[best]), adm: DB.adm[best], seat: seat && seat !== DB.name[best] ? seat : '', lat: DB.lat[best], lon: DB.lon[best], pop: DB.pop[best], zone: DB.tzNames[DB.tz[best]], km: bd };
}
// The atlas entry for a chart's place: first by name and country (spelling variants allowed) and then by closeness of coordinates, otherwise the nearest place.
export function matchPlace(place, country, lat, lon) {
  if (!DB) return null;
  const km = (r) => { const k = Math.cos((lat * Math.PI) / 180); let dx = Math.abs(r.lon - lon); if (dx > 180) dx = 360 - dx; return Math.hypot(r.lat - lat, dx * k) * 111.2; };
  if (place) {
    for (const q of [country ? `${place}, ${country}` : place, place]) {
      const near = search(q, 12).map((r) => ({ ...r, km: Number.isFinite(lat) ? km(r) : 0 })).filter((r) => !Number.isFinite(lat) || r.km <= 60).sort((a, b) => a.km - b.km);
      if (near.length) return near[0];
    }
  }
  return nearest(lat, lon, 15);
}

// ---------------------------------------------------------------- time zones
const fmts = new Map();
function dtf(zone) {
  let f = fmts.get(zone);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }); fmts.set(zone, f); }
  return f;
}
const utcMs = (y, mo, d, h, mi, s) => { const t = new Date(0); t.setUTCFullYear(y, mo - 1, d); t.setUTCHours(h, mi, s, 0); return t.getTime(); };
// offset (hours east) of the zone at the UTC instant ts (ms)
export function offsetAtUTC(zone, ts) {
  const p = {};
  for (const x of dtf(zone).formatToParts(new Date(ts))) p[x.type] = +x.value;
  const local = utcMs(p.year, p.month, p.day, p.hour % 24, p.minute, p.second);
  return Math.round((local - Math.floor(ts / 1000) * 1000) / 1000) / 3600;
}
// clock time -> offset: y m d and hours of the local clock
export function offsetAtLocal(zone, y, m, d, hour) {
  const t = utcMs(y, m, d, 0, 0, 0) + Math.round(hour * 3600) * 1000;
  let o = offsetAtUTC(zone, t);
  const o2 = offsetAtUTC(zone, t - o * 3600000);
  if (o2 !== o) { const o3 = offsetAtUTC(zone, t - o2 * 3600000); o = o3 === o2 ? o2 : Math.min(o, o2); } else o = o2;
  return o;
}
// { total, std, dst, lmt } in hours; std = the smaller of the January and July offsets of that year.
// lmt = true when the database gives a local-mean-time style offset (not whole minutes, or before 1850): then it describes the zone's reference city,
// not this place, and the caller should rather use longitude / 15.
export function zoneInfo(zone, y, m, d, hour) {
  const total = offsetAtLocal(zone, y, m, d, hour);
  const jan = offsetAtUTC(zone, utcMs(y, 1, 1, 12, 0, 0)), jul = offsetAtUTC(zone, utcMs(y, 7, 1, 12, 0, 0));
  let std = Math.min(jan, jul);
  if (total < std) std = total;
  const lmt = y < 1850 || Math.abs(Math.round(total * 3600) % 60) > 0;
  return { total, std, dst: Math.round((total - std) * 1000) / 1000, lmt };
}
