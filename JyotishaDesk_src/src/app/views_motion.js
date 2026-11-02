// Tab "Движение": for every planet - speed, retrograde / stationary state, the previous and next station, the stay in the current sign,
// nakshatra and pada (from when to when); and lists over a period: stays in signs / nakshatras / padas, retrograde periods with the degrees of the stations.
import * as swe from '../swe.js';
import * as T from '../tables.js';
import * as TX from '../transitx.js';
import { esc, fmtJD, fmtTz, fmtDur, parseHM, parseTz, fmtHM } from './util.js';
import { pn, sn, dms, jdNow, nowLocal, isoDate, parseIsoDate, tab, addDays, addMonths, seg } from './viewlib.js';
import { deferred, busy } from './views_extra.js';

const { SUN, MOON, MARS, MERCURY, JUPITER, VENUS, SATURN, RAHU, KETU } = T;
const BASE = [SUN, MOON, MARS, MERCURY, JUPITER, VENUS, SATURN, RAHU, KETU];
const OUT = [T.URANUS, T.NEPTUNE, T.PLUTO];
const BASE_RETRO = [MARS, MERCURY, JUPITER, VENUS, SATURN, RAHU, KETU];
const allIds = (ctx) => (ctx.ui.outer === false ? BASE : BASE.concat(OUT));            // outer planets: after the nine, off by default in the pickers
const retroIds = (ctx) => (ctx.ui.outer === false ? BASE_RETRO : BASE_RETRO.concat(OUT));
const UNIT = { sign: TX.ZONE.sign, nak: TX.ZONE.nak, pada: TX.ZONE.pada };
const MODES = [['sign', 'Знаки'], ['nak', 'Накшатры'], ['pada', 'Пады'], ['retro', 'Ретроградность']];
const DEFAULT_SEL = { sign: [JUPITER, SATURN, RAHU], nak: [JUPITER, SATURN, RAHU], pada: [JUPITER, SATURN], retro: [MARS, MERCURY, JUPITER, VENUS, SATURN] };
const ROW_LIMIT = 3000;

function moState(ctx) {
  return tab(ctx, 'motion', () => {
    const b = ctx.birth, n = nowLocal(b.tzEast), today = isoDate(n.y, n.m, n.d);
    return { sub: 'at', date: isoDate(b.year, b.month, b.day), time: fmtHM(b.time, false), tz: fmtTz(b.tzEast + (b.dst || 0)), from: today, to: addMonths(today, 24), mode: 'retro' };
  });
}
const isOn = (v, mode, id) => (v[`${mode}:${id}`] === undefined ? DEFAULT_SEL[mode].includes(id) : v[`${mode}:${id}`]);

// ---------------------------------------------------------------- helpers
const nakOf = (lon) => Math.floor((((lon % 360) + 360) % 360) / TX.ZONE.nak);
const signLon = (lon) => Math.floor((((lon % 360) + 360) % 360) / 30);
const lordRu = (nak) => T.PLANET_RU[T.VIM_ORDER[nak % 9]];
function zoneName(unit, z) {
  if (unit === UNIT.sign) return sn(z);
  if (unit === UNIT.nak) return `${esc(T.NAKSHATRAS[z])} <span class="mut">${lordRu(z)}</span>`;
  return `${esc(T.NAKSHATRAS[z >> 2])}-${(z & 3) + 1} <span class="mut">${lordRu(z >> 2)}</span>`;
}
function zoneSigns(unit, z) {                               // signs the zone lies in (a nakshatra may straddle two)
  if (unit === UNIT.sign) return [z];
  const a = signLon(z * unit + 1e-9), b = signLon((z + 1) * unit - 1e-9);
  return a === b ? [a] : [a, b];
}
const fmtAt = (jd, tz, withTime) => (jd == null ? '…' : fmtJD(jd, tz, withTime));
const state = {
  direct: () => '<span class="mut">прямое</span>',
  retro: (id, st) => '<span class="tag retro">ретро</span>' + ((id === RAHU || id === KETU) && !st.trueNode ? ' <span class="mut">средний узел: всегда</span>' : ''),
  stat_retro: () => '<span class="tag stat">стационарна → ретро</span>',
  stat_direct: () => '<span class="tag stat">стационарна → прямое</span>',
};
const dirTag = (retro) => (retro ? '<span class="tag retro">→ ретро</span>' : '<span class="mut">→ прямое</span>');
const days = (a, b) => Math.round(Math.abs(a - b));
const posText = (lon, br) => `${dms(lon)} ${sn(signLon(lon))}${br ? '<br>' : ' '}<span class="mut">${esc(T.NAKSHATRAS[nakOf(lon)])}-${Math.floor(((lon % TX.ZONE.nak) + TX.ZONE.nak) % TX.ZONE.nak / TX.ZONE.pada) + 1}</span>`;

