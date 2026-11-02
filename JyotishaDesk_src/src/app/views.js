// Tab renderers (return HTML strings) and their action handlers. State that belongs to a tab lives in ctx.v.<tab>.
import * as swe from '../swe.js';
import * as T from '../tables.js';
import * as A from '../astro.js';
import { shadbala } from '../shadbala.js';
import { esc, pad, fmtJD, fmtClock, fmtTz, fmtDur, fmtCoord, parseHM, parseTz, parseCoord, fmtHM } from './util.js';
import { drawChart } from './svgcharts.js';
import { DIGNITY_RU, DIGNITY_CLS, WD_SHORT, pn, sn, dms, cache, jdNow, nowLocal, isoDate, parseIsoDate, tab, cellsD1, chartBox, karakaMap, KARAKA_ABBR, KARAKA_RU, KARAKA_MEANING, chartOpts } from './viewlib.js';
import * as J from '../jaimini.js';
import { allYogas, GROUP_ORDER } from '../yogas2.js';
import * as X from './views_extra.js';
import * as MO from './views_motion.js';
import * as TX from '../transitx.js';

const { SUN, MOON, SATURN } = T;
export const TABS = [['chart', 'Карта'], ['vargas', 'Варги'], ['dashas', 'Даши'], ['strength', 'Силы'], ['yogas', 'Йоги'], ['arudhas', 'Арудхи'], ['panchanga', 'Панчанга'], ['transits', 'Транзиты'], ['motion', 'Движение'], ['varsha', 'Варшапхала'], ['eclipses', 'Затмения']];
const VARGA_RU = { 1: 'Раси', 2: 'Хора', 3: 'Дреккана', 4: 'Чатуртхамша', 7: 'Саптамша', 9: 'Навамша', 10: 'Дашамша', 12: 'Двадашамша', 16: 'Шодашамша', 20: 'Вимшамша', 24: 'Чатурвимшамша', 27: 'Бхамша', 30: 'Тримшамша', 40: 'Кхаведамша', 45: 'Акшаведамша', 60: 'Шаштиамша' };

// ---------------------------------------------------------------- chart cells
function cellsVarga(chart, n, o = {}) {
  const v = A.vargaChart(chart, n), cells = Array.from({ length: 12 }, () => []);
  const km = o.karakas ? karakaMap(chart) : {}, dg = (x) => (o.degrees ? ' ' + Math.floor(x) + '°' : '');
  cells[v.lagna].push({ t: 'Asc' + dg(v.lagnaDeg), c: 'asc' });
  v.planets.forEach((s, id) => cells[s].push({ t: T.PLANET_ABBR[id] + dg(v.degs[id]), c: '', k: km[id] ? km[id].abbr : '' }));
  if (o.outer) v.outer.forEach((s, i) => cells[s].push({ t: T.PLANET_ABBR[9 + i] + dg(v.outerDegs[i]), c: 'out' }));
  return { cells, lagna: v.lagna };
}
// degrees as 12°34'
const dmin = (x) => { const d = Math.floor(x + 1e-9), m = Math.floor((x - d) * 60 + 1e-9); return `${d}°${String(m).padStart(2, '0')}'`; };

