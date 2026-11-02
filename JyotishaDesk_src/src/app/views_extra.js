// Tabs added in the second stage: Yogas, Arudhas (Jaimini), Transits (now / calendar / Sade Sati), Varshaphala, Eclipses.
import * as swe from '../swe.js';
import * as T from '../tables.js';
import * as A from '../astro.js';
import * as J from '../jaimini.js';
import * as TX from '../transitx.js';
import * as V from '../varsha.js';
import * as E from '../eclipse.js';
import { allYogas, GROUP_ORDER } from '../yogas2.js';
import { esc, pad, fmtJD, fmtClock, fmtTz, fmtDur, parseHM, parseTz, parseCoord, fmtHM } from './util.js';
import { pn, sn, dms, cache, jdNow, nowLocal, isoDate, parseIsoDate, tab, addDays, addMonths, cellsD1, chartBox, seg } from './viewlib.js';

const { SUN, MOON, MARS, MERCURY, JUPITER, VENUS, SATURN, RAHU, KETU } = T;
const ordinal = (n) => `${n}-й`;
// heavy computations: when the result is not cached yet and the job is big, show a placeholder first and compute on the next tick
export function deferred(ctx, key, big, fn) {
  if (key in ctx.cache) return { value: ctx.cache[key] };
  if (big && !ctx.cache['_pend:' + key]) {
    ctx.cache['_pend:' + key] = true;
    setTimeout(() => { if (ctx.rerender) ctx.rerender(); }, 40);
    return { pending: true };
  }
  delete ctx.cache['_pend:' + key];
  return { value: (ctx.cache[key] = fn()) };
}
export const busy = (what) => `<section class="card"><p class="note busy">Считаю ${what}… подождите несколько секунд.</p></section>`;
const fromTo = (a, b) => `${fmtJD(a, 0)} – ${fmtJD(b, 0)}`;
const ageAt = (ctx, jd) => ((jd - ctx.chart.jd) / 365.2425);
const fmtAge = (x) => (x < 0 ? '—' : x.toFixed(1).replace('.', ','));
const localOf = (jd, tz) => fmtJD(jd, tz, true);

// ================================================================ YOGAS
const GROUP_HINT = {
  'Раджа': 'Сочетания управителей кендр и триконов, йогакарака, Виппарита-раджа, Нича-бханга.',
  'Дхана': 'Связи управителей 1, 2, 5, 9 и 11 домов.',
  'Махапуруша': 'Пять великих йог: Марс, Меркурий, Юпитер, Венера, Сатурн в своём знаке или экзальтации в кендре.',
  'Чандра': 'Йоги от положения Луны: Гаджакесари, Сунапха, Анапха, Дурудхара, Кемадрума, Адхи и др.',
  'Сурья': 'Йоги от положения Солнца (Луна не считается): Веси, Вози, Убхаячари, Будхаадитья.',
  'Паривартана': 'Обмен знаками: Маха (обычные дома), Кхала (через 3-й), Дайнья (через 6, 8, 12).',
  'Набхаса': 'Йоги по распределению семи планет (Солнце–Сатурн): знаки, дома и их число.',
  'Прочие': 'Лакшми, Сарасвати, Чатуссагара, Амала, Вароттама, Картари и др.',
  'Доши': 'Неблагоприятные сочетания (традиционно считаются трудными), без учёта отмен.',
};
export function viewYogas(ctx) {
  const ys = cache(ctx, 'yogas2', () => allYogas(ctx.chart));
  const v = tab(ctx, 'yogas', () => ({ off: {} }));
  const counts = {}; ys.forEach((y) => { counts[y.group] = (counts[y.group] || 0) + 1; });
  const chips = GROUP_ORDER.map((g) => `<button class="chipbtn ${v.off[g] ? '' : 'on'}" data-act="ygroup" data-g="${esc(g)}" aria-pressed="${!v.off[g]}">${esc(g)} <b>${counts[g] || 0}</b></button>`).join('');
  const body = GROUP_ORDER.filter((g) => counts[g] && !v.off[g]).map((g) => {
    const items = ys.filter((y) => y.group === g).map((y) => `<li><b>${esc(y.name)}</b><span>${y.meaning ? `<em>${esc(y.meaning)}</em><br>` : ''}${esc(y.why)}</span></li>`).join('');
    return `<section class="card"><h3>${esc(g)} <small class="mut">${counts[g]}</small></h3><p class="note" style="margin-top:-.3rem">${esc(GROUP_HINT[g] || '')}</p><ul class="yogas">${items}</ul></section>`;
  }).join('');
  return `<section class="card"><div class="bar"><h3 style="margin:0">Йоги</h3><span class="mut">найдено ${ys.length}</span></div><div class="bar chips" style="margin-top:.7rem">${chips}</div>
    <p class="note">Проверяются классические определения по знакам и домам. Сила планет, градусы аспектов, сожжённость и большинство отмен не оцениваются (где отмена учтена — это написано). Благими считаются Юпитер, Венера, Меркурий и растущая Луна. Названия в латинской транскрипции, как принято в книгах и в Jagannatha Hora; значения — краткие традиционные, а не прогноз.</p></section>${body}`;
}

