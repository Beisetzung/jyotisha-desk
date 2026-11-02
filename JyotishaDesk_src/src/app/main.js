// Application shell: folder sidebar, tabs, dialogs, saving. Entry point of the bundle.
import createModule from 'sweph-wasm/dist/wasm/swisseph.js';
import { initSwe } from '../swe.js';
import * as A from '../astro.js';
import * as T from '../tables.js';
import { parseJHD, serializeJHD } from '../jhd.js';
import * as store from './store.js';
import * as V from './views.js';
import { esc, fmtTz, fmtHM, parseHM, parseTz, parseCoord, pad } from './util.js';
import * as AT from './atlas.js';
import { createReader } from './pdfreader.js';

const $ = (s, r = document) => r.querySelector(s);
const S = { ui: store.loadSettings(), entries: [], filtered: [], dirHandle: null, dirName: '', readOnly: false, query: '', sort: 'name', ctx: null, tab: 'chart', gen: 0, remembered: null, selPath: null, mode: 'charts', libs: {}, scanning: false };
// Two libraries share the sidebar: chart files (.jhd) and PDF files. The fields below belong to the library that is shown now;
// the other one is parked in S.libs.
const LIBFIELDS = ['entries', 'filtered', 'dirHandle', 'dirName', 'readOnly', 'query', 'sort', 'remembered', 'selPath'];
const emptyLib = () => ({ entries: [], filtered: [], dirHandle: null, dirName: '', readOnly: false, query: '', sort: 'name', remembered: null, selPath: null });
const isPdf = () => S.mode === 'pdf';
const DIRKEY = { charts: 'dir', pdf: 'dir-pdf' };
let reader = null;
const ROW = 46;
const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(b >= 10485760 ? 0 : 1).replace('.', ',') + ' МБ' : Math.max(1, Math.round((b || 0) / 1024)) + ' КБ');

// ---------------------------------------------------------------- wasm
function b64ToBytes(b64) {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------- shell
function mountShell() {
  $('#app').innerHTML = `
  <aside id="side" aria-label="База карт">
    <div class="brand"><h1>Jyotisha Desk</h1><p>Расчёты по файлам .jhd на вашем компьютере</p></div>
    <div class="modes" role="tablist" aria-label="Режим"><button type="button" data-mode="charts" class="on" role="tab">Карты</button><button type="button" data-mode="pdf" role="tab">PDF</button></div>
    <div class="folderbar" id="folderbar"></div>
    <div class="searchbar"><input id="q" type="search" placeholder="Имя, год, место…" aria-label="Поиск по базе" autocomplete="off">
      <select id="sort" aria-label="Сортировка"><option value="name">по имени</option><option value="date">по дате</option></select></div>
    <div id="list" tabindex="0" role="listbox" aria-label="Карты"><div id="spacer"></div></div>
    <div class="sfoot" id="sfoot"></div>
  </aside>
  <main id="main">
    <header id="top"></header>
    <nav id="tabs" aria-label="Разделы"></nav>
    <div id="view" tabindex="-1"></div>
    <div id="pdfapp"></div>
  </main>
  <input type="file" id="fb" webkitdirectory multiple hidden>
  <input type="file" id="fone" accept=".jhd" hidden>
  <dialog id="dlg"></dialog><div id="toast" role="status" aria-live="polite"></div>`;
}

let toastT;
function toast(msg, err = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'on' + (err ? ' err' : '');
  clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, err ? 7000 : 3000);
}