const STAT_TAG = {
  stat_retro: '<span class="tag stat" title="Скорость меньше 10 % средней: планета у стоянки, дальше пойдёт ретроградно">стац. → ретро</span>',
  stat_direct: '<span class="tag stat" title="Скорость меньше 10 % средней: планета у стоянки, дальше пойдёт прямо">стац. → прямое</span>',
};
// ---------------------------------------------------------------- CHART
export function viewChart(ctx) {
  const c = ctx.chart, b = ctx.birth, tz = b.tzEast;
  const pg = cache(ctx, 'pg0', () => A.panchanga(c.jd, b.lonEast, b.lat, tz, ctx.st));
  const vim = cache(ctx, 'vim', () => A.vimshottari(c, ctx.st));
  const path = A.dashaAt(vim, jdNow()).slice(0, 3).map((p) => T.PLANET_RU[p.lord]).join(' — ');
  const ayName = (T.AYANAMSAS.find((a) => a.id === ctx.st.ayanamsa) || {}).name || '';

  const info = `<section class="card info">
    <h2 class="name">${esc(b.name || 'Без имени')}</h2>
    <dl class="kv">
      <div><dt>Дата и время</dt><dd>${fmtJD(c.jd, tz + (b.dst || 0), true, true)} <span class="mut">(${fmtTz(tz)}${b.dst ? ` + ${b.dst} ч летнее` : ''})</span></dd></div>
      <div><dt>Место</dt><dd>${esc([b.place, b.country].filter(Boolean).join(', ') || '—')} <span class="mut">${fmtCoord(b.lat, 'N', 'S')}, ${fmtCoord(b.lonEast, 'E', 'W')}</span></dd></div>
      <div><dt>Аянамша</dt><dd>${esc(ayName)} <span class="mut">${dms(c.ayanamsa)}</span></dd></div>
      <div><dt>Лагна</dt><dd>${sn(c.lagnaSign)} ${dms(c.lagna.lon)}, ${T.NAKSHATRAS[c.lagna.nak]} ${c.lagna.pada}</dd></div>
      <div><dt>Вара</dt><dd>${esc(pg.varaName)}</dd></div>
      <div><dt>Титхи</dt><dd>${esc(pg.tithi.paksha === 'Shukla' ? 'Шукла' : 'Кришна')} ${esc(pg.tithi.name)} <span class="mut">до ${fmtJD(pg.tithi.end, tz, true)}</span></dd></div>
      <div><dt>Накшатра Луны</dt><dd>${esc(T.NAKSHATRAS[c.planets[MOON].nak])}, пада ${c.planets[MOON].pada}</dd></div>
      <div><dt>Йога · Карана</dt><dd>${esc(pg.yoga.name)} · ${esc(pg.karana.name)}</dd></div>
      <div><dt>Восход · закат</dt><dd>${fmtClock(pg.sunrise, tz, true)} · ${fmtClock(pg.sunset, tz, true)}</dd></div>
      <div><dt>Вимшоттари сегодня</dt><dd>${esc(path || 'вне 120 лет от рождения')}</dd></div>
    </dl>
    ${c.input.format === 'old' ? '<p class="note">Файл в старом формате JHora (с сохранёнными позициями). Позиции пересчитаны заново; при сохранении файл будет записан в новом формате.</p>' : ''}
  </section>`;

  const co = chartOpts(ctx), km = karakaMap(c);
  const d1 = chartBox(ctx, { cells: cellsD1(c, co), lagnaSign: c.lagnaSign, title: 'Раси', sub: 'D1' }, 'Раси (D1)');
  const nv = cellsVarga(c, 9, co);
  const d9 = chartBox(ctx, { cells: nv.cells, lagnaSign: nv.lagna, title: 'Навамша', sub: 'D9' }, 'Навамша (D9)');

  const row = (p) => `<tr class="${p.id >= 9 ? 'outrow' : ''}">
    <td>${pn(p.id)}</td><td class="n">${dms(p.lon)} <span class="mut">${T.SIGN_ABBR[p.sign]}</span></td>
    <td>${esc(T.NAKSHATRAS[p.nak])}</td><td class="n">${p.pada}</td><td>${T.PLANET_RU[p.nakLord]}</td>
    <td>${T.PLANET_RU[T.SIGN_LORD[p.sign]]}</td><td class="n">${p.house}</td><td class="n">${p.bhava}</td>
    <td class="n">${p.speed < 0 ? '−' : '+'}${Math.abs(p.speed).toFixed(p.id === 1 ? 3 : 4).replace('.', ',')}</td>
    <td>${km[p.id] ? `<span class="tag kar" title="${esc(KARAKA_RU[km[p.id].role])}">${km[p.id].abbr}</span>` : ''}</td>
    <td>${[DIGNITY_RU[p.dignity] ? `<span class="tag ${DIGNITY_CLS[p.dignity] || ''}">${DIGNITY_RU[p.dignity]}</span>` : '', p.retro && p.id !== T.RAHU && p.id !== T.KETU ? '<span class="tag retro">ретро</span>' : '', STAT_TAG[TX.motionState(p.id, p.speed, ctx.st)] || '', p.combust ? '<span class="tag db">сожжена</span>' : ''].join(' ')}</td></tr>`;
  const lag = c.lagna;
  const positions = `<section class="card"><h3>Положения планет</h3><div class="scroll"><table class="tbl">
    <thead><tr><th>Планета</th><th>Долгота</th><th>Накшатра</th><th>Пада</th><th>Упр. накш.</th><th>Упр. знака</th><th>Дом</th><th>Бхава</th><th>Скорость, °/сут</th><th>Карака</th><th>Состояние</th></tr></thead>
    <tbody><tr class="asc"><td>Лагна <span class="ab">Asc</span></td><td class="n">${dms(lag.lon)} <span class="mut">${T.SIGN_ABBR[lag.sign]}</span></td><td>${esc(T.NAKSHATRAS[lag.nak])}</td><td class="n">${lag.pada}</td><td>${T.PLANET_RU[lag.nakLord]}</td><td>${T.PLANET_RU[T.SIGN_LORD[lag.sign]]}</td><td class="n">1</td><td class="n">—</td><td></td><td></td><td></td></tr>
    ${c.planets.map(row).join('')}${co.outer ? c.outer.map(row).join('') : ''}</tbody></table></div>
    ${co.outer ? '<p class="note">Уран, Нептун и Плутон (серые строки) только показаны: в даши, шадбалу, аштакаваргу, йоги, гочару и другие расчёты они не входят. «Карака» — чара-караки Джаймини (подробнее: вкладка «Силы» → «Прочее»).</p>' : ''}</section>`;

  const bh = c.madhya.map((m, i) => {
    const pl = c.planets.filter((p) => p.bhava === i + 1).map((p) => T.PLANET_ABBR[p.id]).join(' ');
    return `<tr><td class="n">${i + 1}</td><td class="n">${dms(c.bhavaStart[i])} <span class="mut">${T.SIGN_ABBR[A.signOf(c.bhavaStart[i])]}</span></td><td class="n">${dms(m)} <span class="mut">${T.SIGN_ABBR[A.signOf(m)]}</span></td><td>${T.PLANET_RU[A.houseLord(c, i + 1)]}</td><td>${pl || '<span class="mut">—</span>'}</td></tr>`;
  }).join('');
  const bhavas = `<section class="card"><h3>Бхавы</h3><p class="note">Мадхья — середина бхавы; начало — среднее между соседними мадхьями. Система домов: ${esc(({ O: 'Шрипати (Порфирий)', P: 'Плацидус', K: 'Кох', E: 'равные дома' })[ctx.st.houseSystem] || ctx.st.houseSystem)}.</p>
    <div class="scroll"><table class="tbl"><thead><tr><th>Бхава</th><th>Начало</th><th>Мадхья</th><th>Упр. знака</th><th>Планеты</th></tr></thead><tbody>${bh}</tbody></table></div></section>`;

  return `${info}<div class="charts">${d1}${d9}</div>${positions}${bhavas}`;
}