// ---------------------------------------------------------------- the tab
export function viewMotion(ctx) {
  const v = moState(ctx);
  const tabs = seg('msub', 'sub', [['at', 'На дату'], ['per', 'Периоды']], v.sub);
  return `<div class="bar sub">${tabs}</div>${v.sub === 'per' ? motionPeriods(ctx, v) : motionAt(ctx, v)}`;
}

function motionAt(ctx, v) {
  const d = parseIsoDate(v.date), tz = parseTz(v.tz), hh = parseHM(v.time);
  const controls = `<section class="card"><div class="bar wrap">
      <button class="btn" data-act="mstep" data-u="d" data-k="-1">−1 д</button><button class="btn" data-act="mstep" data-u="m" data-k="-1">−1 мес</button><button class="btn" data-act="mstep" data-u="y" data-k="-1">−1 г</button>
      <label>Дата <input type="date" data-mo="date" value="${esc(v.date)}"></label>
      <label>Время <input type="text" size="6" data-mo="time" value="${esc(v.time)}"></label>
      <label>Пояс <input type="text" size="6" data-mo="tz" value="${esc(v.tz)}"></label>
      <button class="btn" data-act="mstep" data-u="d" data-k="1">+1 д</button><button class="btn" data-act="mstep" data-u="m" data-k="1">+1 мес</button><button class="btn" data-act="mstep" data-u="y" data-k="1">+1 г</button>
      <button class="btn" data-act="mbirth">Рождение</button><button class="btn" data-act="mnow">Сейчас</button></div></section>`;
  if (!d || Number.isNaN(tz) || Number.isNaN(hh)) return `${controls}<section class="card"><p class="err">Проверьте дату, время и пояс.</p></section>`;
  const jd = swe.julday(d.y, d.m, d.d, hh - tz);
  const dres = deferred(ctx, `mo:at:${jd.toFixed(5)}`, false, () => allIds(ctx).map((id) => TX.motionAt(jd, id, ctx.st)));
  const ms = dres.value, st = ctx.st;
  const fmtSt = (e) => (e ? `${fmtJD(e.jd, tz, true)} · ${posText(e.lon)} ${dirTag(e.retro)}` : '—');
  const rel = (e) => (e ? ` <span class="mut">${e.jd <= jd ? `${days(jd, e.jd)} дн назад` : `через ${days(jd, e.jd)} дн`}</span>` : '');
  const rows = ms.map((m) => {
    const hasSt = TX.hasStations(m.id, st);
    const st1 = hasSt ? (m.prevStation ? fmtSt(m.prevStation) + rel(m.prevStation) : 'не найдена') : '—';
    const st2 = hasSt ? (m.nextStation ? fmtSt(m.nextStation) + rel(m.nextStation) : 'не найдена') : '—';
    return `<tr class="${m.state.startsWith('stat') ? 'now' : ''}"><td>${pn(m.id)}</td><td class="n">${dms(m.lon)} <span class="mut">${T.SIGN_ABBR[signLon(m.lon)]}</span></td>
      <td class="n">${m.speed >= 0 ? '+' : '−'}${Math.abs(m.speed).toFixed(m.id === MOON ? 3 : 4).replace('.', ',')}</td><td>${state[m.state](m.id, st)}</td><td>${st1}</td><td>${st2}</td></tr>`;
  }).join('');
  const stay = (s, unit, label) => {
    if (!s) return '—';
    const short = s.start != null && s.end != null && s.end - s.start < 4;
    const dur = s.start != null && s.end != null ? ` · ${fmtDur(s.end - s.start)}` : '';
    const out = s.to == null ? '' : ` → ${unit === UNIT.sign ? T.SIGN_RU[s.to] : unit === UNIT.nak ? T.NAKSHATRAS[s.to] : `${T.NAKSHATRAS[s.to >> 2]}-${(s.to & 3) + 1}`}${s.endRetro ? ' (ретро)' : ''}`;
    return `${zoneName(unit, s.zone)}<br><span class="mut">${label ? label + ' ' : ''}${fmtAt(s.start, tz, short)} – ${fmtAt(s.end, tz, short)}${dur}${esc(out)}</span>`;
  };
  const stays = ms.map((m) => `<tr><td>${pn(m.id)}</td><td>${stay(m.sign, UNIT.sign)}</td><td>${stay(m.nak, UNIT.nak)}</td><td>${stay(m.pada, UNIT.pada)}</td></tr>`).join('');
  return `${controls}
    <section class="card"><h3>Скорость и стоянки <small class="mut">${esc(fmtJD(jd, tz, true))}</small></h3>
      <div class="scroll"><table class="tbl compact"><thead><tr><th>Планета</th><th>Долгота</th><th>Скорость, °/сут</th><th>Движение</th><th>Предыдущая стоянка</th><th>Следующая стоянка</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="note">Стоянка — момент, когда скорость по долготе равна нулю; «→ ретро» — после неё планета идёт назад, «→ прямое» — вперёд. Положение в стоянке дано сидерической долготой (аянамша из настроек).
      «Стационарна» (подсвечено) — условность программы: скорость меньше 10 % средней скорости планеты (примерно ±1 сутки у Меркурия, ±2–3 суток у Венеры, ±4 суток у Марса, Юпитера и Сатурна вокруг стоянки). Солнце и Луна ретроградными не бывают.
      Раху и Кету при «среднем» узле движутся назад всегда и стоянок не имеют; при «истинном» узле (в настройках) стоянки есть.</p></section>
    <section class="card"><h3>Знак, накшатра и пада: с какого по какое время планета в них находится</h3>
      <div class="scroll"><table class="tbl compact"><thead><tr><th>Планета</th><th>Знак</th><th>Накшатра <span class="mut">(управитель)</span></th><th>Пада</th></tr></thead><tbody>${stays}</tbody></table></div>
      <p class="note">Это непрерывное пребывание вокруг выбранного момента: ретроградная планета может выйти из знака (накшатры, пады) и вернуться, тогда будет несколько отдельных периодов — их список во вкладке «Периоды». Время — в поясе, указанном выше.</p></section>`;
}