// ================================================================ ARUDHAS
const planetList = (ids) => (ids.length ? ids.map((i) => `<span class="pl-tag">${T.PLANET_ABBR[i]}</span>`).join(' ') : '<span class="mut">—</span>');
export function viewArudhas(ctx) {
  const c = ctx.chart, lagna = c.lagnaSign;
  const ba = cache(ctx, 'bhavaAru', () => J.bhavaArudhas(c)), ga = cache(ctx, 'grahaAru', () => J.grahaArudhas(c)), km = cache(ctx, 'karakamsa', () => J.karakamsa(c));
  const hl = (sign) => J.houseFrom(lagna, sign);
  const al = ba[0], ul = ba[11];
  const rows = ba.map((a) => {
    const inf = J.influencers(c, a.sign);
    return `<tr class="${a.name === 'AL' || a.name === 'UL' ? 'asc' : ''}"><td class="n"><b>${a.name}</b></td><td class="n">${a.house}</td><td>${sn(a.sign)}</td><td class="n">${hl(a.sign)}</td><td class="n">${J.houseFrom(al.sign, a.sign)}</td><td>${planetList(inf.conj)}</td><td>${planetList(inf.asp)}</td><td class="mut">${esc(a.meaning)}</td></tr>`;
  }).join('');
  const grows = ga.map((a) => `<tr><td>${pn(a.id)}</td><td>${sn(c.planets[a.id].sign)}</td><td>${sn(a.sign)}</td><td class="n">${hl(a.sign)}</td><td class="n">${J.houseFrom(al.sign, a.sign)}</td></tr>`).join('');
  const ak = c.planets[km.atmakaraka];
  const navPl = c.planets.filter((p) => A.vargaSign(p.lon, 9) === km.sign).map((p) => p.id);
  const lordUL = T.SIGN_LORD[ul.sign], sec = (ul.sign + 1) % 12, lordSec = T.SIGN_LORD[sec];
  const infUL = J.influencers(c, ul.sign);
  const dk = c.karakas.find((k) => /Darakaraka/.test(k.role));
  const cells = cellsD1(c, { degrees: false });
  cells.forEach((cell) => cell.forEach((it) => { it.c = (it.c || '') + ' nat'; }));
  ba.forEach((a) => cells[a.sign].push({ t: a.name, c: 'tr' }));
  const cells2 = Array.from({ length: 12 }, () => []);
  c.planets.forEach((p) => cells2[p.sign].push({ t: T.PLANET_ABBR[p.id], c: '' }));
  cells2[lagna].push({ t: 'Lg', c: 'nat' });
  return `<section class="card"><h3>Бхава-арудхи (Джаймини)</h3>
      <div class="scroll"><table class="tbl compact"><thead><tr><th>Пада</th><th>Дом</th><th>Знак</th><th>От лагны</th><th>От AL</th><th>Планеты в знаке</th><th>Аспектируют (раши-драшти)</th><th>Значение</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="note">Арудха дома: от знака дома отсчитывается столько знаков до его управителя, сколько он лежит, и столько же отсчитывается дальше от управителя; если результат попадает в сам дом или в 7-й от него — берётся 10-й от дома. Двойные управители (Скорпион, Водолей) — по основному управителю (Марс, Сатурн). «Аспектируют» — аспекты знаков Джаймини (узлы тоже учитываются): подвижные видят неподвижные (кроме соседнего), неподвижные — подвижные (кроме соседнего), двойственные — другие двойственные.</p></section>
    <div class="cols tr">
      <section class="card"><div class="charts">${chartBox(ctx, { cells, lagnaSign: lagna, title: 'Арудхи', sub: 'AL, A2–A11, UL' }, '')}</div></section>
      <section class="card"><div class="charts">${chartBox(ctx, { cells: cells2, lagnaSign: al.sign, title: 'От AL', sub: 'AL как 1-й дом' }, '')}</div>
        <p class="note">Те же планеты, но дома считаются от арудха-лагны — так смотрят «образ» человека и то, как его видят другие.</p></section>
    </div>
    <div class="cols">
      <section class="card"><h3>Арудхи планет (графа-пады)</h3>
        <table class="tbl compact"><thead><tr><th>Планета</th><th>Стоит в</th><th>Пада</th><th>От лагны</th><th>От AL</th></tr></thead><tbody>${grows}</tbody></table>
        <p class="note">Для планеты считается по тому же правилу: знак планеты — её «дом», управитель знака — «управитель». Раху и Кету не считаются.</p></section>
      <section class="card"><h3>Упапада и Карака-амша</h3>
        <dl class="kv"><div><dt>Упапада (UL)</dt><dd>${sn(ul.sign)} · ${ordinal(hl(ul.sign))} от лагны</dd></div>
        <div><dt>Планеты в UL / аспектируют UL</dt><dd>${planetList(infUL.conj)} / ${planetList(infUL.asp)}</dd></div>
        <div><dt>Управитель UL</dt><dd>${pn(lordUL)} в ${sn(c.planets[lordUL].sign)}</dd></div>
        <div><dt>2-й от UL</dt><dd>${sn(sec)} · управитель ${pn(lordSec)} в ${sn(c.planets[lordSec].sign)}</dd></div>
        ${dk ? `<div><dt>Даракарака</dt><dd>${pn(dk.planet)} в ${sn(c.planets[dk.planet].sign)}</dd></div>` : ''}
        <div><dt>Атмакарака</dt><dd>${pn(km.atmakaraka)} ${dms(ak.lon)} в ${sn(ak.sign)}</dd></div>
        <div><dt>Карака-амша</dt><dd>${sn(km.sign)} (Навамша Атмаракаки) · ${ordinal(hl(km.sign))} от лагны</dd></div>
        <div><dt>В этом знаке в Раси / в Навамше</dt><dd>${planetList(km.planetsInSign)} / ${planetList(navPl)}</dd></div>
        <div><dt>Навамша лагны</dt><dd>${sn(km.navamsaOfLagna)}</dd></div></dl>
        <p class="note">Атмакарака — планета с наибольшим градусом в знаке (схема: ${ctx.st.karakas} карак). Карака-амша — знак Навамши, в котором стоит атмакарака; от неё в традиции Джаймини смотрят «сущностную» линию жизни.</p></section>
    </div>`;
}