// ---------------------------------------------------------------- VARGAS
export function viewVargas(ctx) {
  const c = ctx.chart, v = tab(ctx, 'vargas', () => ({ n: 9 }));
  const co = chartOpts(ctx), km = karakaMap(c);
  const cur = cellsVarga(c, v.n, co);
  const main = v.n === 1
    ? chartBox(ctx, { cells: cellsD1(c, co), lagnaSign: c.lagnaSign, title: 'Раси', sub: 'D1' }, 'Раси (D1)')
    : chartBox(ctx, { cells: cur.cells, lagnaSign: cur.lagna, title: VARGA_RU[v.n], sub: 'D' + v.n }, `${VARGA_RU[v.n]} (D${v.n})`);
  const opts = A.VARGAS.map((n) => `<option value="${n}" ${n === v.n ? 'selected' : ''}>D${n} — ${VARGA_RU[n]}</option>`).join('');
  const thumbs = A.VARGAS.map((n) => {
    const x = cellsVarga(c, n, {});
    return `<button class="thumb ${n === v.n ? 'on' : ''}" data-act="pickVarga" data-n="${n}" title="${VARGA_RU[n]}">${drawChart('south', { cells: x.cells, lagnaSign: x.lagna, title: 'D' + n, size: 150 })}<span>D${n}</span></button>`;
  }).join('');
  const heads = A.VARGAS.map((n) => `<th>D${n}</th>`).join('');
  const rowOf = (label, f) => `<tr><td>${label}</td>${A.VARGAS.map((n) => `<td class="n">${T.SIGN_ABBR[f(n)]}</td>`).join('')}</tr>`;
  const matrix = `<table class="tbl compact"><thead><tr><th></th>${heads}</tr></thead><tbody>
    ${rowOf('Лагна', (n) => A.vargaSign(c.lagna.lon, n))}
    ${c.planets.map((p) => rowOf(pn(p.id), (n) => A.vargaSign(p.lon, n))).join('')}${co.outer ? c.outer.map((p) => rowOf(pn(p.id), (n) => A.vargaSign(p.lon, n))).join('') : ''}</tbody></table>`;
  const degRow = (label, lon) => `<tr><td>${label}</td>${A.VARGAS.map((n) => `<td class="n">${dmin(A.vargaDeg(lon, n))}</td>`).join('')}</tr>`;
  const degMatrix = `<table class="tbl compact"><thead><tr><th></th>${heads}</tr></thead><tbody>
    ${degRow('Лагна', c.lagna.lon)}${c.planets.map((p) => degRow(pn(p.id), p.lon)).join('')}${co.outer ? c.outer.map((p) => degRow(pn(p.id), p.lon)).join('') : ''}</tbody></table>`;
  // positions in the chosen varga
  const vc = A.vargaChart(c, v.n);
  const vrow = (label, sign, deg, extra = '') => `<tr class="${extra}"><td>${label}</td><td>${sn(sign)}</td><td class="n">${dmin(deg)}</td><td class="n">${((sign - vc.lagna + 12) % 12) + 1}</td></tr>`;
  const vrows = `<tr class="asc"><td>Лагна <span class="ab">Asc</span></td><td>${sn(vc.lagna)}</td><td class="n">${dmin(vc.lagnaDeg)}</td><td class="n">1</td></tr>`
    + c.planets.map((p) => vrow(pn(p.id) + (km[p.id] ? ` <span class="tag kar" title="${esc(KARAKA_RU[km[p.id].role])}">${km[p.id].abbr}</span>` : ''), vc.planets[p.id], vc.degs[p.id])).join('')
    + (co.outer ? c.outer.map((p, i) => vrow(pn(p.id), vc.outer[i], vc.outerDegs[i], 'outrow')).join('') : '');
  return `<section class="card"><div class="bar"><label>Варга <select data-change="varga">${opts}</select></label>
      <span class="mut">Классические варги Парашары; D5, D6, D8, D11 и D144 не реализованы.</span></div>
      <div class="charts">${main}</div></section>
    <section class="card"><h3>Положения в ${v.n === 1 ? 'Раси' : esc(VARGA_RU[v.n])} (D${v.n})</h3>
      <table class="tbl compact"><thead><tr><th>Планета</th><th>Знак</th><th>Градус в знаке</th><th>Дом от лагны варги</th></tr></thead><tbody>${vrows}</tbody></table>
      <p class="note">Градус в варге — место планеты внутри её доли знака, растянутое на весь знак: например, в Навамше каждые 3°20′ знака дают целый знак, поэтому 1° внутри доли — это 9° в варге. В D30 доли неравные (5°, 5°, 8°, 7°, 5°), в D2 — две по 15°. Именно градус показан в картах рядом с планетой.</p></section>
    <section class="card"><h3>Все варги</h3><div class="thumbs">${thumbs}</div></section>
    <section class="card"><h3>Знаки планет во всех варгах</h3><div class="scroll">${matrix}</div></section>
    <section class="card"><h3>Градусы планет во всех варгах</h3><div class="scroll">${degMatrix}</div></section>`;
}