// ---------------------------------------------------------------- periods
function motionPeriods(ctx, v) {
  const tz = parseTz(v.tz), f = parseIsoDate(v.from), t = parseIsoDate(v.to), st = ctx.st, c = ctx.chart;
  const mode = v.mode, pool = mode === 'retro' ? retroIds(ctx) : allIds(ctx), ids = pool.filter((id) => isOn(v, mode, id));
  const pickers = pool.map((id) => `<label class="chk"><input type="checkbox" data-mo="${mode}:${id}" ${isOn(v, mode, id) ? 'checked' : ''}> ${T.PLANET_RU[id]}</label>`).join('');
  const controls = `<section class="card"><div class="bar wrap">${seg('mmode', 'm', MODES, mode, 'm')}
    <label>С <input type="date" data-mo="from" value="${esc(v.from)}"></label><label>По <input type="date" data-mo="to" value="${esc(v.to)}"></label>
    <label>Пояс <input type="text" size="6" data-mo="tz" value="${esc(v.tz)}"></label></div>
    <div class="bar wrap" style="margin-top:.5rem"><button class="btn" data-act="mvp" data-p="b1">Рождение + 1 год</button><button class="btn" data-act="mvp" data-p="b30">Рождение + 30 лет</button><button class="btn" data-act="mvp" data-p="t2">2 года от сегодня</button><button class="btn" data-act="mvp" data-p="t10">10 лет от сегодня</button></div>
    <div class="bar wrap" style="margin-top:.5rem">${pickers}</div></section>`;
  if (!f || !t || Number.isNaN(tz)) return `${controls}<section class="card"><p class="err">Проверьте даты и пояс.</p></section>`;
  const jd0 = swe.julday(f.y, f.m, f.d, -tz);
  let jd1 = swe.julday(t.y, t.m, t.d, 24 - tz), notes = [];
  if (jd1 <= jd0) return `${controls}<section class="card"><p class="err">Конец периода раньше начала.</p></section>`;
  if (jd1 - jd0 > 40 * 365.25) { jd1 = jd0 + 40 * 365.25; notes.push('Период ограничен 40 годами.'); }
  if (!ids.length) return `${controls}<section class="card"><p class="note">Отметьте хотя бы одну планету.</p></section>`;
  const nowJD = jdNow();
  // heavy: how many crossings are expected
  const span = (id) => (mode === 'retro' ? jd1 - jd0 : Math.min(jd1 - jd0, TX.maxSpanDays(id, UNIT[mode])));
  const expect = ids.reduce((s, id) => s + (mode === 'retro' ? (jd1 - jd0) / 120 : (span(id) * TX.MEAN_SPEED[id] / UNIT[mode])), 0);
  const key = `mo:per:${mode}:${ids.join(',')}:${jd0.toFixed(3)}:${jd1.toFixed(3)}:${st.trueNode ? 1 : 0}`;
  const dres = deferred(ctx, key, expect > 400, () => (mode === 'retro'
    ? { rows: ids.flatMap((id) => TX.retroPeriods(id, jd0, jd1, st)).sort((a, b) => a.start - b.start) }
    : { per: ids.map((id) => { const j1 = Math.min(jd1, jd0 + TX.maxSpanDays(id, UNIT[mode])); return { id, j1, list: TX.zonePeriods(id, jd0, j1, st, UNIT[mode]) }; }) }));
  if (dres.pending) return `${controls}${busy('периоды')}`;

  if (mode === 'retro') {
    const rows = dres.value.rows;
    let total = 0;
    const html = rows.slice(0, ROW_LIMIT).map((p) => {
      const now = nowJD >= p.start && nowJD < p.end, s1 = signLon(p.startLon), s2 = signLon(p.endLon);
      total++;
      return `<tr class="${now ? 'now' : ''}"><td>${pn(p.id)}</td><td class="n">${fmtJD(p.start, tz, true)}</td><td>${posText(p.startLon, true)}</td><td class="n">${fmtJD(p.end, tz, true)}</td><td>${posText(p.endLon, true)}</td>
        <td class="n">${(p.end - p.start).toFixed(1).replace('.', ',')}</td><td class="n">${p.back.toFixed(2).replace('.', ',')}°</td><td style="white-space:nowrap">${s1 === s2 ? '<span class="mut">—</span>' : `${T.SIGN_ABBR[s1]} → ${T.SIGN_ABBR[s2]}`}</td></tr>`;
    }).join('');
    const hasNode = ids.some((id) => id === RAHU || id === KETU) && !st.trueNode;
    return `${controls}<section class="card"><h3>Ретроградные периоды ${esc(v.from)} — ${esc(v.to)} <small class="mut">${rows.length}</small></h3>
      ${html ? `<div class="scroll"><table class="tbl compact"><thead><tr><th>Планета</th><th>Начало ретро (стоянка)</th><th>Положение</th><th>Конец ретро (стоянка)</th><th>Положение</th><th>Дней</th><th>Назад на</th><th>Смена знака</th></tr></thead><tbody>${html}</tbody></table></div>` : '<p class="note">Ретроградных периодов в этом отрезке нет.</p>'}
      <p class="note">${esc(notes.join(' '))} Показаны периоды, пересекающиеся с отрезком (начало или конец могут лежать за его границами). Положения — сидерическая долгота (аянамша из настроек) в точках стоянок; «Назад на» — на сколько градусов планета отходит назад между стоянками.
      ${hasNode ? ' Раху и Кету при среднем узле ретроградны всегда, периодов у них нет (включите истинный узел в настройках, если нужны стоянки).' : ''}${rows.length > ROW_LIMIT ? ` Показаны первые ${ROW_LIMIT}.` : ''}</p></section>`;
  }

  const unit = UNIT[mode], lagnaSign = c.lagnaSign, moonSign = c.planets[MOON].sign;
  const cards = dres.value.per.map(({ id, j1, list }) => {
    const typical = unit / TX.MEAN_SPEED[id];
    const withTime = typical < 4;
    if (j1 < jd1 - 1e-9) notes.push(`${T.PLANET_RU[id]}: период сокращён до ${fmtJD(j1, tz)} (иначе список слишком длинный).`);
    const body = list.slice(0, ROW_LIMIT).map((p) => {
      const now = p.start != null && p.end != null && nowJD >= p.start && nowJD < p.end;
      const signs = zoneSigns(unit, p.zone);
      const extra = mode === 'sign' ? `<td class="n">${((signs[0] - lagnaSign + 12) % 12) + 1}</td><td class="n">${((signs[0] - moonSign + 12) % 12) + 1}</td>` : `<td>${signs.map((s) => sn(s)).join(' / ')}</td>`;
      const dur = p.start != null && p.end != null ? fmtDur(p.end - p.start) : '—';
      return `<tr class="${now ? 'now' : ''}"><td>${zoneName(unit, p.zone)}</td>${extra}<td class="n">${fmtAt(p.start, tz, withTime)}${p.startRetro ? ' <span class="tag retro">R</span>' : ''}</td><td class="n">${fmtAt(p.end, tz, withTime)}${p.endRetro ? ' <span class="tag retro">R</span>' : ''}</td><td class="n">${dur}</td></tr>`;
    }).join('');
    const head = mode === 'sign' ? '<th>Знак</th><th>Дом от лагны</th><th>Дом от Луны</th>' : `<th>${mode === 'nak' ? 'Накшатра' : 'Накшатра-пада'} <span class="mut">(управитель)</span></th><th>Знак</th>`;
    return `<section class="card"><h3>${pn(id)} <small class="mut">${list.length}</small></h3>
      <div class="scroll"><table class="tbl compact"><thead><tr>${head}<th>Вход</th><th>Выход</th><th>Длительность</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
  }).join('');
  return `${controls}${cards}<section class="card"><p class="note">${esc(notes.join(' '))} Первая и последняя строки показаны с настоящими входом и выходом, даже если они лежат за границами отрезка; метка <span class="tag retro">R</span> — в этот момент планета движется ретроградно
    (вход в знак «задом» означает возврат из следующего знака; выход с R — уход назад в предыдущий). Ретроградная планета может входить в одну и ту же зону несколько раз: каждый период — отдельная строка. Подсвечена строка, которая идёт сейчас.
    Время в поясе, указанном выше; зоны считаются по сидерической долготе (аянамша из настроек).</p></section>`;
}

// ---------------------------------------------------------------- actions
export const actions = {
  msub(ctx, el) { moState(ctx).sub = el.dataset.s; return true; },
  mmode(ctx, el) { moState(ctx).mode = el.dataset.m; return true; },
  mstep(ctx, el) {
    const v = moState(ctx), d = parseIsoDate(v.date); if (!d) return false;
    const k = +el.dataset.k, u = el.dataset.u;
    v.date = u === 'd' ? addDays(v.date, k) : addMonths(v.date, u === 'y' ? 12 * k : k); return true;
  },
  mbirth(ctx) { const v = moState(ctx), b = ctx.birth; Object.assign(v, { date: isoDate(b.year, b.month, b.day), time: fmtHM(b.time, false), tz: fmtTz(b.tzEast + (b.dst || 0)) }); return true; },
  mnow(ctx) { const v = moState(ctx), tz = -new Date().getTimezoneOffset() / 60, n = nowLocal(tz); Object.assign(v, { date: isoDate(n.y, n.m, n.d), time: fmtHM(n.h, false), tz: fmtTz(tz) }); return true; },
  mvp(ctx, el) {
    const v = moState(ctx), b = ctx.birth, p = el.dataset.p, tz = parseTz(v.tz), n = nowLocal(Number.isNaN(tz) ? 0 : tz), today = isoDate(n.y, n.m, n.d), birth = isoDate(b.year, b.month, b.day);
    if (p === 'b1') { v.from = birth; v.to = addMonths(birth, 12); } else if (p === 'b30') { v.from = birth; v.to = addMonths(birth, 360); }
    else { v.from = today; v.to = addMonths(today, p === 't10' ? 120 : 24); }
    return true;
  },
};
export const changes = {};
export const groups = { mo: 'motion' };
