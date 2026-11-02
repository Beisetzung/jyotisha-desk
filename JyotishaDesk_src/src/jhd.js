// Reader/writer for Jagannatha Hora ".jhd" chart files (plain text, CRLF).
// Format worked out from the sample files and verified against the planet longitudes stored in the older ones:
//   line 1-3  month, day, year
//   line 4    local time   \
//   line 5    time zone     > all four are "hh.mm" style: integer part = hours/degrees, the part after the
//   line 6    longitude    /  decimal point = MINUTES (may be fractional), sign: east is NEGATIVE
//   line 7    latitude     /  (north positive)
//   line 8..  optional extras (altitude, decimal time zone, place name, country, pressure, temperature ...)
//   older files: lines 8-17 hold stored planet longitudes + a 9-character flag string.

// "dd.mm[mm..]" -> decimal
export function hm2dec(v) {
  const sign = v < 0 ? -1 : 1, a = Math.abs(v);
  const d = Math.floor(a + 1e-9);
  return sign * (d + ((a - d) * 100) / 60);
}
// decimal -> "dd.mm[mm..]" number
export function dec2hm(x) {
  const sign = x < 0 ? -1 : 1, a = Math.abs(x);
  let d = Math.floor(a + 1e-12), mins = (a - d) * 60;
  if (mins > 59.9999995) { d += 1; mins = 0; }
  return sign * (d + mins / 100);
}

const num = (s) => { const v = parseFloat(String(s).replace(',', '.')); return Number.isFinite(v) ? v : NaN; };

export function parseJHD(text, fileName = '') {
  const lines = text.split(/\r?\n/);
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (lines.length < 7) throw new Error('Файл слишком короткий для .jhd');
  const v = lines.slice(0, 7).map(num);
  if (v.some((x) => Number.isNaN(x))) throw new Error('Первые 7 строк должны быть числами');
  const [month, day, year] = [v[0], v[1], v[2]];
  const timeDec = hm2dec(v[3]);
  const tzEast = -hm2dec(v[4]);
  const lonEast = -hm2dec(v[5]);
  const lat = hm2dec(v[6]);

  const isOldWithPlanets = lines.length >= 18 && /^[01]{9}$/.test((lines[17] || '').trim());
  let place = '', country = '', format = isOldWithPlanets ? 'old' : (lines.length > 12 ? 'new' : 'short');
  let storedPlanets = null, dst = 0, altitude = 0;
  if (isOldWithPlanets) {
    storedPlanets = lines.slice(8, 17).map(num);
  } else {
    if (lines.length > 7) altitude = num(lines[7]) || 0;
    // Lines 9 and 10 hold the standard time zone and the zone including daylight saving (decimal hours, east negative); they differ by the DST hours.
    // (Seen in a chart made in JHora for Belarus, Nov 1986: -2.0 and -3.0 with Moscow time +3.) Charts written earlier by this program keep the DST hours in line 11.
    if (lines.length > 9) {
      const std = num(lines[8]), eff = num(lines[9]);
      if (Number.isFinite(std) && Number.isFinite(eff) && Math.abs(std - eff) > 1e-9 && Math.abs(std - eff) <= 3) dst = std - eff;
    }
    if (!dst && lines.length > 10) dst = num(lines[10]) || 0;
    if (lines.length > 12) place = lines[12] || '';
    if (lines.length > 13) country = lines[13] || '';
    if (/^unknown$/i.test(place)) place = '';
    if (/^unknown$/i.test(country)) country = '';
  }
  const name = fileName.replace(/\.jhd$/i, '');
  return { name, year, month, day, time: timeDec, tzEast, lonEast, lat, place, country, altitude, dst, format, storedPlanets, raw: lines };
}

const f6 = (x) => (Math.round(x * 1e6) / 1e6).toFixed(6);

// Always writes the modern 18-line layout JHora itself uses for new charts. When the chart came from a file in that layout, the lines this program
// does not know (line 12, lines 15-18: they differ between charts, e.g. a country code) are kept as they were.
export function serializeJHD(c) {
  const keep = c.format === 'new' && Array.isArray(c.raw) && c.raw.length >= 18 && !/^[01]{9}$/.test((c.raw[17] || '').trim()) ? c.raw : null;
  const dst = c.dst || 0;
  const out = [
    String(c.month), String(c.day), String(c.year),
    f6(dec2hm(c.time)), f6(dec2hm(-c.tzEast)), f6(dec2hm(-c.lonEast)), f6(dec2hm(c.lat)),
    f6(c.altitude || 0), f6(-c.tzEast), f6(-(c.tzEast + dst)), '0',          // standard zone, zone with daylight saving
    keep ? keep[11] : '0', c.place || 'Unknown', c.country || 'Unknown',
    keep ? keep[14] : '1', keep ? keep[15] : '1013.250000', keep ? keep[16] : '20.000000', keep ? keep[17] : '0',
  ];
  return out.join('\r\n') + '\r\n';
}

export function formatHM(dec) {
  const neg = dec < 0; let t = Math.round(Math.abs(dec) * 3600);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return (neg ? '-' : '') + [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
export function parseHM(str) {      // "17:30:24" | "17:30" | "17.5" -> decimal hours
  const s = String(str).trim().replace(',', '.');
  if (s.includes(':')) {
    const p = s.split(':').map(Number);
    return p[0] + (p[1] || 0) / 60 + (p[2] || 0) / 3600;
  }
  return parseFloat(s);
}