// ---------------------------------------------------------------- DASHAS
function dashaSystem(ctx, which) {
  return cache(ctx, 'dasha_' + which, () => (which === 'yog' ? A.yogini(ctx.chart, ctx.st) : which === 'chara' ? J.charaDasha(ctx.chart, ctx.st) : A.vimshottari(ctx.chart, ctx.st)));
}
function dashaLabel(which, sys, lord) {
  return which === 'yog' ? esc(sys.label(lord)) : which === 'chara' ? sn(lord) : `${T.PLANET_RU[lord]} <span class="ab">${T.PLANET_ABBR[lord]}</span>`;
}
function charaNote(ctx, sys) {
  const c = ctx.chart;
  const rows = sys.first.map((x) => {
    const i = x.info;
    return `<tr><td>${sn(x.sign)}</td><td>${pn(i.lord)}${i.why ? ` <span class="mut">(${esc(i.why)})</span>` : ''}</td><td>${sn(i.lordSign)}</td><td class="n">${x.years}</td><td class="n mut">${12 - x.years}</td></tr>`;
  }).join('');
  return `<details class="more"><summary>Как посчитаны периоды знаков</summary>
    <div class="scroll"><table class="tbl compact"><thead><tr><th>Знак</th><th>Используемый управитель</th><th>Он стоит в</th><th>Лет (1-й круг)</th><th>Лет (2-й круг)</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">Порядок знаков: от лагны (${T.SIGN_RU[c.lagnaSign]}) ${sys.forward ? 'по зодиаку' : 'против зодиака'}${ctx.st.charaDir === 'lagna' ? ' (по чётности самой лагны)' : ' (по чётности 9-го знака от неё)'}. Период знака = число знаков от него до его управителя (считая оба; направление счёта зависит от самого знака) минус 1; управитель в своём знаке — 12 лет.
    У Скорпиона (Марс/Кету) и Водолея (Сатурн/Раху) берётся один из двух управителей по правилам П.В.Р. Нараси Рао. Второй круг: 12 минус период первого. Антардаши — 12 равных частей, начиная со знака махадаши. Всего ${sys.total} лет.${ctx.st.charaExaltAdj ? ' Включена поправка ±1 год за экзальтацию/падение управителя.' : ''}</p></details>`;
}
function pathKeys(sys, jd) {                                 // keys ("3", "3.1", ...) of the periods that contain jd
  const keys = []; let list = sys.maha, prefix = '';
  for (let l = 0; l < sys.levels.length; l++) {
    const i = list.findIndex((x) => jd >= x.start && jd < x.end);
    if (i < 0) break;
    const key = prefix + i; keys.push(key); prefix = key + '.'; list = sys.children(list[i]);
  }
  return keys;
}
export function viewDashas(ctx) {
  const c = ctx.chart, tz = c.input.tzEast;
  const v = tab(ctx, 'dashas', () => ({ sys: 'vim', open: null, date: null, time: '12:00' }));
  const sys = dashaSystem(ctx, v.sys);
  if (!v.date) {
    const n = nowLocal(tz), nowJD = jdNow();
    if (nowJD >= sys.maha[0].start && nowJD < sys.maha[sys.maha.length - 1].end) { v.date = isoDate(n.y, n.m, n.d); v.time = fmtHM(n.h, false); }
    else { v.date = isoDate(c.input.year, c.input.month, c.input.day); v.time = fmtHM(c.input.time, false); v.outOfRange = true; }
  }
  const d = parseIsoDate(v.date) || { y: 2000, m: 1, d: 1 };
  const viewJD = swe.julday(d.y, d.m, d.d, (parseHM(v.time) || 0) - tz);
  const pk = pathKeys(sys, viewJD);
  if (!v.open) v.open = new Set(pk.slice(0, 2));
  const nowSet = new Set(pk);
  const lastLevel = sys.levels.length - 1;
  const fmt = (jd, lvl) => fmtJD(jd, tz, lvl >= 3);

  const rows = [];
  (function walk(list, depth, prefix) {
    list.forEach((p, i) => {
      const key = prefix + i, open = v.open.has(key), kids = depth < lastLevel;
      rows.push(`<div class="drow l${depth} ${nowSet.has(key) ? 'now' : ''}" style="--d:${depth}">
        <span class="dl">${kids ? `<button class="tg ${open ? 'open' : ''}" data-act="dtoggle" data-key="${key}" aria-expanded="${open}" aria-label="Раскрыть"></button>` : '<span class="tg-sp"></span>'}<span class="lv">${esc(sys.levels[depth])}</span> ${dashaLabel(v.sys, sys, p.lord)}</span>
        <span class="n">${fmt(p.start, depth)}</span><span class="n">${fmt(p.end, depth)}</span><span class="n mut">${fmtDur(p.end - p.start, ctx.st.yearLen)}</span></div>`);
      if (open && kids) walk(sys.children(p), depth + 1, key + '.');
    });
  })(sys.maha, 0, '');

  const chips = pk.map((k, lvl) => {
    let list = sys.maha, prefix = '', p;
    for (const part of k.split('.')) { p = list[+part]; list = sys.children(p); }
    return `<span class="chip">${dashaLabel(v.sys, sys, p.lord)}</span>`;
  }).join('<span class="sep">›</span>');

  return `<section class="card">
    <div class="bar">
      <div class="seg" role="group" aria-label="Система даш">
        <button data-act="dsys" data-s="vim" class="${v.sys === 'vim' ? 'on' : ''}">Вимшоттари</button>
        <button data-act="dsys" data-s="yog" class="${v.sys === 'yog' ? 'on' : ''}">Йогини</button>
        <button data-act="dsys" data-s="chara" class="${v.sys === 'chara' ? 'on' : ''}">Чара (Джаймини)</button>
      </div>
      <label>Дата <input type="date" data-change="ddate" value="${esc(v.date)}"></label>
      <label>Время <input type="text" size="7" data-change="dtime" value="${esc(v.time)}"></label>
      <button class="btn" data-act="dnow">Сегодня</button>
      <button class="btn" data-act="dbirth">Рождение</button>
    </div>
    <p class="path">${chips || '<span class="mut">Дата вне диапазона даш</span>'}</p>${v.outOfRange ? '<p class="note">Сегодняшняя дата вне 120-летнего цикла этой карты, поэтому показан момент рождения.</p>' : ''}
    <p class="note">${v.sys === 'chara' ? `Чара-даша — знаковая система Джаймини, всего ${sys.total} лет.` : `Баланс первой махадаши при рождении: ${sys.balanceYears.toFixed(3)} г.`} Год даш = ${ctx.st.yearLen} дн. Даты в часовом поясе рождения (${fmtTz(tz)}).
      Не реализованы: Нараяна, Калачакра, Аштоттари, Дриг и прочие даши.</p>${v.sys === 'chara' ? charaNote(ctx, sys) : ''}
    <div class="dhead"><span>Период</span><span>Начало</span><span>Конец</span><span>Длительность</span></div>
    <div class="dtree">${rows.join('')}</div>
  </section>`;
}

// ---------------------------------------------------------------- STRENGTH
export function viewStrength(ctx) {
  const v = tab(ctx, 'strength', () => ({ sub: 'shad' }));
  const subs = [['shad', 'Шадбала'], ['av', 'Аштакаварга'], ['misc', 'Прочее']];
  const seg = `<div class="seg" role="group">${subs.map(([k, l]) => `<button data-act="ssub" data-s="${k}" class="${v.sub === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const body = ({ shad: strengthShad, av: strengthAV, misc: strengthMisc }[v.sub] || strengthShad)(ctx);
  return `<div class="bar sub">${seg}</div>${body}`;
}