// ================================================================ TRANSITS
const TR_DEFAULT_ON = { 0: false, 2: true, 3: false, 4: true, 5: false, 6: true, 7: true, 9: false, 10: false, 11: false };
const CAL_IDS = [SUN, MARS, MERCURY, JUPITER, VENUS, SATURN, RAHU];
const CAL_OUTER = [T.URANUS, T.NEPTUNE, T.PLUTO];
function trState(ctx) {
  return tab(ctx, 'transits', () => {
    const tz = -new Date().getTimezoneOffset() / 60, n = nowLocal(tz), today = isoDate(n.y, n.m, n.d);
    return { sub: 'now', date: today, time: fmtHM(n.h, false), tz: fmtTz(tz), orb: '3', from: today, to: addMonths(today, 24) };
  });
}
export function viewTransits(ctx) {
  const v = trState(ctx);
  const tabs = seg('tsub', 'sub', [['now', 'На дату'], ['cal', 'Календарь событий'], ['sade', 'Сади Сати и Дхайя']], v.sub);
  const body = { now: trNow, cal: trCal, sade: trSade }[v.sub] || trNow;
  return `<div class="bar sub">${tabs}</div>${body(ctx, v)}`;
}
function trNow(ctx, v) {
  const c = ctx.chart;
  const d = parseIsoDate(v.date), tz = parseTz(v.tz), hh = parseHM(v.time), orb = parseFloat(String(v.orb).replace(',', '.'));
  const controls = `<section class="card"><div class="bar wrap">
      <button class="btn" data-act="tstep" data-u="d" data-k="-1">−1 д</button><button class="btn" data-act="tstep" data-u="m" data-k="-1">−1 мес</button><button class="btn" data-act="tstep" data-u="y" data-k="-1">−1 г</button>
      <label>Дата <input type="date" data-tr="date" value="${esc(v.date)}"></label>
      <label>Время <input type="text" size="6" data-tr="time" value="${esc(v.time)}"></label>
      <label>Пояс <input type="text" size="6" data-tr="tz" value="${esc(v.tz)}"></label>
      <button class="btn" data-act="tstep" data-u="d" data-k="1">+1 д</button><button class="btn" data-act="tstep" data-u="m" data-k="1">+1 мес</button><button class="btn" data-act="tstep" data-u="y" data-k="1">+1 г</button>
      <button class="btn" data-act="tnow">Сейчас</button></div></section>`;
  if (!d || Number.isNaN(tz) || Number.isNaN(hh)) return `${controls}<section class="card"><p class="err">Проверьте дату, время и пояс.</p></section>`;
  const jd = swe.julday(d.y, d.m, d.d, hh - tz);
  const tr = A.transitInfo(c, jd, ctx.st), av = cache(ctx, 'av', () => A.ashtakavarga(c));
  const cells = cellsD1(c, { degrees: false });
  cells.forEach((cell) => cell.forEach((it) => { it.c = (it.c || '') + ' nat'; }));
  const showOut = ctx.ui.outer !== false && tr.outer;
  tr.planets.forEach((p) => cells[p.sign].push({ t: T.PLANET_ABBR[p.id] + ' ' + Math.floor(p.deg) + '°' + (p.retro && p.id < 7 ? 'ᴿ' : ''), c: 'tr' }));
  if (showOut) tr.outer.forEach((p) => cells[p.sign].push({ t: T.PLANET_ABBR[p.id] + ' ' + Math.floor(p.deg) + '°' + (p.retro ? 'ᴿ' : ''), c: 'tr' }));
  const vim = cache(ctx, 'vim', () => A.vimshottari(c, ctx.st));
  const path = A.dashaAt(vim, jd).slice(0, 4).map((p) => T.PLANET_RU[p.lord]).join(' — ');
  const rows = tr.planets.concat(showOut ? tr.outer : []).map((p) => `<tr class="${p.id >= 9 ? 'outrow' : ''}"><td>${pn(p.id)}${p.retro && (p.id < 7 || p.id >= 9) ? ' <span class="tag retro">R</span>' : ''}${TX.motionState(p.id, p.speed, ctx.st).startsWith('stat') ? ' <span class="tag stat" title="Скорость меньше 10 % средней: планета у стоянки">стац.</span>' : ''}</td><td class="n">${dms(p.lon)} <span class="mut">${T.SIGN_ABBR[p.sign]}</span></td><td>${esc(T.NAKSHATRAS[p.nak])} <span class="mut">${p.pada}</span></td>
    <td class="n">${p.fromLagna}</td><td class="n">${p.fromMoon}</td><td class="n">${p.id < 7 ? av.bav[p.id][p.sign] : '—'}</td><td class="n">${av.sav[p.sign]}</td></tr>`).join('');
  const sade = tr.sadeSati ? `<p class="flag">Сади Сати: ${esc(tr.sadeSati.phase)}.</p>` : '<p class="note">Сади Сати (Сатурн в 12-м, 1-м, 2-м от натальной Луны) сейчас не действует.</p>';
  const sat = tr.planets[SATURN].fromMoon, dh = sat === 4 ? '<p class="flag">Кантака-Шани (Сатурн в 4-м от Луны).</p>' : sat === 8 ? '<p class="flag">Аштама-Шани (Сатурн в 8-м от Луны).</p>' : '';
  // gochara
  const go = TX.gochara(tr.planets);
  const gRows = go.map((g) => {
    const state = g.effective ? '<span class="tag ex">благоприятно</span>' : g.good ? `<span class="tag retro">блокировано ведхой</span> <span class="mut">${T.PLANET_RU[g.blockedBy]} в ${TX.GOCHARA_VEDHA[g.id][g.house]}-м</span>` : '<span class="tag db">неблагоприятно</span>';
    return `<tr><td>${pn(g.id)}</td><td class="n">${g.house}</td><td class="n mut">${TX.GOCHARA_GOOD[g.id].join(', ')}</td><td>${state}</td></tr>`;
  }).join('');
  // hits
  const hits = Number.isFinite(orb) ? TX.transitHits(c, tr.planets, { orb: Math.min(10, Math.max(0.1, orb)) }) : [];
  const hRows = hits.map((h) => `<tr><td>${pn(h.transit)}</td><td>${h.kind === 'conj' ? 'соединение' : 'оппозиция'}</td><td>${h.natal < 0 ? 'Лагна' : pn(h.natal)}</td><td class="n">${h.orb.toFixed(2)}°</td></tr>`).join('');
  return `${controls}
    <div class="cols tr">
      <section class="card"><div class="charts">${chartBox(ctx, { cells, lagnaSign: c.lagnaSign, title: 'Транзит', sub: fmtJD(jd, tz) }, '')}</div>
        <p class="note legend"><span class="sw nat"></span> натал <span class="sw tr"></span> транзит (знак и градус)</p></section>
      <section class="card"><h3>Транзитные планеты</h3><div class="scroll"><table class="tbl compact"><thead><tr><th>Планета</th><th>Долгота</th><th>Накшатра</th><th>От лагны</th><th>От Луны</th><th>Бинду</th><th>SAV</th></tr></thead><tbody>${rows}</tbody></table></div>
        ${sade}${dh}<p class="note">Вимшоттари на эту дату: <b>${esc(path || '—')}</b>. Бинду — очки планеты в её собственной аштакаварге в транзитном знаке.${showOut ? ' Серые строки — Уран, Нептун, Плутон: у них нет аштакаварги, гочары и ведхи, они только показаны.' : ''}</p></section>
    </div>
    <div class="cols">
      <section class="card"><h3>Гочара: дома от натальной Луны</h3>
        <table class="tbl compact"><thead><tr><th>Планета</th><th>Дом от Луны</th><th>Благоприятные дома</th><th>Итог</th></tr></thead><tbody>${gRows}</tbody></table>
        <p class="note">Классические таблицы гочары (Фаладипика/БПХС): у каждой планеты свои благоприятные дома от Луны; «ведха» — препятствие от планеты в определённом доме (Солнце и Сатурн, Луна и Меркурий друг другу ведху не создают). Раху и Кету в таблицу не включены. Это ориентир, а не прогноз: транзит надо читать вместе с даша и аштакаваргой.</p></section>
      <section class="card"><h3>Транзит ↔ натал</h3>
        <div class="bar"><label>Орб, ° <input type="text" size="4" data-tr="orb" value="${esc(v.orb)}"></label><span class="mut">соединения и оппозиции по долготе</span></div>
        ${hRows ? `<table class="tbl compact" style="margin-top:.6rem"><thead><tr><th>Транзит</th><th>Связь</th><th>Натал</th><th>Точность</th></tr></thead><tbody>${hRows}</tbody></table>` : '<p class="note">В этом орбе точных связей нет.</p>'}
        <p class="note">Проверяются Солнце, Марс, Меркурий, Юпитер, Венера, Сатурн, Раху и Кету против всех натальных планет и Лагны.</p></section>
    </div>`;
}
function trCal(ctx, v) {
  const c = ctx.chart, tz = parseTz(v.tz), f = parseIsoDate(v.from), t = parseIsoDate(v.to);
  const calIds = ctx.ui.outer === false ? CAL_IDS : CAL_IDS.concat(CAL_OUTER);
  const ids = calIds.filter((id) => (v['p' + id] === undefined ? TR_DEFAULT_ON[id] : v['p' + id]));
  const pickers = calIds.map((id) => `<label class="chk"><input type="checkbox" data-tr="p${id}" ${ids.includes(id) ? 'checked' : ''}> ${T.PLANET_RU[id]}</label>`).join('');
  const controls = `<section class="card"><div class="bar wrap">
    <label>С <input type="date" data-tr="from" value="${esc(v.from)}"></label><label>По <input type="date" data-tr="to" value="${esc(v.to)}"></label>
    <label>Пояс <input type="text" size="6" data-tr="tz" value="${esc(v.tz)}"></label>
    <button class="btn" data-act="tcalp" data-p="2">2 года</button><button class="btn" data-act="tcalp" data-p="10">10 лет</button><button class="btn" data-act="tcalp" data-p="0">От сегодня</button></div>
    <div class="bar wrap" style="margin-top:.5rem">${pickers}</div></section>`;
  if (!f || !t || Number.isNaN(tz)) return `${controls}<section class="card"><p class="err">Проверьте даты и пояс.</p></section>`;
  let jd0 = swe.julday(f.y, f.m, f.d, -tz), jd1 = swe.julday(t.y, t.m, t.d, 24 - tz), note = '';
  if (jd1 <= jd0) return `${controls}<section class="card"><p class="err">Конец периода раньше начала.</p></section>`;
  if (jd1 - jd0 > 40 * 365.25) { jd1 = jd0 + 40 * 365.25; note = 'Период ограничен 40 годами.'; }
  if (!ids.length) return `${controls}<section class="card"><p class="note">Отметьте хотя бы одну планету.</p></section>`;
  const key = `cal:${ids.join(',')}:${jd0.toFixed(3)}:${jd1.toFixed(3)}`;
  const dres = deferred(ctx, key, (jd1 - jd0) * ids.length > 15 * 365.25 * 3, () => TX.findEvents(jd0, jd1, ids, ctx.st));
  if (dres.pending) return `${controls}${busy('события')}`;
  const ev = dres.value;
  const nowJD = jdNow();
  const rows = ev.slice(0, 1500).map((e) => {
    const sign = e.sign, hl = ((sign - c.lagnaSign + 12) % 12) + 1, hm = ((sign - c.planets[MOON].sign + 12) % 12) + 1;
    const what = e.kind === 'ingress' ? `входит в ${sn(sign)}${e.retro ? ' <span class="tag retro">R</span>' : ''}` : `стоянка, дальше ${e.retro ? 'ретроградное движение <span class="tag retro">R</span>' : 'прямое движение'} — ${e.deg.toFixed(2).replace('.', ',')}° ${sn(sign)}`;
    return `<tr class="${e.jd >= nowJD && ev.find((x) => x.jd >= nowJD) === e ? 'now' : ''}"><td class="n">${localOf(e.jd, tz)}</td><td>${pn(e.id)}</td><td>${what}</td><td class="n">${hl}</td><td class="n">${hm}</td></tr>`;
  }).join('');
  return `${controls}<section class="card"><h3>События ${esc(v.from)} — ${esc(v.to)} <small class="mut">${ev.length}</small></h3>
    ${rows ? `<div class="scroll"><table class="tbl compact"><thead><tr><th>Время</th><th>Планета</th><th>Событие</th><th>Дом от лагны</th><th>Дом от Луны</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="note">Событий нет.</p>'}
    <p class="note">${esc(note)} Входы в знаки считаются по сидерической долготе (аянамша из настроек); ретроградные планеты могут входить в знак повторно. У Раху/Кету при средних узлах стоянок нет. Дома — от натальной лагны и натальной Луны (по знакам). Время — по поясу из поля «Пояс» без перехода на летнее время.</p></section>`;
}
function trSade(ctx) {
  const c = ctx.chart;
  const dres = deferred(ctx, 'phases', true, () => TX.saturnPhases(c, c.jd + 100 * 365.2425, ctx.st));
  if (dres.pending) return busy('проход Сатурна');
  const ph = dres.value;
  const nowJD = jdNow(), tz = c.input.tzEast;
  const cur = (a, b) => (nowJD >= a && nowJD < b ? ' now' : '');
  const cyc = ph.cycles.map((cy, i) => {
    const parts = cy.parts.map((p) => `<tr class="sub${cur(p.start, p.end)}"><td></td><td>Сатурн в ${sn(p.sign)} — ${SADE_SHORT[p.house]}</td><td class="n">${fmtJD(p.start, tz)}</td><td class="n">${fmtJD(p.end, tz)}</td><td class="n mut">${fmtAge(ageAt(ctx, p.start))} – ${fmtAge(ageAt(ctx, p.end))}</td></tr>`).join('');
    const began = cy.start <= c.jd + 1e-6 ? ' <span class="mut">(к рождению уже шёл)</span>' : '';
    return `<tr class="sum${cur(cy.start, cy.end)}"><td class="n">№${i + 1}</td><td>Сади Сати${began} · ${fmtDur(cy.end - cy.start, 365.25)}</td><td class="n">${fmtJD(cy.start, tz)}</td><td class="n">${fmtJD(cy.end, tz)}</td><td class="n">${fmtAge(ageAt(ctx, cy.start))} – ${fmtAge(ageAt(ctx, cy.end))}</td></tr>${parts}`;
  }).join('');
  const oth = ph.other.map((o) => `<tr class="${cur(o.start, o.end).trim()}"><td>${o.cls === 'kantaka' ? 'Кантака (4-й от Луны)' : 'Аштама (8-й от Луны)'}</td><td>Сатурн в ${sn(o.parts[0].sign)}</td><td class="n">${fmtJD(o.start, tz)}</td><td class="n">${fmtJD(o.end, tz)}</td><td class="n">${fmtAge(ageAt(ctx, o.start))} – ${fmtAge(ageAt(ctx, o.end))}</td></tr>`).join('');
  return `<section class="card"><h3>Сади Сати <small class="mut">Луна в ${T.SIGN_RU[ph.moonSign]}</small></h3>
      <div class="scroll"><table class="tbl compact"><thead><tr><th></th><th>Период</th><th>Начало</th><th>Конец</th><th>Возраст, лет</th></tr></thead><tbody>${cyc}</tbody></table></div>
      <p class="note">Сади Сати — проход Сатурна через 12-й, 1-й и 2-й знаки от натальной Луны. Из-за ретроградности Сатурн может вернуться в прошлый знак, поэтому внутри цикла бывают повторные входы; цикл объединяет куски, между которыми меньше года. Расчёт на 100 лет от рождения.</p></section>
    <section class="card"><h3>Дхайя: Кантака и Аштама</h3>
      <div class="scroll"><table class="tbl compact"><thead><tr><th>Вид</th><th>Знак</th><th>Начало</th><th>Конец</th><th>Возраст, лет</th></tr></thead><tbody>${oth}</tbody></table></div>
      <p class="note">Сатурн в 4-м (Кантака, «Ардхаштама») и в 8-м (Аштама) знаке от натальной Луны — «малая Сади Сати», примерно по 2,5 года.</p></section>`;
}
const SADE_SHORT = { 12: '12-й от Луны', 1: 'над Луной', 2: '2-й от Луны' };

// ================================================================ VARSHAPHALA
function vaState(ctx) {
  const b = ctx.birth;
  return tab(ctx, 'varsha', () => ({ sub: 'chart', year: String((() => { const y = new Date().getFullYear(); return y > b.year && y <= b.year + 110 ? y : b.year + 30; })()), lat: String(+b.lat.toFixed(4)), lon: String(+b.lonEast.toFixed(4)), tz: fmtTz(b.tzEast) }));
}
export function viewVarsha(ctx) {
  const v = vaState(ctx), b = ctx.birth;
  const year = parseInt(v.year, 10), lat = parseCoord(v.lat, 'lat'), lon = parseCoord(v.lon, 'lon'), tz = parseTz(v.tz);
  const tabs = seg('vsub', 'sub', [['chart', 'Карта года'], ['tajika', 'Мунтха и Таджика'], ['mudda', 'Мудда-даша'], ['years', 'Годы']], v.sub);
  const controls = `<section class="card"><div class="bar wrap">${tabs}
    <button class="btn" data-act="vstep" data-k="-1">◀</button>
    <label>Год <input type="number" size="6" data-va="year" value="${esc(v.year)}"></label>
    <button class="btn" data-act="vstep" data-k="1">▶</button>
    <label>Широта <input type="text" size="9" data-va="lat" value="${esc(v.lat)}"></label>
    <label>Долгота <input type="text" size="9" data-va="lon" value="${esc(v.lon)}"></label>
    <label>Пояс <input type="text" size="6" data-va="tz" value="${esc(v.tz)}"></label>
    <button class="btn" data-act="vbirth">Место рождения</button></div></section>`;
  if (!Number.isFinite(year) || year < b.year || year > b.year + 300 || [lat, lon, tz].some(Number.isNaN)) return `${controls}<section class="card"><p class="err">Укажите год от года рождения (не позднее +300 лет), координаты и пояс.</p></section>`;
  const loc = { lat, lon, tz };
  const body = { chart: vaChart, tajika: vaTajika, mudda: vaMudda, years: vaYears }[v.sub] || vaChart;
  return controls + body(ctx, year, loc);
}
const vcache = (ctx, year, loc) => cache(ctx, `va:${year}:${loc.lat}:${loc.lon}:${loc.tz}`, () => V.varshaChart(ctx.chart, year, loc, ctx.st));
function vaChart(ctx, year, loc) {
  const v = vcache(ctx, year, loc), rc = v.chart, tz = loc.tz;
  const rows = rc.planets.map((p) => `<tr><td>${pn(p.id)}${p.retro && p.id < 7 ? ' <span class="tag retro">R</span>' : ''}</td><td class="n">${dms(p.lon)} <span class="mut">${T.SIGN_ABBR[p.sign]}</span></td><td>${esc(T.NAKSHATRAS[p.nak])} <span class="mut">${p.pada}</span></td><td class="n">${p.house}</td></tr>`).join('');
  const cells = cellsD1(rc);
  cells[v.muntha.sign].push({ t: 'Мунтха', c: 'own' });
  return `<div class="cols tr"><section class="card"><div class="charts">${chartBox(ctx, { cells, lagnaSign: rc.lagnaSign, title: 'Варша ' + year, sub: fmtJD(v.jd, tz) }, '')}</div></section>
    <section class="card"><dl class="kv"><div><dt>Момент возврата Солнца</dt><dd>${fmtJD(v.jd, tz, true, true)} <span class="mut">(${fmtTz(tz)}, ${v.day ? 'день' : 'ночь'})</span></dd></div>
      <div><dt>Возраст</dt><dd>${v.age} полных лет, идёт ${v.age + 1}-й год</dd></div>
      <div><dt>Лагна года</dt><dd>${sn(rc.lagnaSign)} ${dms(rc.lagna.lon)}</dd></div>
      <div><dt>Мунтха</dt><dd>${sn(v.muntha.sign)} · ${v.muntha.house}-й дом года${[6, 8, 12].includes(v.muntha.house) ? ' <span class="tag db">дусштхана</span>' : ''}</dd></div>
      <div><dt>Лорд мунтхи</dt><dd>${pn(v.muntha.lord)} в ${v.muntha.lordHouse}-м доме года</dd></div></dl>
      <div class="scroll"><table class="tbl compact"><thead><tr><th>Планета</th><th>Долгота</th><th>Накшатра</th><th>Дом</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="note">Возврат — момент, когда сидерическое Солнце вновь на натальной долготе (до долей секунды). Карта строится для указанного места. Мунтха — знак натальной лагны плюс число прожитых лет.</p></section></div>`;
}
function vaTajika(ctx, year, loc) {
  const v = vcache(ctx, year, loc), rc = v.chart;
  const cand = v.candidates.map((x) => `<tr><td>${esc(x.role)}</td><td>${pn(x.planet)}</td><td>${sn(rc.planets[x.planet].sign)}</td><td class="n">${x.house}</td><td>${x.aspectsLagna ? V.ASPECT_RU[x.aspectsLagna] : '<span class="mut">—</span>'}</td></tr>`).join('');
  const kindRu = { ithasala: 'Иттхасала', ishrafa: 'Ишрафа' };
  const pairs = v.pairs.filter((p) => p.kind);
  const prow = pairs.map((p) => `<tr><td>${pn(p.fast)} <span class="mut">быстрее</span></td><td>${pn(p.slow)}</td><td>${V.ASPECT_RU[p.aspect]}</td><td class="n">${Math.abs(p.diff).toFixed(2)}° / ${p.limit.toFixed(1)}°</td><td><span class="tag ${p.kind === 'ithasala' ? 'ex' : 'retro'}">${kindRu[p.kind]}</span>${p.exact ? ' <span class="mut">точная</span>' : ''}</td></tr>`).join('');
  return `<section class="card"><h3>Кандидаты в владыки года (Варшеша)</h3>
      <table class="tbl compact"><thead><tr><th>Роль</th><th>Планета</th><th>Знак в карте года</th><th>Дом</th><th>Аспект (Таджика) к лагне года</th></tr></thead><tbody>${cand}</tbody></table>
      <p class="note">По Таджике владыкой года становится сильнейший из «пяти претендентов», который аспектирует лагну года. Здесь показаны четыре претендента (лорд мунтхи, лорд натальной лагны, лорд лагны года, три-раши-пати по дню/ночи) и их аспект к лагне года по знакам. Пятый (дина-ратри-пати) и определение силы по Панча-варгия-бале <b>не реализованы</b>, поэтому итоговый владыка года не выбирается автоматически.</p></section>
    <section class="card"><h3>Иттхасала и Ишрафа</h3>
      ${prow ? `<div class="scroll"><table class="tbl compact"><thead><tr><th>Быстрая</th><th>Медленная</th><th>Аспект</th><th>Разность / допуск</th><th>Результат</th></tr></thead><tbody>${prow}</tbody></table></div>` : '<p class="note">Пар в допустимом орбе нет.</p>'}
      <p class="note">Аспекты Таджики по знакам: соединение, секстиль (3/11), тригон (5/9) — дружественные; квадрат (4/10) и оппозиция (7) — враждебные. Допуск — полусумма «диптамш» (Солнце 15, Луна 12, Марс 8, Меркурий 7, Юпитер 9, Венера 7, Сатурн 9). Быстрая планета позади медленной (меньший градус в знаке) — иттхасала («соединение, идущее к завершению»), впереди — ишрафа («расходящееся»). Градусы сравниваются внутри знаков. Остальные таджика-йоги (накта, ямая, камбула и др.) не реализованы.</p></section>`;
}
function vaMudda(ctx, year, loc) {
  const md = cache(ctx, `mudda:${year}:${loc.lat}:${loc.lon}:${loc.tz}`, () => V.muddaDasha(ctx.chart, year, loc, ctx.st)), tz = loc.tz;
  const clip = (a, b) => [Math.max(a, md.start), Math.min(b, md.end)];
  const rows = md.sys.maha.map((m) => {
    const [s, e] = clip(m.start, m.end);
    const kids = md.sys.children(m).filter((k) => k.end > md.start && k.start < md.end).map((k) => { const [ks, ke] = clip(k.start, k.end); return `<tr><td>${pn(m.lord)} — ${pn(k.lord)}</td><td class="n">${fmtJD(ks, tz, true)}</td><td class="n">${fmtJD(ke, tz, true)}</td><td class="n mut">${(ke - ks).toFixed(1)} дн</td></tr>`; }).join('');
    return `<tr class="sum"><td>${pn(m.lord)} <span class="mut">махадаша</span></td><td class="n">${fmtJD(s, tz, true)}</td><td class="n">${fmtJD(e, tz, true)}</td><td class="n">${(e - s).toFixed(1)} дн</td></tr>${kids}`;
  }).join('');
  return `<section class="card"><h3>Мудда-даша ${year}</h3>
    <div class="scroll"><table class="tbl compact"><thead><tr><th>Период</th><th>Начало</th><th>Конец</th><th>Длительность</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">Мудда-даша — Вимшоттари карты года, сжатая так, что 120 лет занимают ровно один солнечный год (здесь ${md.sys.yearDays.toFixed(3).replace('.', ',')} дн.; за «год даш» берётся 1/120 от него, ≈ ${md.sys.dayPerYear.toFixed(3).replace('.', ',')} дн.). Старт — от Луны в карте года. В других программах длина года может задаваться иначе (360 или 365,25 дн.), и даты слегка расходятся. Показаны махадаши и антардаши.</p></section>`;
}
function vaYears(ctx, year, loc) {
  const b = ctx.birth, last = Math.min(b.year + 100, b.year + 120);
  const rows0 = cache(ctx, `vyears:${loc.lat}:${loc.lon}:${loc.tz}`, () => V.varshaTable(ctx.chart, b.year + 1, last, loc, ctx.st));
  const tz = loc.tz;
  const rows = rows0.map((r) => `<tr class="${r.year === year ? 'now' : ''}"><td class="n">${r.year}</td><td class="n">${r.age}</td><td class="n">${fmtJD(r.jd, tz, true)}</td><td>${sn(r.lagnaSign)}</td><td>${sn(r.muntha)}</td><td class="n">${r.munthaHouse}${[6, 8, 12].includes(r.munthaHouse) ? ' <span class="tag db">дусштхана</span>' : ''}</td><td>${pn(r.munthaLord)}</td><td>${sn(r.moonSign)}</td></tr>`).join('');
  return `<section class="card"><h3>Годы жизни</h3>
    <div class="scroll"><table class="tbl compact"><thead><tr><th>Год</th><th>Возраст</th><th>Соляр</th><th>Лагна года</th><th>Мунтха</th><th>Дом мунтхи</th><th>Лорд мунтхи</th><th>Луна года</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">Для каждого года — момент возврата Солнца в указанном месте, знак лагны года, мунтха и её дом в карте года. Дом мунтхи в 6, 8, 12 традиционно считается трудным. Сахамы, определение владыки года и таджика-йоги по годам не рассчитываются.</p></section>`;
}

