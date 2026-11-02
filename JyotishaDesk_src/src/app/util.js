// Small helpers: escaping, number/date/coordinate formatting and parsing, a short built-in list of cities.
import * as swe from '../swe.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pad = (n, w = 2) => String(Math.trunc(n)).padStart(w, '0');

// Julian day (UT) -> "dd.mm.yyyy[ hh:mm[:ss]]" in the zone tz (hours east)
export function fmtJD(jd, tz = 0, withTime = false, withSec = false) {
  if (jd == null || !Number.isFinite(jd)) return '—';
  const r = swe.revjul(jd + tz / 24 + 0.5 / 86400);
  const date = `${pad(r.d)}.${pad(r.m)}.${r.y < 0 ? '-' : ''}${pad(Math.abs(r.y), 4)}`;
  if (!withTime) return date;
  const t = Math.floor(r.h * 3600);
  const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
  return `${date} ${pad(hh)}:${pad(mm)}${withSec ? ':' + pad(ss) : ''}`;
}
export function fmtClock(jd, tz = 0, withSec = false) {
  if (jd == null || !Number.isFinite(jd)) return '—';
  return fmtJD(jd, tz, true, withSec).slice(11);
}
export function fmtHM(h, withSec = true) {
  const neg = h < 0; const t = Math.round(Math.abs(h) * 3600);
  return (neg ? '-' : '') + `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}` + (withSec ? ':' + pad(t % 60) : '');
}
export function parseHM(str) {
  const s = String(str).trim().replace(',', '.');
  if (!s) return NaN;
  if (s.includes(':')) {
    const p = s.split(':').map(Number);
    if (p.some(Number.isNaN)) return NaN;
    return p[0] + (p[1] || 0) / 60 + (p[2] || 0) / 3600;
  }
  return parseFloat(s);
}
export function fmtTz(tz) {
  const sign = tz < 0 ? '-' : '+'; const t = Math.round(Math.abs(tz) * 3600);
  return `${sign}${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}` + (t % 60 ? ':' + pad(t % 60) : '');
}
export function parseTz(str) {            // "+5:30", "5.5", "UTC+3", "GMT-4:30" -> hours east
  const s = String(str).trim().toUpperCase().replace(/^(UTC|GMT)/, '').replace(',', '.');
  if (!s) return NaN;
  const sign = s.startsWith('-') ? -1 : 1;
  const v = parseHM(s.replace(/^[+-]/, ''));
  return Number.isNaN(v) ? NaN : sign * v;
}
// "28°36'N", "28:36:50 N", "77.2", "-77.2", "77E12" -> decimal degrees; positive = north / east
export function parseCoord(str, kind) {
  let s = String(str).trim().toUpperCase().replace(',', '.');
  if (!s) return NaN;
  let sign = 1;
  const map = { N: 1, S: -1, E: 1, W: -1, 'С': 1, 'Ю': -1, 'В': 1, 'З': -1 };
  const letter = s.match(/[NSEWСЮВЗ]/);
  if (letter) { sign = map[letter[0]]; s = s.replace(/[NSEWСЮВЗ]/g, ' '); }
  if (s.trim().startsWith('-')) { sign *= -1; s = s.replace('-', ''); }
  const nums = s.replace(/[°'′"″:]/g, ' ').trim().split(/\s+/).map(Number);
  if (!nums.length || nums.some(Number.isNaN)) return NaN;
  const v = nums[0] + (nums[1] || 0) / 60 + (nums[2] || 0) / 3600;
  const lim = kind === 'lat' ? 90 : 180;
  return v > lim ? NaN : sign * v;
}
export function fmtCoord(v, pos, neg) {
  const t = Math.round(Math.abs(v) * 3600), d = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${d}°${pad(m)}'${s ? pad(s) + '"' : ''} ${v < 0 ? neg : pos}`;
}

export function fmtDur(days, yearLen = 365.25) {
  const y = days / yearLen;
  if (y >= 1) { const yy = Math.floor(y); const m = Math.floor((y - yy) * 12); return `${yy} г ${m} мес`; }
  const m = days / (yearLen / 12);
  if (m >= 1) return `${Math.floor(m)} мес ${Math.round((m - Math.floor(m)) * 30)} дн`;
  if (days >= 1) return `${Math.floor(days)} дн ${Math.round((days - Math.floor(days)) * 24)} ч`;
  return `${Math.round(days * 24)} ч ${Math.round(((days * 24) % 1) * 60)} мин`;
}

// name, country, latitude (N+), longitude (E+), current standard time zone (hours east)
export const CITIES = [
  ['Москва', 'Россия', 55.7558, 37.6173, 3], ['Санкт-Петербург', 'Россия', 59.9343, 30.3351, 3], ['Новосибирск', 'Россия', 55.0084, 82.9357, 7],
  ['Екатеринбург', 'Россия', 56.8389, 60.6057, 5], ['Казань', 'Россия', 55.7887, 49.1221, 3], ['Нижний Новгород', 'Россия', 56.2965, 43.9361, 3],
  ['Самара', 'Россия', 53.1959, 50.1002, 4], ['Омск', 'Россия', 54.9885, 73.3242, 6], ['Красноярск', 'Россия', 56.0153, 92.8932, 7],
  ['Владивосток', 'Россия', 43.1155, 131.8855, 10], ['Сочи', 'Россия', 43.6028, 39.7342, 3], ['Ростов-на-Дону', 'Россия', 47.2357, 39.7015, 3],
  ['Киев', 'Украина', 50.4501, 30.5234, 2], ['Минск', 'Беларусь', 53.9006, 27.559, 3], ['Алматы', 'Казахстан', 43.2389, 76.8897, 5],
  ['Ташкент', 'Узбекистан', 41.2995, 69.2401, 5], ['Тбилиси', 'Грузия', 41.7151, 44.8271, 4], ['Баку', 'Азербайджан', 40.4093, 49.8671, 4],
  ['Ереван', 'Армения', 40.1792, 44.4991, 4], ['Рига', 'Латвия', 56.9496, 24.1052, 2], ['Вильнюс', 'Литва', 54.6872, 25.2797, 2],
  ['Таллин', 'Эстония', 59.437, 24.7536, 2], ['Берлин', 'Германия', 52.52, 13.405, 1], ['Лондон', 'Великобритания', 51.5074, -0.1278, 0],
  ['Париж', 'Франция', 48.8566, 2.3522, 1], ['Рим', 'Италия', 41.9028, 12.4964, 1], ['Мадрид', 'Испания', 40.4168, -3.7038, 1],
  ['Стамбул', 'Турция', 41.0082, 28.9784, 3], ['Тель-Авив', 'Израиль', 32.0853, 34.7818, 2], ['Каир', 'Египет', 30.0444, 31.2357, 2],
  ['Дубай', 'ОАЭ', 25.2048, 55.2708, 4], ['Нью-Йорк', 'США', 40.7128, -74.006, -5], ['Лос-Анджелес', 'США', 34.0522, -118.2437, -8],
  ['Чикаго', 'США', 41.8781, -87.6298, -6], ['Торонто', 'Канада', 43.6532, -79.3832, -5], ['Мехико', 'Мексика', 19.4326, -99.1332, -6],
  ['Сан-Паулу', 'Бразилия', -23.5505, -46.6333, -3], ['Буэнос-Айрес', 'Аргентина', -34.6037, -58.3816, -3],
  ['Дели', 'Индия', 28.6139, 77.209, 5.5], ['Мумбаи', 'Индия', 19.076, 72.8777, 5.5], ['Колката', 'Индия', 22.5726, 88.3639, 5.5],
  ['Ченнаи', 'Индия', 13.0827, 80.2707, 5.5], ['Бангалор', 'Индия', 12.9716, 77.5946, 5.5], ['Хайдарабад', 'Индия', 17.385, 78.4867, 5.5],
  ['Варанаси', 'Индия', 25.3176, 82.9739, 5.5], ['Пуна', 'Индия', 18.5204, 73.8567, 5.5], ['Ахмадабад', 'Индия', 23.0225, 72.5714, 5.5],
  ['Джайпур', 'Индия', 26.9124, 75.7873, 5.5], ['Путтапарти', 'Индия', 14.1651, 77.8115, 5.5], ['Порбандар', 'Индия', 21.6417, 69.6293, 5.5],
  ['Катманду', 'Непал', 27.7172, 85.324, 5.75], ['Коломбо', 'Шри-Ланка', 6.9271, 79.8612, 5.5], ['Дакка', 'Бангладеш', 23.8103, 90.4125, 6],
  ['Карачи', 'Пакистан', 24.8607, 67.0011, 5], ['Бангкок', 'Таиланд', 13.7563, 100.5018, 7], ['Сингапур', 'Сингапур', 1.3521, 103.8198, 8],
  ['Пекин', 'Китай', 39.9042, 116.4074, 8], ['Токио', 'Япония', 35.6762, 139.6503, 9], ['Йоханнесбург', 'ЮАР', -26.2041, 28.0473, 2],
  ['Сидней', 'Австралия', -33.8688, 151.2093, 10],
];