function strengthShad(ctx) {
  const sb = cache(ctx, 'shad', () => shadbala(ctx.chart, ctx.st)), P = sb.planets;
  const f = (x, d = 1) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(d);
  const ids = [0, 1, 2, 3, 4, 5, 6];
  const main = ids.map((id) => {
    const o = P[id], pct = Math.min(100, (o.ratio / 2) * 100);
    return `<tr><td>${pn(id)}</td><td class="n">${f(o.sthana.total)}</td><td class="n">${f(o.dig)}</td><td class="n">${f(o.kala.total)}</td><td class="n">${f(o.cheshta)}</td><td class="n">${f(o.naisargika)}</td><td class="n">${f(o.drik)}</td>
      <td class="n strong">${f(o.total)}</td><td class="n">${f(o.rupas, 2)}</td><td class="n mut">${f(o.required / 60, 2)}</td>
      <td><div class="meter"><div class="trk"><span class="m ${o.ratio >= 1 ? 'ok' : 'low'}" style="width:${pct}%"></span><i></i></div><b>${f(o.ratio, 2)}</b></div></td><td class="n">${o.rank}</td>
      <td class="n">${f(o.ishta)} / ${f(o.kashta)}</td></tr>`;
  }).join('');
  const rowD = (label, get, cls = '') => `<tr class="${cls}"><td>${label}</td>${ids.map((id) => `<td class="n">${f(get(P[id]))}</td>`).join('')}</tr>`;
  const detail = `<table class="tbl compact"><thead><tr><th>Составляющая (вирупы)</th>${ids.map((i) => `<th>${T.PLANET_ABBR[i]}</th>`).join('')}</tr></thead><tbody>
    ${rowD('Уччха', (o) => o.sthana.uchcha)}${rowD('Саптаваргаджа', (o) => o.sthana.sapta)}${rowD('Оджаюгма', (o) => o.sthana.ojayugma)}${rowD('Кендради', (o) => o.sthana.kendra)}${rowD('Дрекканы', (o) => o.sthana.drekkana)}
    ${rowD('Стхана бала', (o) => o.sthana.total, 'sum')}
    ${rowD('Диг бала', (o) => o.dig, 'sum')}
    ${rowD('Натонната', (o) => o.kala.natonnata)}${rowD('Пакша', (o) => o.kala.paksha)}${rowD('Трибхага', (o) => o.kala.tribhaga)}${rowD('Абда', (o) => o.kala.abda)}${rowD('Маса', (o) => o.kala.masa)}${rowD('Вара', (o) => o.kala.vara)}${rowD('Хора', (o) => o.kala.hora)}${rowD('Аяна', (o) => o.kala.ayana)}
    ${rowD('Кала бала', (o) => o.kala.total, 'sum')}
    ${rowD('Чешта бала', (o) => o.cheshta, 'sum')}${rowD('Найсаргика бала', (o) => o.naisargika, 'sum')}${rowD('Дрик бала', (o) => o.drik, 'sum')}
    ${rowD('Итого', (o) => o.total, 'sum total')}</tbody></table>`;
  const i = sb.info;
  return `<section class="card"><h3>Шадбала</h3>
    <div class="scroll"><table class="tbl"><thead><tr><th>Планета</th><th>Стхана</th><th>Диг</th><th>Кала</th><th>Чешта</th><th>Найсарг.</th><th>Дрик</th><th>Итого (вир.)</th><th>Рупы</th><th>Нужно</th><th>Отношение к норме</th><th>Ранг</th><th>Ишта / Кашта</th></tr></thead><tbody>${main}</tbody></table></div>
    <p class="note">Классическая схема БПХС. Планета считается достаточно сильной при отношении ≥ 1 (норма: Солнце 6,5 · Луна 6 · Марс 5 · Меркурий 7 · Юпитер 6,5 · Венера 5,5 · Сатурн 5 рупы).
    Юддха-бала (планетарная война) не учитывается. Правила, у которых в традиции есть несколько вариантов (владыки года/месяца, значения особых аспектов, Чешта), реализованы в одной из принятых форм,
    поэтому цифры могут слегка отличаться от Jagannatha Hora и других программ. Владыка года: ${i.abdaLord != null ? T.PLANET_RU[i.abdaLord] : '—'}, месяца: ${i.masaLord != null ? T.PLANET_RU[i.masaLord] : '—'}, дня: ${T.PLANET_RU[i.varaLord]}, часа: ${i.horaLord != null ? T.PLANET_RU[i.horaLord] : '—'}.</p></section>
    <section class="card"><h3>Составляющие</h3><div class="scroll">${detail}</div></section>`;
}

function strengthAV(ctx) {
  const c = ctx.chart, av = cache(ctx, 'av', () => A.ashtakavarga(c));
  const heads = T.SIGN_ABBR.map((s, i) => `<th class="${i === c.lagnaSign ? 'lag' : ''}">${s}</th>`).join('');
  const hrow = T.SIGN_ABBR.map((_, i) => `<td class="n mut ${i === c.lagnaSign ? 'lag' : ''}">${((i - c.lagnaSign + 12) % 12) + 1}</td>`).join('');
  const rows = [0, 1, 2, 3, 4, 5, 6].map((id) => {
    const r = av.bav[id], total = r.reduce((a, b) => a + b, 0);
    return `<tr><td>${pn(id)}</td>${r.map((x, i) => `<td class="n ${i === c.lagnaSign ? 'lag' : ''} ${x >= 5 ? 'hi' : x <= 2 ? 'lo' : ''}">${x}</td>`).join('')}<td class="n strong">${total}</td></tr>`;
  }).join('');
  const sav = `<tr class="sum"><td>Сарва (SAV)</td>${av.sav.map((x, i) => `<td class="n ${i === c.lagnaSign ? 'lag' : ''} ${x >= 30 ? 'hi' : x < 25 ? 'lo' : ''}">${x}</td>`).join('')}<td class="n strong">${av.sav.reduce((a, b) => a + b, 0)}</td></tr>`;
  const cells = Array.from({ length: 12 }, (_, s) => [{ t: String(av.sav[s]), c: s === c.lagnaSign ? 'asc' : '' }]);
  return `<section class="card"><h3>Аштакаварга</h3>
    <div class="scroll"><table class="tbl compact"><thead><tr><th>Знак</th>${heads}<th>Σ</th></tr></thead><tbody>
      <tr><td class="mut">Дом от лагны</td>${hrow}<td></td></tr>${rows}${sav}</tbody></table></div>
    <p class="note">Бхинна-аштакаварга по таблицам БПХС (суммы: Солнце 48, Луна 49, Марс 39, Меркурий 54, Юпитер 56, Венера 52, Сатурн 39; всего 337). Выделено: ≥ 5 и ≤ 2 бинду у планет, ≥ 30 и &lt; 25 в SAV.</p>
    <div class="charts">${chartBox(ctx, { cells, lagnaSign: c.lagnaSign, title: 'Сарва', sub: 'SAV' }, 'Сарва-аштакаварга')}</div></section>`;
}