// ================================================================ ECLIPSES
function ecState(ctx) {
  const b = ctx.birth;
  return tab(ctx, 'eclipses', () => {
    const tz = -new Date().getTimezoneOffset() / 60, n = nowLocal(tz), today = isoDate(n.y, n.m, n.d);
    return { from: addDays(today, -30), to: addMonths(today, 36), sol: true, lun: true, lat: String(+b.lat.toFixed(4)), lon: String(+b.lonEast.toFixed(4)), tz: fmtTz(tz), orb: '5', sel: null };
  });
}
export function viewEclipses(ctx) {
  const v = ecState(ctx), c = ctx.chart;
  const f = parseIsoDate(v.from), t = parseIsoDate(v.to), tz = parseTz(v.tz), lat = parseCoord(v.lat, 'lat'), lon = parseCoord(v.lon, 'lon'), orb = parseFloat(String(v.orb).replace(',', '.'));
  const controls = `<section class="card"><div class="bar wrap">
    <label>С <input type="date" data-ec="from" value="${esc(v.from)}"></label><label>По <input type="date" data-ec="to" value="${esc(v.to)}"></label>
    <label class="chk"><input type="checkbox" data-ec="sol" ${v.sol ? 'checked' : ''}> солнечные</label><label class="chk"><input type="checkbox" data-ec="lun" ${v.lun ? 'checked' : ''}> лунные</label>
    <button class="btn" data-act="ecp" data-p="3">Ближайшие 3 года</button><button class="btn" data-act="ecp" data-p="10">10 лет</button><button class="btn" data-act="ecp" data-p="life">Вся жизнь</button>
    <button class="btn" data-act="ecshift" data-k="-1">◀ год</button><button class="btn" data-act="ecshift" data-k="1">год ▶</button></div>
    <div class="bar wrap" style="margin-top:.5rem"><label>Место: широта <input type="text" size="8" data-ec="lat" value="${esc(v.lat)}"></label><label>долгота <input type="text" size="8" data-ec="lon" value="${esc(v.lon)}"></label>
    <label>Пояс <input type="text" size="6" data-ec="tz" value="${esc(v.tz)}"></label><label>Орб, ° <input type="text" size="4" data-ec="orb" value="${esc(v.orb)}"></label><button class="btn" data-act="ecbirth">Место рождения</button></div></section>`;
  if (!f || !t || [tz, lat, lon].some(Number.isNaN) || !Number.isFinite(orb)) return `${controls}<section class="card"><p class="err">Проверьте даты, место, пояс и орб.</p></section>`;
  let jd0 = swe.julday(f.y, f.m, f.d, -tz), jd1 = swe.julday(t.y, t.m, t.d, 24 - tz), note = '';
  if (jd1 <= jd0) return `${controls}<section class="card"><p class="err">Конец периода раньше начала.</p></section>`;
  if (jd1 - jd0 > 125 * 365.25) { jd1 = jd0 + 125 * 365.25; note = 'Период ограничен 125 годами. '; }
  const dres = deferred(ctx, `eclraw:${jd0.toFixed(2)}:${jd1.toFixed(2)}`, jd1 - jd0 > 12 * 365.25, () => E.findRaw(jd0, jd1, 600));
  if (dres.pending) return `${controls}${busy('затмения')}`;
  const all = E.decorateAll(dres.value, { natal: c, loc: null, st: ctx.st, orb });
  const list = all.filter((e) => (e.kind === 'sol' ? v.sol : v.lun));
  // visibility at the place: for short lists for every row, otherwise only for the opened one (about 20 ms each)
  const place = { lon, lat, alt: 0 };
  const withLocal = (e) => { const k = `loc:${e.kind}:${e.jd.toFixed(4)}:${lat}:${lon}`; e.local = k in ctx.cache ? ctx.cache[k] : (ctx.cache[k] = E.addLocal(e, place)); };
  const allLocal = list.length <= 40;
  list.forEach((e, i) => { if (allLocal || i === v.sel) withLocal(e); });
  const nowJD = jdNow();
  const firstFuture = list.findIndex((e) => e.jd >= nowJD);
  const rows = list.map((e, i) => {
    const sol = e.kind === 'sol';
    const hits = (e.hits || []).map((h) => `${h.id < 0 ? 'Лагна' : T.PLANET_ABBR[h.id]} <span class="mut">${h.orb.toFixed(1)}°</span>`).join(', ');
    let vis;
    if (!e.local) vis = '<span class="mut">—</span>';
    else if (sol) vis = e.local.visible ? `<span class="tag ex">видно</span> <span class="mut">${e.local.annular ? 'кольц.' : e.local.total ? 'полн.' : 'част.'} ${(e.local.obscuration * 100).toFixed(0)}%${e.local.maxVisible ? '' : ', максимум не виден'}</span>` : '<span class="mut">не видно</span>';
    else vis = e.local.visible ? `<span class="tag ex">видно</span> <span class="mut">${e.local.maxVisible ? `Луна ${e.local.moonAlt.toFixed(0)}° над горизонтом` : 'частично'}</span>` : '<span class="mut">не видно</span>';
    const penum = !sol && e.type === 'penumbral';
    const mag = penum ? `${e.penMagnitude.toFixed(3).replace('.', ',')} <span class="mut">полутен.</span>` : e.magnitude != null ? e.magnitude.toFixed(3).replace('.', ',') : '—';
    return `<tr class="clickrow ${i === v.sel ? 'now' : i === firstFuture ? 'next' : ''}" data-act="ecopen" data-i="${i}" tabindex="0"><td class="n">${localOf(e.jd, tz)}</td><td>${sol ? '☉ Солнечное' : '☾ Лунное'}, ${esc(e.typeRu)}</td><td class="n">${dms(e.lon)} ${sn(e.sign)}</td><td>${esc(T.NAKSHATRAS[e.nak])} <span class="mut">${e.pada}</span></td><td class="n">${e.fromLagna}</td><td class="n">${e.fromMoon}</td><td>${T.PLANET_ABBR[e.node.id]}</td><td>${hits || '<span class="mut">—</span>'}</td><td class="n">${mag}</td><td>${vis}</td></tr>`;
  }).join('');
  let detail = '';
  if (v.sel != null && list[v.sel]) detail = ecDetail(ctx, list[v.sel], tz);
  return `${controls}<section class="card"><h3>Затмения <small class="mut">${list.length}</small></h3>
    ${rows ? `<div class="scroll"><table class="tbl compact"><thead><tr><th>Максимум</th><th>Затмение</th><th>Позиция (сидерич.)</th><th>Накшатра</th><th>Дом от лагны</th><th>от Луны</th><th>Узел</th><th>Натал (орб)</th><th>Величина</th><th>В выбранном месте</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="note">В этом периоде затмений нет.</p>'}
    <p class="note">${esc(note)}Нажмите на строку — подробности и карта. Позиция — сидерическая долгота Солнца (для солнечного) или Луны (для лунного) в момент максимума. «Дом» — по знакам от натальной лагны и натальной Луны. «Узел» — ближайший лунный узел оси затмения. «Натал» — планеты и Лагна в орбе по долготе. Величина — доля диаметра, покрытая в максимуме (для лунных — умбральная; у полутеневых умбральной нет, поэтому показана полутеневая величина). ${allLocal ? '' : 'Видимость в выбранном месте при длинных списках считается только для открытой строки. '}Время — по поясу в поле «Пояс», без летнего. Положение считается Swiss Ephemeris в режиме Moshier: время максимума надёжно до минут.</p></section>${detail}`;
}
function ecDetail(ctx, e, tz) {
  const c = ctx.chart, sol = e.kind === 'sol', fm = (jd) => (jd ? localOf(jd, tz) : '—');
  const glob = sol
    ? [['Начало частной фазы (мир)', e.partialBegin], ['Начало центральной фазы', e.centralBegin], ['Максимум', e.jd], ['Конец центральной фазы', e.centralEnd], ['Конец частной фазы', e.partialEnd]]
    : [['Начало полутени', e.penBegin], ['Начало частной фазы', e.partialBegin], ['Начало полной фазы', e.totalBegin], ['Максимум', e.jd], ['Конец полной фазы', e.totalEnd], ['Конец частной фазы', e.partialEnd], ['Конец полутени', e.penEnd]];
  const gl = glob.filter(([, jd]) => jd).map(([n, jd]) => `<div><dt>${n}</dt><dd class="n">${fm(jd)}</dd></div>`).join('');
  let loc = '';
  const L = e.local;
  if (L && sol && L.visible) loc = [['Первый контакт', L.first], ['Второй контакт', L.second], ['Максимум', L.max], ['Третий контакт', L.third], ['Четвёртый контакт', L.fourth]].filter(([, x]) => x).map(([n, jd]) => `<div><dt>${n} (место)</dt><dd class="n">${fm(jd)}</dd></div>`).join('') + `<div><dt>Величина / закрыто</dt><dd>${L.magnitude.toFixed(3).replace('.', ',')} / ${(L.obscuration * 100).toFixed(1).replace('.', ',')}%</dd></div><div><dt>Высота Солнца в максимуме</dt><dd>${L.sunAlt.toFixed(1)}°</dd></div>`;
  else if (L && !sol) loc = `<div><dt>Луна в максимуме</dt><dd>${L.moonAlt.toFixed(1)}° над горизонтом (азимут ${L.moonAz.toFixed(0)}°)</dd></div>`;
  const cells = cellsD1(c, { degrees: false });
  cells.forEach((cell) => cell.forEach((it) => { it.c = (it.c || '') + ' nat'; }));
  cells[e.sign].push({ t: (sol ? '☉' : '☾') + ' ' + Math.floor(e.deg ?? (e.lon % 30)) + '°', c: 'tr' });
  const hits = (e.hits || []);
  return `<section class="card"><h3>${sol ? 'Солнечное' : 'Лунное'} затмение, ${esc(e.typeRu)} — ${fmtJD(e.jd, tz, true)}</h3>
    <div class="cols tr"><div class="charts">${chartBox(ctx, { cells, lagnaSign: c.lagnaSign, title: sol ? 'Солнечное' : 'Лунное', sub: dms(e.lon) }, '')}</div>
    <div><dl class="kv"><div><dt>Позиция</dt><dd>${dms(e.lon)} ${sn(e.sign)}, ${esc(T.NAKSHATRAS[e.nak])} ${e.pada}</dd></div>
      <div><dt>Дом от лагны / от Луны</dt><dd>${e.fromLagna} / ${e.fromMoon}</dd></div>
      <div><dt>Ближайший узел</dt><dd>${pn(e.node.id)}, ${e.node.dist.toFixed(2)}° от оси</dd></div>
      <div><dt>Величина</dt><dd>${!sol && e.type === 'penumbral' ? 'умбральной фазы нет' : e.magnitude != null ? e.magnitude.toFixed(4).replace('.', ',') : '—'}${!sol && e.penMagnitude != null ? ` · полутеневая ${e.penMagnitude.toFixed(4).replace('.', ',')}` : ''}</dd></div>
      <div><dt>Затронутые натальные точки</dt><dd>${hits.length ? hits.map((h) => `${h.id < 0 ? 'Лагна' : pn(h.id)} (${h.orb.toFixed(2)}°)`).join(', ') : 'нет в орбе'}</dd></div>${gl}${loc}</dl></div></div></section>`;
}

// ================================================================ actions
export const actions = {
  ygroup(ctx, el) { const v = tab(ctx, 'yogas', () => ({ off: {} })); const g = el.dataset.g; v.off[g] = !v.off[g]; return true; },
  tsub(ctx, el) { trState(ctx).sub = el.dataset.s; return true; },
  tstep(ctx, el) {
    const v = trState(ctx), d = parseIsoDate(v.date); if (!d) return false;
    const k = +el.dataset.k, u = el.dataset.u;
    v.date = u === 'd' ? addDays(v.date, k) : addMonths(v.date, u === 'y' ? 12 * k : k); return true;
  },
  tnow(ctx) { const v = trState(ctx), tz = -new Date().getTimezoneOffset() / 60, n = nowLocal(tz); Object.assign(v, { date: isoDate(n.y, n.m, n.d), time: fmtHM(n.h, false), tz: fmtTz(tz) }); return true; },
  tcalp(ctx, el) {
    const v = trState(ctx), tz = parseTz(v.tz), n = nowLocal(Number.isNaN(tz) ? 0 : tz), today = isoDate(n.y, n.m, n.d), p = +el.dataset.p;
    v.from = today; v.to = addMonths(today, p ? 12 * p : 12); return true;
  },
  vsub(ctx, el) { vaState(ctx).sub = el.dataset.s; return true; },
  vstep(ctx, el) { const v = vaState(ctx); v.year = String((parseInt(v.year, 10) || new Date().getFullYear()) + +el.dataset.k); return true; },
  vbirth(ctx) { const v = vaState(ctx), b = ctx.birth; Object.assign(v, { lat: String(+b.lat.toFixed(4)), lon: String(+b.lonEast.toFixed(4)), tz: fmtTz(b.tzEast) }); return true; },
  ecp(ctx, el) {
    const v = ecState(ctx), tz = parseTz(v.tz), n = nowLocal(Number.isNaN(tz) ? 0 : tz), today = isoDate(n.y, n.m, n.d), p = el.dataset.p;
    if (p === 'life') { const b = ctx.birth; v.from = isoDate(b.year, b.month, b.day); v.to = addMonths(v.from, 12 * 100); } else { v.from = addDays(today, -30); v.to = addMonths(today, 12 * +p); }
    v.sel = null; return true;
  },
  ecshift(ctx, el) { const v = ecState(ctx); v.from = addMonths(v.from, 12 * +el.dataset.k); v.to = addMonths(v.to, 12 * +el.dataset.k); v.sel = null; return true; },
  ecbirth(ctx) { const v = ecState(ctx), b = ctx.birth; Object.assign(v, { lat: String(+b.lat.toFixed(4)), lon: String(+b.lonEast.toFixed(4)), tz: fmtTz(b.tzEast) }); return true; },
  ecopen(ctx, el) { const v = ecState(ctx), i = +el.dataset.i; v.sel = v.sel === i ? null : i; return true; },
};
export const changes = {};
export const groups = { tr: 'transits', va: 'varsha', ec: 'eclipses' };
void [MERCURY, JUPITER, VENUS, KETU, pad, fmtClock, fromTo];