function dialog(html, onOpen) {
  const d = $('#dlg'); d.innerHTML = html;
  d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
  const okBtn = () => d.querySelector('.dlg-actions .primary:not([data-close])');
  d.querySelectorAll('form').forEach((f) => f.addEventListener('submit', (ev) => { ev.preventDefault(); if (okBtn()) okBtn().click(); }));
  d.onkeydown = (ev) => { if (ev.key === 'Enter' && ev.target.matches && ev.target.matches('input:not([type=checkbox])') && okBtn()) { ev.preventDefault(); okBtn().click(); } };
  if (!d.open) d.showModal();
  if (onOpen) onOpen(d);
  return d;
}
function confirmDialog(title, text, okLabel = 'Продолжить') {
  return new Promise((resolve) => {
    const d = dialog(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="dlg-actions"><button class="btn" data-close>Отмена</button><button class="btn primary" id="ok">${esc(okLabel)}</button></div>`);
    let ok = false;
    $('#ok', d).addEventListener('click', () => { ok = true; d.close(); });
    d.addEventListener('close', () => resolve(ok), { once: true });
  });
}

// ---------------------------------------------------------------- sidebar
function entrySearchString(e) {
  if (isPdf()) return e.path.toLowerCase();
  const m = e.meta;
  return (e.path + ' ' + (m ? `${m.place} ${m.country} ${pad(m.d)}.${pad(m.m)}.${m.y} ${m.y}-${pad(m.m)}-${pad(m.d)}` : '')).toLowerCase();
}
function applyFilter() {
  const toks = S.query.toLowerCase().split(/\s+/).filter(Boolean);
  let list = S.entries;
  if (toks.length) list = list.filter((e) => { const s = entrySearchString(e); return toks.every((t) => s.includes(t)); });
  const key = (e) => (e.meta ? e.meta.y * 10000 + e.meta.m * 100 + e.meta.d : 1e9);
  const byName = (a, b) => a.path.localeCompare(b.path, 'ru', { numeric: true });
  if (isPdf()) list = list.slice().sort(S.sort === 'date' ? (a, b) => (b.mtime || 0) - (a.mtime || 0) || byName(a, b) : S.sort === 'size' ? (a, b) => (b.size || 0) - (a.size || 0) || byName(a, b) : byName);
  else list = list.slice().sort(S.sort === 'date' ? (a, b) => key(a) - key(b) || a.path.localeCompare(b.path, 'ru') : byName);
  S.filtered = list;
  renderList();
  renderFoot();
}
function renderList() {
  const el = $('#list'), sp = $('#spacer');
  sp.style.height = S.filtered.length * ROW + 'px';
  const top = el.scrollTop, h = el.clientHeight || 400;
  const a = Math.max(0, Math.floor(top / ROW) - 6), z = Math.min(S.filtered.length, Math.ceil((top + h) / ROW) + 6);
  let html = '';
  for (let i = a; i < z; i++) {
    const e = S.filtered[i], m = e.meta;
    const sub = isPdf() ? (e.bad ? 'не удалось прочитать' : e.mtime === undefined ? '…' : `${fmtSize(e.size)} · ${new Date(e.mtime).toLocaleDateString('ru-RU')}`) : e.bad ? 'не удалось прочитать' : m ? `${pad(m.d)}.${pad(m.m)}.${m.y}${m.place ? ' · ' + m.place : ''}` : '…';
    const dir = e.dirPath ? `${esc(e.dirPath)}` : '';
    html += `<button class="row ${e.path === S.selPath ? 'sel' : ''} ${e.bad ? 'bad' : ''}" role="option" data-i="${i}" style="top:${i * ROW}px" title="${esc(e.path)}"><span class="t">${esc(e.name.replace(/\.(jhd|pdf)$/i, ''))}</span><span class="s">${esc(sub)}${dir ? ' · ' + dir : ''}</span>${isPdf() && e.hasNotes ? '<span class="nb" title="Есть заметки">✎</span>' : ''}</button>`;
  }
  sp.innerHTML = html;
}
function renderFoot(extra = '') {
  const n = S.entries.length, f = S.filtered.length;
  $('#sfoot').textContent = n ? `${f === n ? n : f + ' из ' + n} ${isPdf() ? 'PDF' : 'карт'}${extra ? ' · ' + extra : ''}` : extra;
}
function renderFolderBar() {
  const fb = $('#folderbar');
  const btns = [];
  const cur = S.dirName ? `<div class="cur" title="${esc(S.dirName)}">Папка: <b>${esc(S.dirName)}</b>${S.readOnly ? ' · только чтение' : ''}</div>` : '';
  if (S.remembered && !S.dirName) btns.push(`<button class="sbtn primary" data-side="resume">Продолжить: «${esc(S.remembered.name)}»</button>`);
  btns.push(`<div class="srow"><button class="sbtn ${S.dirName || S.remembered ? '' : 'primary'}" data-side="pick">${S.dirName ? 'Другая папка…' : 'Открыть папку…'}</button>${S.dirName ? '<button class="sbtn" data-side="rescan" title="Перечитать папку">↻</button>' : ''}</div>`);
  btns.push(isPdf() ? `<div class="srow"><button class="sbtn" data-side="file">Открыть файл…</button></div>` : `<div class="srow"><button class="sbtn" data-side="new">Новая карта</button><button class="sbtn" data-side="file">Открыть файл…</button></div>`);
  fb.innerHTML = cur + btns.join('');
}

async function onEntries(entries, label) {
  S.entries = entries; S.gen++;
  const gen = S.gen;
  applyFilter();
  renderFolderBar();
  renderFoot(entries.length ? 'индексирую…' : '');
  const index = isPdf() ? store.indexPdfEntries : store.indexEntries;
  await index(entries, () => { if (gen === S.gen) { applyFilter(); renderFoot('индексирую…'); } }, () => gen !== S.gen);
  if (gen === S.gen) { applyFilter(); renderFoot(label || ''); }
  if (isPdf() && reader) reader.refreshEmpty();
}
async function resumeIndexing() {
  const gen = S.gen, index = isPdf() ? store.indexPdfEntries : store.indexEntries;
  if (!S.entries.length) return;
  renderFoot('индексирую…');
  await index(S.entries, () => { if (gen === S.gen) { applyFilter(); renderFoot('индексирую…'); } }, () => gen !== S.gen);
  if (gen === S.gen) { applyFilter(); renderFoot(''); }
}

async function useDirectory(handle) {
  S.scanning = true;
  try {
    S.dirHandle = handle; S.dirName = handle.name; S.readOnly = false; S.remembered = null;
    renderFolderBar(); renderFoot('читаю папку…');
    await store.rememberDir(handle, DIRKEY[S.mode]);
    const entries = await (isPdf() ? store.scanPdfDirectory : store.scanDirectory)(handle, (n) => renderFoot(`найдено ${n}…`));
    if (!entries.length) toast(isPdf() ? 'В папке нет файлов .pdf (вложенные папки тоже проверены).' : 'В папке нет файлов .jhd (вложенные папки тоже проверены).', true);
    S.scanning = false;
    await onEntries(entries);
  } catch (e) { console.error(e); toast('Не удалось прочитать папку: ' + e.message, true); } finally { S.scanning = false; }
}
async function pickFolder() {
  if (store.hasFSA) {
    try { const h = await window.showDirectoryPicker({ id: isPdf() ? 'pdf-base' : 'jhd-base', mode: 'readwrite' }); await useDirectory(h); }
    catch (e) { if (e.name !== 'AbortError') toast('Папка не выбрана: ' + e.message, true); }
  } else $('#fb').click();
}
async function resumeFolder() {
  const h = S.remembered && S.remembered.handle;
  if (!h) return;
  try {
    if (await store.ensurePermission(h, true)) await useDirectory(h);
    else toast('Доступ к папке не разрешён. Выберите её заново.', true);
  } catch (e) { toast('Не удалось открыть сохранённую папку: ' + e.message, true); }
}

// ---------------------------------------------------------------- current chart
function mkSt() {
  const u = S.ui;
  return { ...A.DEFAULT_SETTINGS, ayanamsa: +u.ayanamsa, trueNode: !!u.trueNode, houseSystem: u.houseSystem, yearLen: +u.yearLen, sunriseCenter: !!u.sunriseCenter, karakas: +u.karakas, charaDir: u.charaDir === 'lagna' ? 'lagna' : 'ninth', charaExaltAdj: !!u.charaExaltAdj };
}
function setCurrent(birth, entry, { dirty = false, keepTab = true } = {}) {
  const st = mkSt();
  const chart = A.computeChart(birth, st);
  S.ctx = { birth, chart, st, ui: S.ui, cache: {}, v: {}, entry, dirty, origFormat: birth.format, rerender: () => renderView() };
  S.selPath = entry ? entry.path : null;
  if (!keepTab) S.tab = 'chart';
  renderAll();
}
function recompute() {
  if (!S.ctx) return;
  const keep = S.ctx.v;
  setCurrent(S.ctx.birth, S.ctx.entry, { dirty: S.ctx.dirty });
  S.ctx.v = keep;
  renderView();
}

async function openPdfEntry(e) {
  S.selPath = e.path; renderList();
  try { ensureReader(); await reader.openEntry(e); } catch (err) { console.error(err); toast(`«${e.name}»: ${err.message}`, true); }
}
async function openListEntry(e) { if (isPdf()) await openPdfEntry(e); else await openEntry(e); }
async function openEntry(e) {
  try {
    const birth = parseJHD(await store.readEntryText(e), e.name);
    setCurrent(birth, e, { dirty: false });
    renderList();
  } catch (err) {
    console.error(err); e.bad = true; renderList();
    toast(`«${e.name}»: ${err.message}`, true);
  }
}

// ---------------------------------------------------------------- top / tabs / view
function renderTop() {
  const c = S.ctx, top = $('#top');
  const right = `<button class="btn" data-top="settings">Настройки</button><button class="btn" data-top="about">О программе</button>`;
  if (!c) { top.innerHTML = `<div class="ttl">Карта не открыта</div>${right}`; return; }
  const fmtName = { old: 'старый формат', new: 'новый формат', short: 'короткий формат' }[c.origFormat] || '';
  top.innerHTML = `<div class="ttl">${esc(c.birth.name || 'Новая карта')}<small>${esc(fmtName)}</small>${c.dirty ? '<span class="dirty">● изменено</span>' : ''}</div>
    <button class="btn" data-top="edit">Править данные</button>
    <button class="btn primary" data-top="save">${c.entry && c.entry.handle ? 'Сохранить' : 'Сохранить…'}</button>
    <button class="btn" data-top="saveas">Сохранить как…</button>${right}`;
}
function renderTabs() {
  $('#tabs').innerHTML = S.ctx ? V.TABS.map(([k, l]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}" role="tab" aria-selected="${S.tab === k}">${l}</button>`).join('') : '';
}
function emptyState() {
  const rem = S.remembered && !S.dirName ? `<button class="btn primary" data-side="resume">Продолжить с папкой «${esc(S.remembered.name)}»</button>` : '';
  const warn = store.hasFSA ? '' : '<p class="flag">Этот браузер не умеет записывать в папки на компьютере. Папку можно открыть только для чтения, «Сохранить» будет скачивать файл. Для полной работы откройте файл в Chrome или Edge.</p>';
  return `<div class="empty"><h2>Откройте папку с картами</h2>
    <p>Приложение читает файлы <code>.jhd</code> прямо из выбранной папки вместе с вложенными, показывает их списком с поиском и считает карту по любому из них. Файлы никуда не отправляются.</p>
    <div class="actions">${rem}<button class="btn ${rem ? '' : 'primary'}" data-side="pick">Открыть папку…</button><button class="btn" data-side="file">Открыть один файл…</button><button class="btn" data-side="new">Создать карту</button></div>
    ${warn}<ul><li>Браузер каждый раз спрашивает разрешение на доступ к папке — это его защита, обойти её нельзя. Последняя папка запоминается, достаточно один раз нажать «Продолжить».</li>
    <li>Если Chrome не даёт выбрать папку целиком (например, «Документы» или «Загрузки»), выберите вложенную.</li>
    <li>Перед записью в важные базы сделайте копию папки: запись файлов проверена на разборе, но не открывалась в самой Jagannatha Hora.</li></ul></div>`;
}
function renderView() {
  const view = $('#view'), sc = view.scrollTop;
  if (!S.ctx) { view.innerHTML = emptyState(); return; }
  try {
    const fn = V.VIEWS[S.tab] || V.VIEWS.chart;
    view.innerHTML = fn(S.ctx);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<section class="card"><h3>Ошибка расчёта</h3><p class="err">${esc(e.message)}</p><p class="note">Проверьте данные карты (дата, время, координаты, пояс) и настройки.</p></section>`;
  }
  view.scrollTop = sc;
}
function renderAll() { renderTop(); renderTabs(); renderView(); }

// ---------------------------------------------------------------- dialogs
function aboutDialog() { dialog(V.aboutHTML() + '<div class="dlg-actions"><button class="btn primary" data-close>Закрыть</button></div>', (d) => { d.scrollTop = 0; }); }

function settingsDialog() {
  const u = S.ui, sel = (v, cur) => (String(v) === String(cur) ? 'selected' : '');
  dialog(`<h2>Настройки</h2><form class="form" id="setf" method="dialog">
    <label class="w3">Стиль карт<select name="style"><option value="south" ${sel('south', u.style)}>Южный</option><option value="north" ${sel('north', u.style)}>Северный</option><option value="both" ${sel('both', u.style)}>Оба рядом</option></select></label>
    <label class="w3">Аянамша<select name="ayanamsa">${T.AYANAMSAS.map((a) => `<option value="${a.id}" ${sel(a.id, u.ayanamsa)}>${esc(a.name)}</option>`).join('')}</select></label>
    <label class="w3">Узлы<select name="trueNode"><option value="0" ${sel(0, +u.trueNode)}>Средние (как в старых картах JHora)</option><option value="1" ${sel(1, +u.trueNode)}>Истинные</option></select></label>
    <label class="w3">Дома (бхавы)<select name="houseSystem"><option value="O" ${sel('O', u.houseSystem)}>Шрипати (Порфирий)</option><option value="P" ${sel('P', u.houseSystem)}>Плацидус</option><option value="K" ${sel('K', u.houseSystem)}>Кох</option><option value="E" ${sel('E', u.houseSystem)}>Равные от Асцендента</option></select></label>
    <label class="w3">Год даш (дней)<select name="yearLen"><option value="365.25" ${sel(365.25, u.yearLen)}>365,25 (юлианский)</option><option value="365.2422" ${sel(365.2422, u.yearLen)}>365,2422 (тропический)</option><option value="365.256363" ${sel(365.256363, u.yearLen)}>365,256363 (сидерический)</option><option value="360" ${sel(360, u.yearLen)}>360 (савана)</option></select></label>
    <label class="w3">Восход Солнца<select name="sunriseCenter"><option value="0" ${sel(0, +u.sunriseCenter)}>Верхний край, с рефракцией</option><option value="1" ${sel(1, +u.sunriseCenter)}>Центр диска, без рефракции</option></select></label>
    <label class="w3">Чара-караки<select name="karakas"><option value="7" ${sel(7, u.karakas)}>7 карак</option><option value="8" ${sel(8, u.karakas)}>8 карак (с Раху)</option></select></label>
    <label class="w3">Градусы в картах<select name="degrees"><option value="1" ${sel(1, +(u.degrees !== false))}>Показывать (Su 12°)</option><option value="0" ${sel(0, +(u.degrees !== false))}>Только знаки</option></select></label>
    <label class="w3">Метки карак в картах<select name="marks"><option value="1" ${sel(1, +(u.marks !== false))}>Показывать (AK, DK…)</option><option value="0" ${sel(0, +(u.marks !== false))}>Скрыть</option></select></label>
    <label class="w3">Уран, Нептун, Плутон<select name="outer"><option value="1" ${sel(1, +(u.outer !== false))}>Показывать (только вывод)</option><option value="0" ${sel(0, +(u.outer !== false))}>Скрыть</option></select></label>
    <label class="w3">Чара-даша: порядок знаков<select name="charaDir"><option value="ninth" ${sel('ninth', u.charaDir)}>По чётности 9-го знака от лагны (Нараси Рао)</option><option value="lagna" ${sel('lagna', u.charaDir)}>По чётности самой лагны</option></select></label>
    <label class="w3">Чара-даша: экзальтация<select name="charaExaltAdj"><option value="0" ${sel(0, +u.charaExaltAdj)}>Без поправки</option><option value="1" ${sel(1, +u.charaExaltAdj)}>±1 год за экзальтацию/падение управителя</option></select></label>
    <p class="hint">Настройки хранятся в этом браузере и действуют на все карты. Если хранилище браузера недоступно, они сохранятся только до закрытия вкладки.</p>
    </form><div class="dlg-actions"><button class="btn" data-close>Отмена</button><button class="btn primary" id="setok">Применить</button></div>`, (d) => {
    $('#setok', d).addEventListener('click', () => {
      const f = new FormData($('#setf', d));
      S.ui = { ...S.ui, style: f.get('style'), ayanamsa: +f.get('ayanamsa'), trueNode: f.get('trueNode') === '1', houseSystem: f.get('houseSystem'), yearLen: +f.get('yearLen'), sunriseCenter: f.get('sunriseCenter') === '1', karakas: +f.get('karakas'), charaDir: f.get('charaDir'), charaExaltAdj: f.get('charaExaltAdj') === '1', degrees: f.get('degrees') === '1', marks: f.get('marks') === '1', outer: f.get('outer') === '1' };
      store.saveSettings(S.ui); d.close();
      if (S.ctx) { S.ctx.ui = S.ui; recompute(); } toast('Настройки применены');
    });
  });
}

function validDate(y, m, d) {
  if (![y, m, d].every(Number.isInteger) || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dim = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= dim;
}
function editDialog(isNew) {
  const base = isNew ? defaultBirth() : S.ctx.birth;
  const v = (x) => esc(x);
  dialog(`<h2>${isNew ? 'Новая карта' : 'Данные рождения'}</h2><form class="form" id="ef" method="dialog">
    <label class="w6">Имя${isNew ? '' : ' (это имя файла, менять его можно через «Сохранить как…»)'}<input name="name" value="${v(base.name || '')}" ${isNew ? '' : 'disabled'} autocomplete="off"></label>
    <label>День<input name="d" type="number" min="1" max="31" value="${base.day}"></label>
    <label>Месяц<input name="m" type="number" min="1" max="12" value="${base.month}"></label>
    <label>Год<input name="y" type="number" value="${base.year}"></label>
    <label>Время местное (чч:мм:сс)<input name="time" value="${fmtHM(base.time)}"></label>
    <label>Часовой пояс (восток +)<input name="tz" value="${fmtTz(base.tzEast)}"></label>
    <label>Летнее время, ч<input name="dst" type="number" step="0.5" value="${base.dst || 0}"></label>
    <label class="w6 cityfield">Город — поиск по атласу (можно по-русски; уточнение через запятую: «Paris, США»)<input name="city" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="citylist" placeholder="Начните вводить название…"><div id="citylist" class="citylist" role="listbox" hidden></div></label>
    <label class="chk w6"><input type="checkbox" name="autotz" checked> Часовой пояс и летнее время подставлять по дате и выбранному городу</label>
    <p class="hint" id="tzinfo"></p>
    <label class="w3">Широта (N +, S −)<input name="lat" value="${Number.isFinite(base.lat) ? v(+base.lat.toFixed(5)) : ''}"></label>
    <label class="w3">Долгота (E +, W −)<input name="lon" value="${Number.isFinite(base.lonEast) ? v(+base.lonEast.toFixed(5)) : ''}"></label>
    <label class="w3">Место<input name="place" value="${v(base.place || '')}"></label>
    <label class="w3">Страна<input name="country" value="${v(base.country || '')}"></label>
    <p class="hint">Координаты принимаются как 28.6139, 28:36:50 N или 77°12'E. Время вводите по часам места рождения; если действовало летнее время, укажите поправку в часах (она вычитается).</p>
    <p class="hint err" id="eerr"></p></form>
    <div class="dlg-actions"><button class="btn" data-close>Отмена</button><button class="btn primary" id="eok">${isNew ? 'Создать' : 'Применить'}</button></div>`, (d) => {
    const F = $('#ef', d);
    // ---- atlas search
    const list = $('#citylist', d), tzinfo = $('#tzinfo', d);
    let found = [], act = -1, zone = null, zoneName = '', pickTimer;
    const hideList = () => { list.hidden = true; F.city.setAttribute('aria-expanded', 'false'); act = -1; };
    const fmtPop = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' млн' : n >= 1000 ? Math.round(n / 1000) + ' тыс.' : String(n));
    const renderList = () => {
      if (!found.length) { list.innerHTML = '<div class="empty-res">Ничего не найдено. Введите координаты вручную.</div>'; list.hidden = false; return; }
      list.innerHTML = found.map((r, i) => `<button type="button" role="option" class="cityopt ${i === act ? 'act' : ''}" data-i="${i}"><b>${esc(r.ru && /[\u0400-\u04FF]/.test(F.city.value) ? r.ru : r.name)}</b>${r.ru && /[\u0400-\u04FF]/.test(F.city.value) ? ` <span class="mut">${esc(r.name)}</span>` : ''}<span class="mut"> · ${esc(r.country)}${r.seat ? ', ' + esc(r.seat) : ''}${/^[A-Z]{2,3}$/.test(r.adm) ? ' (' + esc(r.adm) + ')' : ''} · ${fmtPop(r.pop)} · ${esc(r.zone)}</span></button>`).join('');
      list.hidden = false; F.city.setAttribute('aria-expanded', 'true');
    };
    const applyZone = () => {
      tzinfo.dataset.msg = '';
      if (!zone) { tzinfo.textContent = ''; return; }
      const y = +F.y.value, m = +F.m.value, dd = +F.d.value, time = parseHM(F.time.value), lon = parseCoord(F.lon.value, 'lon');
      if (!validDate(y, m, dd) || Number.isNaN(time)) { tzinfo.textContent = `Зона ${zone}: введите дату и время, чтобы определить пояс.`; return; }
      let zi;
      try { zi = AT.zoneInfo(zone, y, m, dd, time); } catch (e) { tzinfo.textContent = `Зона ${zone}: браузер не смог определить смещение (${e.message}). Введите пояс вручную.`; return; }
      if (!F.autotz.checked) { tzinfo.textContent = `Зона ${zone}. Автоподстановка выключена.`; return; }
      if (zi.lmt && !Number.isNaN(lon)) {
        F.tz.value = fmtTz(lon / 15); F.dst.value = 0;
        tzinfo.textContent = `Зона ${zone}: на ${dd}.${m}.${y} в базе часовых поясов стоит местное среднее время, а не пояс места. Подставлено местное среднее время по долготе (долгота/15 = ${fmtTz(lon / 15)}). Если место жило по другому времени, исправьте вручную.`;
        return;
      }
      F.tz.value = fmtTz(zi.std); F.dst.value = zi.dst;
      tzinfo.textContent = `Зона ${zone} на ${dd}.${m}.${y}: UTC${zi.total >= 0 ? '+' : ''}${fmtTz(zi.total).replace(/^[+]/, '')} = пояс ${fmtTz(zi.std)}${zi.dst ? ` + летнее время ${zi.dst} ч` : ''}. Данные из базы часовых поясов браузера — для старых дат и спорных территорий проверяйте.`;
    };
    // For a chart that already has a place: find the atlas place and compare the chart's zone with the atlas for the birth date (nothing is changed by itself)
    let detected = null;
    // the message is rewritten only when it changes: a re-render between mouse-down and mouse-up on the button would swallow the click
    const setMsg = (html) => { if (tzinfo.dataset.msg !== html) { tzinfo.dataset.msg = html; tzinfo.innerHTML = html; } };
    const checkZone = () => {
      if (!detected) return;
      const y = +F.y.value, m = +F.m.value, dd = +F.d.value, time = parseHM(F.time.value), tz = parseTz(F.tz.value), dst = parseFloat(F.dst.value || '0');
      if (!validDate(y, m, dd) || Number.isNaN(time) || Number.isNaN(tz) || Number.isNaN(dst)) { setMsg(''); return; }
      let zi; try { zi = AT.zoneInfo(detected, y, m, dd, time); } catch { setMsg(''); return; }
      const fmtU = (h) => `UTC${h >= 0 ? '+' : '−'}${fmtTz(Math.abs(h)).replace(/^[+]/, '')}`;
      if (zi.lmt) { setMsg(esc(`Место найдено в атласе (${detected}). На эту дату база часовых поясов даёт местное среднее время, поэтому пояс карты не проверялся.`)); return; }
      if (Math.abs(tz + dst - zi.total) < 1e-6) setMsg(esc(`Пояс проверен: в карте ${fmtU(tz + dst)}, по базе часовых поясов (${detected}) на эту дату — так же.`));
      else setMsg(`<span class="err">В карте ${esc(fmtU(tz + dst))}, а по базе часовых поясов (${esc(detected)}) на ${dd}.${m}.${y} — ${esc(fmtU(zi.total))}.</span> Если это не сделано намеренно, нажмите: <button type="button" class="btn" data-applyzone>Подставить из атласа</button>`);
    };
    tzinfo.addEventListener('click', (ev) => { if (ev.target.closest('[data-applyzone]')) { zone = detected; F.autotz.checked = true; applyZone(); } });
    const pick = (r) => {
      F.lat.value = +r.lat.toFixed(4); F.lon.value = +r.lon.toFixed(4); F.place.value = r.name; F.country.value = r.country;
      F.city.value = r.name + ', ' + r.country; zone = r.zone; zoneName = r.zone; hideList(); applyZone();
    };
    const doSearch = async () => {
      const q = F.city.value.trim();
      if (q.length < 2) { hideList(); return; }
      if (!AT.atlasReady()) { list.innerHTML = '<div class="empty-res">Загружаю атлас…</div>'; list.hidden = false; try { await AT.loadAtlas(); } catch (e) { list.innerHTML = `<div class="empty-res err">Атлас не загрузился: ${esc(e.message)}</div>`; return; } }
      if (F.city.value.trim() !== q) return;
      found = AT.search(q, 12); act = found.length ? 0 : -1; renderList();
    };
    F.city.addEventListener('input', () => { clearTimeout(pickTimer); pickTimer = setTimeout(doSearch, 120); });
    F.city.addEventListener('keydown', (ev) => {
      if (list.hidden) return;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); if (found.length) { act = (act + (ev.key === 'ArrowDown' ? 1 : -1) + found.length) % found.length; renderList(); } }
      else if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); if (found[act]) pick(found[act]); }
      else if (ev.key === 'Escape') { ev.stopPropagation(); ev.preventDefault(); hideList(); }
    });
    list.addEventListener('mousedown', (ev) => { const b = ev.target.closest('.cityopt'); if (b) { ev.preventDefault(); pick(found[+b.dataset.i]); } });
    F.city.addEventListener('blur', () => setTimeout(hideList, 150));
    ['y', 'm', 'd', 'time'].forEach((n) => F[n].addEventListener('change', () => (zone ? applyZone() : checkZone())));
    ['tz', 'dst'].forEach((n) => F[n].addEventListener('change', () => { if (!zone) checkZone(); }));
    F.autotz.addEventListener('change', applyZone);
    F.lon.addEventListener('change', () => { if (zone) applyZone(); });
    void zoneName;
    if (base.place) F.city.value = base.country ? `${base.place}, ${base.country}` : base.place;
    (async () => {
      try { await AT.loadAtlas(); } catch { return; }
      if (!F.isConnected || !Number.isFinite(base.lat) || !Number.isFinite(base.lonEast)) return;
      const m = AT.matchPlace(base.place, base.country, base.lat, base.lonEast);
      if (!m) return;
      if (isNew) { zone = m.zone; applyZone(); } else { detected = m.zone; checkZone(); }
    })();
    $('#eok', d).addEventListener('click', () => {
      const fail = (m) => { $('#eerr', d).textContent = m; };
      const y = +F.y.value, m = +F.m.value, dd = +F.d.value;
      if (!validDate(y, m, dd)) return fail('Такой даты не существует.');
      const time = parseHM(F.time.value), tz = parseTz(F.tz.value), lat = parseCoord(F.lat.value, 'lat'), lon = parseCoord(F.lon.value, 'lon'), dst = parseFloat(F.dst.value || '0');
      if (Number.isNaN(time) || time < 0 || time >= 24) return fail('Время должно быть от 00:00:00 до 23:59:59.');
      if (Number.isNaN(tz) || Math.abs(tz) > 14) return fail('Часовой пояс — число часов от −14 до +14 (например +5:30).');
      if (!F.lat.value.trim() || !F.lon.value.trim()) return fail('Выберите город в поиске по атласу или введите широту и долготу.');
      if (Number.isNaN(lat)) return fail('Широта: число от −90 до 90.');
      if (Number.isNaN(lon)) return fail('Долгота: число от −180 до 180.');
      if (Number.isNaN(dst)) return fail('Летнее время: число часов.');
      const name = isNew ? (F.name.value.trim() || 'Новая карта') : base.name;
      const birth = { name, year: y, month: m, day: dd, time, tzEast: tz, lonEast: lon, lat, place: F.place.value.trim(), country: F.country.value.trim(), altitude: base.altitude || 0, dst, format: isNew ? 'new' : base.format, storedPlanets: null, raw: isNew ? [] : (base.raw || []) };
      try { setCurrent(birth, isNew ? null : S.ctx.entry, { dirty: true }); rememberPlace(birth); d.close(); }
      catch (e) { fail('Не удалось рассчитать: ' + e.message); }
    });
  });
}
// The place of the previous chart is offered for the next new one (nothing is assumed when there is none: the city must be chosen)
let lastPlace = null;
function rememberPlace(b) {
  if (!b.place || !Number.isFinite(b.lat) || !Number.isFinite(b.lonEast)) return;
  lastPlace = { place: b.place, country: b.country || '', lat: b.lat, lon: b.lonEast };
  store.kvSet('lastPlace', lastPlace).catch(() => {});
}
function defaultBirth() {
  const n = new Date(), lp = lastPlace || {};
  return { name: '', year: n.getFullYear(), month: n.getMonth() + 1, day: n.getDate(), time: n.getHours() + n.getMinutes() / 60, tzEast: -n.getTimezoneOffset() / 60,
    lonEast: Number.isFinite(lp.lon) ? lp.lon : NaN, lat: Number.isFinite(lp.lat) ? lp.lat : NaN, place: lp.place || '', country: lp.country || '', altitude: 0, dst: 0, format: 'new', raw: [] };
}

// ---------------------------------------------------------------- saving
const safeName = (s) => s.replace(/[\\/:*?"<>|\r\n]+/g, '_').replace(/^\.+/, '').trim();
async function saveCurrent() {
  const c = S.ctx; if (!c) return;
  if (!(c.entry && c.entry.handle)) return saveAs();
  const text = serializeJHD(c.birth);
  if (c.origFormat !== 'new' || store.encodeLatin1(text).lossy) {
    const why = c.origFormat !== 'new' ? 'Файл в старом или коротком формате; он будет записан в новом формате (18 строк, без сохранённых позиций планет).' : '';
    const lossy = store.encodeLatin1(text).lossy ? ' Символы вне Latin-1 в названии места заменятся на «?», как требует ANSI-формат JHora.' : '';
    if (!(await confirmDialog('Перезаписать файл?', `${why}${lossy} Рекомендуем иметь копию.`, 'Перезаписать'))) return;
  }
  try {
    await store.writeEntry(c.entry, text);
    c.dirty = false; c.origFormat = 'new'; c.birth.format = 'new'; renderTop(); toast(`Сохранено: ${c.entry.name}`);
  } catch (e) { console.error(e); toast('Не удалось записать файл: ' + e.message, true); }
}
function saveAs() {
  const c = S.ctx; if (!c) return;
  const def = (c.entry ? c.entry.name.replace(/\.jhd$/i, '') : c.birth.name || 'Новая карта');
  dialog(`<h2>Сохранить как…</h2><form class="form" method="dialog" id="sf"><label class="w6">Имя файла<input name="n" value="${esc(def)}" autocomplete="off"></label>
    <p class="hint">${S.dirHandle ? `Файл будет создан в ${c.entry && c.entry.dir && c.entry.dirPath ? 'папке «' + esc(c.entry.dirPath) + '»' : 'открытой папке «' + esc(S.dirName) + '»'}.` : 'Папка не открыта с правом записи — файл будет скачан в «Загрузки».'}</p></form>
    <div class="dlg-actions"><button class="btn" data-close>Отмена</button><button class="btn primary" id="sok">Сохранить</button></div>`, (d) => {
    $('#sok', d).addEventListener('click', async () => {
      let name = safeName($('#sf', d).n.value); if (!name) return;
      if (!/\.jhd$/i.test(name)) name += '.jhd';
      const text = serializeJHD(c.birth);
      try {
        if (S.dirHandle && !S.readOnly) {
          const dir = (c.entry && c.entry.dir) || S.dirHandle;
          let exists = false; try { await dir.getFileHandle(name); exists = true; } catch { /* new file */ }
          if (exists && !(await confirmDialog('Файл уже есть', `«${name}» будет перезаписан.`, 'Перезаписать'))) return;
          const fh = await store.writeFileIn(dir, name, text);
          const prefix = (c.entry && c.entry.dirPath) || '';
          let e = S.entries.find((x) => x.path === prefix + name);
          if (!e) { e = { name, path: prefix + name, dirPath: prefix, handle: fh, dir }; S.entries.push(e); }
          e.handle = fh; e.dir = dir; e.meta = { y: c.birth.year, m: c.birth.month, d: c.birth.day, time: c.birth.time, place: c.birth.place, country: c.birth.country, lat: c.birth.lat, lon: c.birth.lonEast }; e.bad = false;
          c.entry = e; c.birth.name = name.replace(/\.jhd$/i, ''); c.dirty = false; c.origFormat = 'new'; c.birth.format = 'new'; S.selPath = e.path;
          applyFilter(); renderTop(); toast(`Сохранено: ${name}`);
        } else {
          store.downloadText(name, text); c.dirty = false; renderTop(); toast(`Файл «${name}» скачан`);
        }
        d.close();
      } catch (e) { console.error(e); toast('Не удалось сохранить: ' + e.message, true); }
    });
  });
}

// ---------------------------------------------------------------- modes: charts / PDF
function ensureReader() {
  if (reader) return reader;
  reader = createReader($('#pdfapp'), {
    toast, dialog, confirm: confirmDialog, about: aboutDialog,
    ui: () => S.ui, saveUi: (patch) => { S.ui = { ...S.ui, ...patch }; store.saveSettings(S.ui); },
    hasFolder: () => isPdf() && (!!S.dirName || S.entries.length > 0),
    openLoose: (e) => openLoosePdf(e),
  });
  return reader;
}
function applyMode() {
  const pdf = isPdf();
  $('#main').classList.toggle('pdfmode', pdf);
  document.querySelectorAll('.modes button').forEach((b) => { b.classList.toggle('on', b.dataset.mode === S.mode); b.setAttribute('aria-selected', String(b.dataset.mode === S.mode)); });
  $('.brand p').textContent = pdf ? 'Чтение PDF и заметки на вашем компьютере' : 'Расчёты по файлам .jhd на вашем компьютере';
  $('#side').setAttribute('aria-label', pdf ? 'Папка с PDF' : 'База карт');
  $('#list').setAttribute('aria-label', pdf ? 'PDF-файлы' : 'Карты');
  const q = $('#q'); q.value = S.query; q.placeholder = pdf ? 'Название, папка…' : 'Имя, год, место…';
  const sort = $('#sort'); sort.innerHTML = '<option value="name">по имени</option><option value="date">по дате</option>' + (pdf ? '<option value="size">по размеру</option>' : ''); sort.value = S.sort;
  renderFolderBar(); applyFilter();
  if (pdf) { ensureReader(); reader.setActive(true); reader.refreshEmpty(); } else if (reader) reader.setActive(false);
  if (S.entries.some((e) => (pdf ? e.mtime === undefined : !e.meta) && !e.bad)) resumeIndexing();
}
async function setMode(m) {
  if (m === S.mode) return;
  if (S.scanning) { toast('Подождите, пока дочитается папка.', true); return; }
  const cur = {}; for (const k of LIBFIELDS) cur[k] = S[k];
  S.libs[S.mode] = cur; S.gen++;
  const next = S.libs[m] || emptyLib();
  for (const k of LIBFIELDS) S[k] = next[k];
  S.mode = m; S.ui = { ...S.ui, mode: m }; store.saveSettings(S.ui);
  applyMode();
}

// ---------------------------------------------------------------- wiring
function wire() {
  document.querySelector('.modes').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
  $('#q').addEventListener('input', (e) => { S.query = e.target.value; $('#list').scrollTop = 0; applyFilter(); });
  $('#sort').addEventListener('change', (e) => { S.sort = e.target.value; applyFilter(); });
  $('#list').addEventListener('scroll', renderList, { passive: true });
  window.addEventListener('resize', renderList);
  $('#list').addEventListener('click', (e) => { const b = e.target.closest('.row'); if (b) openListEntry(S.filtered[+b.dataset.i]); });
  $('#list').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = S.filtered.findIndex((x) => x.path === S.selPath), n = Math.max(0, Math.min(S.filtered.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    if (S.filtered[n]) { if (isPdf()) { S.selPath = S.filtered[n].path; renderList(); clearTimeout(wire.pt); wire.pt = setTimeout(() => openPdfEntry(S.filtered[n]), 300); } else openEntry(S.filtered[n]); const l = $('#list'); if (n * ROW < l.scrollTop) l.scrollTop = n * ROW; else if ((n + 1) * ROW > l.scrollTop + l.clientHeight) l.scrollTop = (n + 1) * ROW - l.clientHeight; }
  });
  document.addEventListener('click', (e) => {
    const side = e.target.closest('[data-side]');
    if (side) {
      const k = side.dataset.side;
      if (k === 'pick') pickFolder(); else if (k === 'resume') resumeFolder();
      else if (k === 'rescan' && S.dirHandle) useDirectory(S.dirHandle);
      else if (k === 'new') editDialog(true);
      else if (k === 'file') openSingleFile();
      return;
    }
    const top = e.target.closest('[data-top]');
    if (top) {
      const k = top.dataset.top;
      if (k === 'settings') settingsDialog(); else if (k === 'about') aboutDialog();
      else if (k === 'edit') editDialog(false); else if (k === 'save') saveCurrent(); else if (k === 'saveas') saveAs();
      return;
    }
    const tb = e.target.closest('[data-tab]');
    if (tb) { S.tab = tb.dataset.tab; renderTabs(); renderView(); $('#view').scrollTop = 0; return; }
    const act = e.target.closest('#view [data-act]');
    if (act && S.ctx && V.actions[act.dataset.act]) { if (V.actions[act.dataset.act](S.ctx, act)) renderView(); }
  });
  $('#view').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches && e.target.matches('tr.clickrow')) e.target.click(); });
  $('#view').addEventListener('change', (e) => {
    const el = e.target, c = S.ctx; if (!c) return;
    if (el.dataset.change && V.changes[el.dataset.change]) { if (V.changes[el.dataset.change](c, el)) renderView(); return; }
    for (const [attr, tabName] of Object.entries(V.groups)) {
      if (el.dataset[attr] !== undefined) {
        const g = (c.v[tabName] ||= {}); g[el.dataset[attr]] = el.type === 'checkbox' ? el.checked : el.value;
        renderView(); return;
      }
    }
  });
  $('#fb').addEventListener('change', async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length) return;
    const entries = isPdf() ? store.pdfEntriesFromFileList(files) : store.entriesFromFileList(files);
    S.dirHandle = null; S.readOnly = true; S.dirName = (files[0].webkitRelativePath || '').split('/')[0] || 'папка'; S.remembered = null;
    if (!entries.length) toast(isPdf() ? 'В выбранной папке нет файлов .pdf.' : 'В выбранной папке нет файлов .jhd.', true);
    await onEntries(entries);
  });
  $('#fone').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (isPdf()) await openLoosePdf({ name: f.name, path: f.name, dirPath: '', file: f }); else await openLooseFile({ name: f.name, path: f.name, dirPath: '', file: f });
  });
  window.addEventListener('beforeunload', (e) => { if (S.ctx && S.ctx.dirty) { e.preventDefault(); e.returnValue = ''; } });
}
async function openSingleFile() {
  if (window.showOpenFilePicker) {
    try {
      const [h] = await window.showOpenFilePicker(isPdf() ? { types: [{ description: 'Документы PDF', accept: { 'application/pdf': ['.pdf'] } }] } : { types: [{ description: 'Карты Jagannatha Hora', accept: { 'application/octet-stream': ['.jhd'] } }] });
      if (isPdf()) await openLoosePdf({ name: h.name, path: h.name, dirPath: '', handle: h, dir: null }); else await openLooseFile({ name: h.name, path: h.name, dirPath: '', handle: h, dir: null });
    } catch (e) { if (e.name !== 'AbortError') toast(e.message, true); }
  } else { $('#fone').accept = isPdf() ? '.pdf' : '.jhd'; $('#fone').click(); }
}
async function openLoosePdf(entry) {
  if (!isPdf()) await setMode('pdf');
  await openPdfEntry(entry);
  S.selPath = null; renderList();
}
async function openLooseFile(entry) {
  await openEntry(entry);
  if (S.ctx) { S.selPath = null; }
}

// ---------------------------------------------------------------- start
async function start() {
  mountShell();
  renderFolderBar(); renderFoot(''); renderTop(); renderTabs(); renderView();
  wire();
  store.kvGet('lastPlace').then((p) => { if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) lastPlace = p; }).catch(() => {});
  try {
    await initSwe(createModule, b64ToBytes(window.__SWE_WASM__));
    delete window.__SWE_WASM__;
  } catch (e) {
    console.error(e);
    $('#view').innerHTML = `<div class="empty"><h2>Не запустились эфемериды</h2><p class="err">${esc(e.message)}</p></div>`;
    return;
  }
  if (store.hasFSA) {
    const h = await store.recallDir(DIRKEY.charts), hp = await store.recallDir(DIRKEY.pdf);
    if (h) { S.remembered = { name: h.name, handle: h }; renderFolderBar(); renderView(); }
    S.libs.pdf = { ...emptyLib(), remembered: hp ? { name: hp.name, handle: hp } : null };
  }
  if (S.ui.mode === 'pdf') await setMode('pdf');
  setTimeout(() => AT.loadAtlas().catch((e) => console.warn('atlas', e.message)), 1500);
  window.__appReady = true;
}
start();
// exposed for automated checks
window.__app = { S, setCurrent, openEntry, applyFilter, parseJHD, useDirectory, saveCurrent, setMode, openPdfEntry, get reader() { return reader; } };