function strengthMisc(ctx) {
  const c = ctx.chart;
  const lag = cache(ctx, 'speclag', () => A.specialLagnas(c, ctx.st));
  const km = karakaMap(c);
  const kar = c.karakas.map((k) => { const p = c.planets[k.planet]; return `<tr><td><span class="tag kar">${KARAKA_ABBR[k.role]}</span> ${esc(KARAKA_RU[k.role])}</td><td>${pn(k.planet)}</td><td class="n">${dmin(k.d)}${k.planet === T.RAHU ? ' <span class="mut" title="Раху считается от конца знака">(30° − ' + dmin(p.deg) + ')</span>' : ''}</td><td>${sn(p.sign)}</td><td class="n">${p.house}</td><td class="mut">${esc(KARAKA_MEANING[k.role])}</td></tr>`; }).join('');
  const NAT = [[T.SUN, 'душа, отец, власть и государство, здоровье, авторитет'], [T.MOON, 'ум и чувства, мать, душевный покой, народ'], [T.MARS, 'братья, энергия, смелость, земля и недвижимость'],
    [T.MERCURY, 'речь, интеллект, торговля, обучение, друзья'], [T.JUPITER, 'дети, учителя, мудрость, достаток, дхарма'], [T.VENUS, 'супруг(а), любовь, комфорт, искусство, транспорт'],
    [T.SATURN, 'долголетие, труд, служение, трудности, подчинённые'], [T.RAHU, 'чужое и иностранное, необычное, одержимость, технологии'], [T.KETU, 'отрешённость, мокша, интуиция, потери']];
  const nat = NAT.map(([id, m]) => { const p = c.planets[id]; return `<tr><td>${pn(id)}</td><td>${sn(p.sign)}</td><td class="n">${p.house}</td><td class="mut">${esc(m)}</td></tr>`; }).join('');
  const sl = [['Бхава-лагна', lag.bhava], ['Хора-лагна', lag.hora], ['Гхати-лагна', lag.ghati], ['Шри-лагна', lag.sri]].map(([l, x]) => x == null ? '' : `<tr><td>${l}</td><td class="n">${dms(x)}</td><td>${sn(A.signOf(x))}</td></tr>`).join('')
    + `<tr><td>Инду-лагна</td><td class="n">—</td><td>${sn(lag.induSign)}</td></tr>`;
  return `<section class="card"><h3>Чара-караки (Джаймини)</h3><div class="scroll"><table class="tbl"><thead><tr><th>Карака</th><th>Планета</th><th>Градус в знаке</th><th>Знак</th><th>Дом</th><th>Значение</th></tr></thead><tbody>${kar}</tbody></table></div>
      <p class="note">Планеты ранжируются по градусу внутри знака: у кого больше — тот Атмакарака, дальше по убыванию. Схема: ${ctx.st.karakas} карак (меняется в настройках). Раху считается от конца знака. Метки AK, AmK, BK… показаны в картах и таблицах положений (отключаются в настройках: «Метки карак в картах»).</p></section>
    <section class="card"><h3>Натуральные (стхира) караки</h3><table class="tbl compact"><thead><tr><th>Планета</th><th>Знак</th><th>Дом</th><th>Обычно связывают с</th></tr></thead><tbody>${nat}</tbody></table>
      <p class="note">Краткая общая сводка: в разных школах списки значений различаются, это лишь ориентир. Уран, Нептун и Плутон в традиционных списках карак не участвуют.</p></section>
    <div class="cols"><section class="card"><h3>Особые лагны</h3><table class="tbl"><thead><tr><th>Лагна</th><th>Долгота</th><th>Знак</th></tr></thead><tbody>${sl}</tbody></table>
      <p class="note">Считаются от восхода Солнца в месте рождения (${lag.sunrise ? fmtClock(lag.sunrise, c.input.tzEast, true) : '—'}).</p></section></div>`;
}

// ---------------------------------------------------------------- PANCHANGA
function endStr(jd, tz, baseDay) {
  const full = fmtJD(jd, tz, true), sameDay = full.slice(0, 10) === baseDay;
  return sameDay ? full.slice(11) : full.slice(0, 5) + ' ' + full.slice(11);
}
export function viewPanchanga(ctx) {
  const b = ctx.birth;
  const v = tab(ctx, 'panchanga', () => {
    const n = nowLocal(b.tzEast);
    return { date: isoDate(n.y, n.m, n.d), time: '12:00:00', lat: String(+b.lat.toFixed(4)), lon: String(+b.lonEast.toFixed(4)), tz: fmtTz(b.tzEast), month: true };
  });
  const d = parseIsoDate(v.date), lat = parseCoord(v.lat, 'lat'), lon = parseCoord(v.lon, 'lon'), tz = parseTz(v.tz), hh = parseHM(v.time);
  if (!d || [lat, lon, tz, hh].some(Number.isNaN)) return `<section class="card"><p class="err">Проверьте дату, время, координаты и часовой пояс.</p>${panControls(v)}</section>`;
  const jd = swe.julday(d.y, d.m, d.d, hh - tz);
  const pg = A.panchanga(jd, lon, lat, tz, ctx.st);
  const day = fmtJD(jd, tz).slice(0, 10);
  const seg = (s) => (s ? `${fmtClock(s.start, tz)} – ${fmtClock(s.end, tz)}` : '—');
  const card = `<section class="card"><dl class="kv big">
      <div><dt>Вара</dt><dd>${esc(pg.varaName)}</dd></div>
      <div><dt>Титхи</dt><dd>${pg.tithi.paksha === 'Shukla' ? 'Шукла' : 'Кришна'} ${esc(pg.tithi.name)} <span class="mut">${fmtJD(pg.tithi.start, tz, true).slice(0, 5)} ${fmtClock(pg.tithi.start, tz)} → ${endStr(pg.tithi.end, tz, day)}</span></dd></div>
      <div><dt>Накшатра</dt><dd>${esc(pg.nakshatra.name)} <span class="mut">управитель ${T.PLANET_RU[pg.nakshatra.lord]} · до ${endStr(pg.nakshatra.end, tz, day)}</span></dd></div>
      <div><dt>Йога</dt><dd>${esc(pg.yoga.name)} <span class="mut">до ${endStr(pg.yoga.end, tz, day)}</span></dd></div>
      <div><dt>Карана</dt><dd>${esc(pg.karana.name)} <span class="mut">до ${endStr(pg.karana.end, tz, day)}</span></dd></div>
      <div><dt>Восход · закат</dt><dd>${fmtClock(pg.sunrise, tz, true)} · ${fmtClock(pg.sunset, tz, true)}</dd></div>
      <div><dt>Раху-кала</dt><dd>${seg(pg.segments.rahu)}</dd></div>
      <div><dt>Ямаганда</dt><dd>${seg(pg.segments.yamaganda)}</dd></div>
      <div><dt>Гулика-кала</dt><dd>${seg(pg.segments.gulika)}</dd></div>
      <div><dt>Хора сейчас</dt><dd>${pg.horaLord != null ? T.PLANET_RU[pg.horaLord] : '—'}</dd></div>
    </dl><p class="note">Начало и конец интервалов (Раху, Ямаганда, Гулика) — восьмые доли дня от восхода до заката. Гулика даётся как начало её интервала (не Манди).
      Восход: ${ctx.st.sunriseCenter ? 'центр диска, без рефракции' : 'верхний край диска с рефракцией'}.</p></section>`;

  let month = '';
  if (v.month) {
    const dim = new Date(Date.UTC(d.y, d.m, 0)).getUTCDate();
    const rows = [];
    for (let k = 1; k <= dim; k++) {
      const noon = swe.julday(d.y, d.m, k, 12 - tz);
      const sr = A.sunriseBefore(noon, lon, lat, ctx.st);
      const t0 = sr ? sr.rise + 1 / 86400 : noon;
      const p = A.panchanga(t0, lon, lat, tz, ctx.st);
      const dayStr = fmtJD(noon, tz).slice(0, 10);
      rows.push(`<tr class="${k === d.d ? 'now' : ''}"><td class="n">${pad(k)}</td><td>${WD_SHORT[p.vara]}</td>
        <td>${p.tithi.paksha === 'Shukla' ? 'Ш' : 'К'} ${esc(p.tithi.name)} <span class="mut">${endStr(p.tithi.end, tz, dayStr)}</span></td>
        <td>${esc(p.nakshatra.name)} <span class="mut">${endStr(p.nakshatra.end, tz, dayStr)}</span></td>
        <td>${esc(p.yoga.name)} <span class="mut">${endStr(p.yoga.end, tz, dayStr)}</span></td>
        <td>${esc(p.karana.name)}</td><td class="n">${fmtClock(p.sunrise, tz)}</td></tr>`);
    }
    month = `<section class="card"><h3>Месяц ${pad(d.m)}.${d.y}</h3><p class="note">Значения на момент восхода; рядом указано время окончания. Ш/К — Шукла/Кришна пакша.</p>
      <div class="scroll"><table class="tbl compact"><thead><tr><th>Дата</th><th>День</th><th>Титхи</th><th>Накшатра</th><th>Йога</th><th>Карана</th><th>Восход</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></section>`;
  }
  return `<section class="card">${panControls(v)}</section>${card}${month}`;
}
function panControls(v) {
  return `<div class="bar wrap">
    <button class="btn" data-act="pstep" data-k="-1" aria-label="Предыдущий день">◀</button>
    <label>Дата <input type="date" data-pan="date" value="${esc(v.date)}"></label>
    <button class="btn" data-act="pstep" data-k="1" aria-label="Следующий день">▶</button>
    <label>Время <input type="text" size="8" data-pan="time" value="${esc(v.time)}"></label>
    <label>Широта <input type="text" size="9" data-pan="lat" value="${esc(v.lat)}"></label>
    <label>Долгота <input type="text" size="9" data-pan="lon" value="${esc(v.lon)}"></label>
    <label>Пояс <input type="text" size="6" data-pan="tz" value="${esc(v.tz)}"></label>
    <label class="chk"><input type="checkbox" data-pan="month" ${v.month ? 'checked' : ''}> месяц</label>
    <button class="btn" data-act="ptoday">Сегодня</button>
    <button class="btn" data-act="pbirth">Место рождения</button></div>`;
}

// ---------------------------------------------------------------- ABOUT
export function aboutHTML() {
  return `<h2>О программе</h2>
  <p>Локальное браузерное приложение для расчётов в ведической астрологии. Работает целиком на вашем компьютере: ничего не отправляется в сеть, карты читаются прямо из выбранной папки с файлами <code>.jhd</code>.</p>
  <h3>Что есть</h3>
  <ul><li>Чтение и запись файлов Jagannatha Hora (<code>.jhd</code>, старый и новый формат), поиск по базе, вложенные папки.</li>
  <li>Атлас: около 140 тысяч населённых пунктов мира (от 1000 жителей), поиск по русскому и латинскому названию; часовой пояс и летнее время подставляются по дате рождения.</li>
  <li>Раси и Навамша в южном и северном стиле, положения, накшатры, достоинства, бхавы; 16 варг Парашары. В картах (Раси и все варги) рядом с планетой — её градус в этом знаке; в варгах — градус внутри варги, плюс таблицы «Положения в варге» и «Градусы во всех варгах».</li>
  <li>Уран, Нептун и Плутон: сидерические положения, ретро, скорость, дом, знаки и градусы в варгах, транзиты, стоянки и периоды ретроградности. Они выводятся серым курсивом и никуда больше не входят: ни в даши, ни в Шадбалу, аштакаваргу, йоги, гочару и арудхи. Включаются и выключаются в настройках.</li>
  <li>Караки: метки чара-карак (AK, AmK, BK, MK, PiK, PK, GK, DK) оранжевым в картах и колонкой в таблице положений; на вкладке «Силы» → «Прочее» — карточка с градусами, домами и значением каждой караки и краткая сводка натуральных (стхира) карак.</li>
  <li>Даши: Вимшоттари (5 уровней), Йогини, Чара-даша Джаймини (5 уровней).</li>
  <li>Шадбала, аштакаварга, особые лагны, чара-караки.</li>
  <li>Йоги: более 70 видов классических сочетаний (раджа, дхана, махапуруша, лунные и солнечные, паривартана, набхаса, доши и др.) с указанием условия, по которому найдено.</li>
  <li>Арудхи: бхава-арудхи (AL, A2–A11, UL), арудхи планет, Карака-амша, воздействия на арудхи по раши-драшти Джаймини.</li>
  <li>Транзиты: положение на любую дату, гочара с ведхой, соединения с натальными точками, календарь входов в знаки и стоянок, Сади Сати, Кантака и Аштама на всю жизнь.</li>
  <li>Движение планет: скорость, ретро и стоянки (дата, время и градус стоянки), пометка «стационарна»; с какого по какое время планета в знаке, накшатре и паде (на любую дату); списки входов и выходов по знакам, накшатрам и падам и периоды ретроградности за любой отрезок до 40 лет.</li>
  <li>Варшапхала: соляр, мунтха, аспекты Таджики с иттхасалой/ишрафой, кандидаты в владыки года, Мудда-даша, таблица по годам.</li>
  <li>Солнечные и лунные затмения за любой период: тип, величина, сидерическая позиция, накшатра, дома от лагны и Луны, затронутые натальные точки, видимость в выбранном месте.</li>
  <li>Панчанга дня и месяца.</li>
  <li>Читалка PDF (переключатель «Карты | PDF» слева): своя папка с вложенными папками, поиск и сортировка, запоминание папки и места в каждом файле; масштаб 10–800 % (Ctrl + колесо, щипок, «По ширине», «Целиком»), оглавление, поиск по тексту, ссылки внутри документа, ночной режим, ввод пароля.</li>
  <li>Заметки в читалке: выделите текст — подсветка или подчёркивание с комментарием; метка с комментарием в любом месте страницы (кнопка «Заметка»); список заметок с фильтром, экспорт в Markdown и JSON, импорт JSON.</li></ul>
  <h3>Чего нет</h3>
  <ul><li>Это не копия Jagannatha Hora: нет Нараяна/Калачакра/Аштоттари-даш, Бхава-балы, Юддха-балы, Сахамов, определения владыки года по Панча-варгия-бале, прочих таджика-йог, прашны, мухурты, подбора пар, печати.</li>
  <li>Градус планеты в варге считается по моему определению: положение внутри доли знака, растянутое на весь знак (в D30 доли неравные). С Jagannatha Hora эти числа не сверялись — в самой JHora они могут отличаться. Список натуральных карак — краткая общая сводка, в разных школах он различается.</li>
  <li>«Стационарна» — условное правило программы (скорость меньше 10 % средней), а не общепринятый стандарт; точные моменты стоянок даны отдельно. Периоды в знаках и накшатрах считаются по сидерической долготе с аянамшей из настроек, а у ретроградной планеты один и тот же знак может быть несколько отдельных периодов.</li>
  <li>Значения Шадбалы, йог и Чара-даши считаются по описанным в книгах правилам; там, где у традиции несколько вариантов, выбран один (он указан в интерфейсе). Цифры могут отличаться от Jagannatha Hora и других программ.</li>
  <li>Летнее время в <code>.jhd</code> читается по строкам 9 и 10 (стандартный пояс и пояс с учётом летнего времени) — это выведено из одного присланного файла и в самой Jagannatha Hora не проверялось; поэтому в окне данных пояс сверяется с атласом и при расхождении предлагается подставить значение из атласа. Новая карта больше не подставляет Москву: место нужно выбрать в атласе или ввести координаты.</li>
  <li>Атлас содержит места от 1000 жителей; если места нет, введите координаты вручную. Часовой пояс берётся из базы вашего браузера: для дат до 1900 года и для спорных территорий его нужно проверять.</li>
  <li>Заметки к PDF хранятся не внутри PDF (файл не меняется), а в файле <code>имя.pdf.notes.json</code> рядом с ним, если папка открыта с правом записи, и в копии в этом браузере; в другом PDF-просмотрщике они видны не будут. Если папка открыта в режиме «только чтение», заметки живут только в браузере — экспортируйте их.</li>
  <li>В читалке нет: произвольных текстовых блоков и рисования по странице, поворота страниц, печати, форм и JavaScript в PDF, подписей. Шрифты стандартных 14 и CJK-шрифты без встраивания заменяются системными, ICC-профили не применяются.</li>
  <li>Запись <code>.jhd</code> проверена на разборе собственных файлов, но не открывалась в самой Jagannatha Hora — для важных карт сначала сделайте копию папки.</li></ul>
  <h3>Эфемериды, данные и лицензии</h3>
  <p>Положения считаются библиотекой Swiss Ephemeris (© Astrodienst AG), скомпилированной в WebAssembly (пакет sweph-wasm), в режиме Moshier без файлов эфемерид. Для практической астрологии точность достаточна (доли угловой минуты); на очень далёких эпохах она ниже. Сверка с положениями, сохранёнными в старых файлах JHora, дала расхождения до 0,03°. Swiss Ephemeris распространяется по лицензии AGPL-3.0, поэтому эта программа, содержащая её, тоже подчиняется AGPL-3.0 при передаче другим людям: код приложения в этом файле не минифицирован, исходники Swiss Ephemeris — github.com/aloistr/swisseph, обёртки — github.com/ptprashanttripathi/sweph-wasm.</p>
  <p>Атлас городов: данные GeoNames (geonames.org, файл cities1000), лицензия CC BY 4.0. Названия на русском взяты из альтернативных названий GeoNames, поэтому полны не для всех мест. Смещения часовых поясов вычисляет сам браузер по базе IANA Time Zone Database.</p>
  <p>Читалка PDF: pdf.js (Mozilla Foundation), лицензия Apache-2.0, версия 5.7.284, встроена в этот файл и распаковывается при первом открытии PDF. Для сканов встроены декодеры JBIG2 (из PDFium, BSD-3-Clause) и JPEG 2000 (OpenJPEG, BSD-2-Clause). PDF не покидает компьютер.</p>
  <p>Jagannatha Hora — программа П.В.Р. Нараси Рао; здесь использован только формат её файлов данных, код и графика не копировались.</p>`;
}

// ---------------------------------------------------------------- registry
export const VIEWS = {
  chart: viewChart, vargas: viewVargas, dashas: viewDashas, strength: viewStrength, panchanga: viewPanchanga,
  yogas: X.viewYogas, arudhas: X.viewArudhas, transits: X.viewTransits, motion: MO.viewMotion, varsha: X.viewVarsha, eclipses: X.viewEclipses,
};

// actions (called from main.js; return true to re-render)
export const actions = {
  pickVarga(ctx, el) { tab(ctx, 'vargas', () => ({})).n = +el.dataset.n; return true; },
  dsys(ctx, el) { const v = tab(ctx, 'dashas', () => ({})); v.sys = el.dataset.s; v.open = null; return true; },
  dtoggle(ctx, el) { const v = ctx.v.dashas; const k = el.dataset.key; v.open.has(k) ? v.open.delete(k) : v.open.add(k); return true; },
  dnow(ctx) { const v = ctx.v.dashas; const n = nowLocal(ctx.birth.tzEast); v.date = isoDate(n.y, n.m, n.d); v.time = fmtHM(n.h, false); v.open = null; return true; },
  dbirth(ctx) { const v = ctx.v.dashas, b = ctx.birth; v.date = isoDate(b.year, b.month, b.day); v.time = fmtHM(b.time, false); v.open = null; return true; },
  ssub(ctx, el) { tab(ctx, 'strength', () => ({})).sub = el.dataset.s; return true; },
  pstep(ctx, el) {
    const v = ctx.v.panchanga, d = parseIsoDate(v.date); if (!d) return false;
    const dt = new Date(Date.UTC(d.y, d.m - 1, d.d + +el.dataset.k)); v.date = isoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); return true;
  },
  ptoday(ctx) { const v = ctx.v.panchanga; const tz = parseTz(v.tz); const n = nowLocal(Number.isNaN(tz) ? 0 : tz); v.date = isoDate(n.y, n.m, n.d); v.time = fmtHM(n.h); return true; },
  pbirth(ctx) { const v = ctx.v.panchanga, b = ctx.birth; Object.assign(v, { date: isoDate(b.year, b.month, b.day), time: fmtHM(b.time), lat: String(+b.lat.toFixed(4)), lon: String(+b.lonEast.toFixed(4)), tz: fmtTz(b.tzEast + (b.dst || 0)) }); return true; },
  ...X.actions, ...MO.actions,
};
// text/select inputs: data-change="name" and data-pan / data-tr / ... groups
export const changes = {
  varga(ctx, el) { tab(ctx, 'vargas', () => ({})).n = +el.value; return true; },
  ddate(ctx, el) { const v = ctx.v.dashas; v.date = el.value; v.open = null; return true; },
  dtime(ctx, el) { const v = ctx.v.dashas; v.time = el.value; v.open = null; return true; },
  ...X.changes, ...MO.changes,
};
export const groups = { pan: 'panchanga', ...X.groups, ...MO.groups };
