// PDF reader: continuous scrolling with lazily rendered pages, zoom, text selection, highlights and notes saved next to the PDF,
// table of contents, full-text search and internal links. Rendering is done by pdf.js (Mozilla, Apache-2.0).
import { loadPdfJs, newWorkerPort, DOC_OPTIONS } from './pdfjs_loader.js';
import { Notes, COLORS, colorHex } from './pdfnotes.js';
import { esc } from './util.js';
import * as store from './store.js';

const CSS_UNITS = 96 / 72, GAP = 12, PAD = 16, MIN_Z = 0.1, MAX_Z = 8, MAX_PX = 2 ** 24, MAX_H = 3e7;
const PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const BUBBLE = '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M3 2.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H9.5L5 18.5V14.5H3A1.5 1.5 0 0 1 1.5 13V4A1.5 1.5 0 0 1 3 2.5z" fill="currentColor" stroke="rgba(0,0,0,.55)" stroke-width="1"/><path d="M5 6.5h10M5 9h10M5 11.5h6" stroke="rgba(0,0,0,.55)" stroke-width="1.2" fill="none"/></svg>';
const normFind = (s) => s.replace(/ё/g, 'е').replace(/Ё/g, 'Е').toLowerCase();

export function createReader(root, hooks) {
  let lib = null, task = null, worker = null, doc = null;
  let entry = null, fp = '', N = 0, gen = 0, active = false;
  let sizes = [], known = [], zoom = 1, fit = 'width', S = CSS_UNITS, tops = [], totalH = 0, contentW = 0;
  const views = new Map();
  let notes = null, unsubNotes = null, tool = null, night = !!hooks.ui().pdfNight, panelTab = hooks.ui().pdfPanel || null;
  let curPage = 1, color = 'y', flashId = null, mouseDown = false, pendingSel = null, cardId = null, noteFilter = '';
  const back = [];
  let outline = null, outlineFor = '';
  const find = { token: 0, q: '', results: [], byPage: new Map(), cur: -1, running: false, scanned: 0 };
  const idxCache = new Map();
  const queue = []; let running = 0;
  let el = {};

  // ================================================================ DOM
  function mount() {
    root.innerHTML = `
    <div class="pdfbar" role="toolbar" aria-label="Панель чтения PDF">
      <div class="pb-title" id="pb-title" title=""></div>
      <div class="pb-group">
        <button class="pb" data-pa="back" title="Вернуться на прежнее место (после перехода по ссылке или из оглавления). Alt и ←" aria-label="Назад по истории">↩</button>
        <button class="pb" data-pa="prev" title="Предыдущая страница" aria-label="Предыдущая страница">▲</button>
        <input id="pb-page" class="pb-page" inputmode="numeric" aria-label="Номер страницы" autocomplete="off" size="4">
        <span class="pb-of">из <b id="pb-total">–</b></span>
        <button class="pb" data-pa="next" title="Следующая страница" aria-label="Следующая страница">▼</button>
      </div>
      <div class="pb-group">
        <button class="pb" data-pa="zoomout" title="Уменьшить (Ctrl и −, или Ctrl и колесо мыши)" aria-label="Уменьшить">−</button>
        <select id="pb-zoom" aria-label="Масштаб"></select>
        <button class="pb" data-pa="zoomin" title="Увеличить (Ctrl и +, или Ctrl и колесо мыши)" aria-label="Увеличить">+</button>
        <button class="pb" data-pa="fitw" title="По ширине окна">По ширине</button>
        <button class="pb" data-pa="fitp" title="Страница целиком">Целиком</button>
      </div>
      <div class="pb-group">
        <button class="pb tool" data-pa="pin" aria-pressed="false" title="Метка с заметкой: нажмите здесь, затем на нужное место страницы. Подсветка и комментарий к тексту: выделите текст мышью.">✎ Заметка</button>
        <button class="pb" data-pa="night" aria-pressed="false" title="Тёмная бумага для чтения вечером">Ночь</button>
      </div>
      <div class="pb-group pb-end">
        <button class="pb" data-pa="p-search" title="Поиск по тексту (Ctrl и F)">Поиск</button>
        <button class="pb" data-pa="p-notes">Заметки <span id="pb-nc" class="pb-badge"></span></button>
        <button class="pb" data-pa="p-toc">Оглавление</button>
        <button class="pb" data-pa="about">О программе</button>
      </div>
    </div>
    <div class="pdfbody">
      <div class="pdfscroll" id="ps" tabindex="0" aria-label="Страницы документа"><div class="pages" id="pages"></div></div>
      <div class="pdfstate" id="pstate"></div>
      <aside class="pdfpanel" id="pp" hidden aria-label="Боковая панель"></aside>
    </div>
    <div class="selbar" id="selbar" hidden role="toolbar" aria-label="Действия с выделенным текстом"></div>
    <div class="ncard" id="ncard" hidden role="dialog" aria-label="Заметка"></div>`;
    el = { bar: root.querySelector('.pdfbar'), title: root.querySelector('#pb-title'), page: root.querySelector('#pb-page'), total: root.querySelector('#pb-total'), zoom: root.querySelector('#pb-zoom'),
      scroller: root.querySelector('#ps'), pages: root.querySelector('#pages'), state: root.querySelector('#pstate'), panel: root.querySelector('#pp'), selbar: root.querySelector('#selbar'), card: root.querySelector('#ncard'), nc: root.querySelector('#pb-nc') };
    el.zoom.innerHTML = '<option value="fitw">По ширине</option><option value="fitp">Целиком</option><option value="custom" hidden>100%</option>' + PRESETS.map((z) => `<option value="${z}">${Math.round(z * 100)}%</option>`).join('');
    el.selbar.innerHTML = `<div class="colors">${COLORS.map((c) => `<button type="button" class="cdot" data-c="${c.id}" style="--c:${c.hex}" title="Подсветить: ${c.name}" aria-label="Подсветить: ${c.name}"></button>`).join('')}</div>
      <button type="button" class="sb" data-sa="ul">Подчеркнуть</button><button type="button" class="sb" data-sa="note">Комментарий…</button><button type="button" class="sb" data-sa="copy">Копировать</button>`;
    showEmpty();
    updateToolbar();
  }

  function showState(html) { el.state.innerHTML = html; el.state.hidden = !html; }
  function showEmpty() {
    const hasFolder = hooks.hasFolder();
    showState(`<div class="pdfhello"><h2>Читалка PDF</h2><p>${hasFolder ? 'Выберите файл в списке слева.' : 'Откройте папку с PDF-файлами (вложенные папки тоже читаются) или один файл.'}</p>
      ${hasFolder ? '' : '<div class="actions"><button class="btn primary" data-side="pick">Открыть папку…</button><button class="btn" data-side="file">Открыть файл…</button></div>'}
      <ul><li>Масштаб: кнопки, список, Ctrl и колесо мыши (или щипок на тачпаде), «По ширине», «Целиком».</li>
      <li>Выделите текст, чтобы подсветить его цветом или добавить комментарий. Кнопка «✎ Заметка» ставит метку на любое место страницы.</li>
      <li>Заметки сохраняются в файле рядом с PDF (<code>имя.pdf.notes.json</code>), сам PDF не меняется.</li></ul></div>`);
  }

  // ================================================================ layout
  function scrollerH() { return el.scroller.clientHeight || 600; }
  function layout() {
    S = zoom * CSS_UNITS;
    tops = new Array(N); let y = PAD, maxW = 0;
    for (let i = 0; i < N; i++) { tops[i] = y; y += sizes[i][1] * S + GAP; if (sizes[i][0] * S > maxW) maxW = sizes[i][0] * S; }
    totalH = Math.max(0, y - GAP + PAD);
    contentW = Math.max(maxW + 2 * PAD, el.scroller.clientWidth);
    el.pages.style.width = contentW + 'px'; el.pages.style.height = totalH + 'px';
    for (const v of views.values()) placeView(v);
  }
  function placeView(v) {
    const [w, h] = sizes[v.n - 1], W = w * S, H = h * S, st = v.el.style;
    st.width = W + 'px'; st.height = H + 'px'; st.left = (contentW - W) / 2 + 'px'; st.top = tops[v.n - 1] + 'px';
    st.setProperty('--scale-factor', S);
  }
  function pageAtY(y) {
    let lo = 0, hi = N - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (tops[mid] <= y) lo = mid; else hi = mid - 1; }
    return lo;
  }
  function fitZoom(mode) {
    const [w, h] = sizes[curPage - 1] || sizes[0], sc = el.scroller;
    const sbw = Math.max(sc.offsetWidth - sc.clientWidth, 15), availW = sc.offsetWidth - sbw - 2 * PAD, availH = scrollerH() - 2 * PAD;
    const zw = availW / (w * CSS_UNITS);
    return mode === 'width' ? zw : Math.min(zw, availH / (h * CSS_UNITS));
  }
  function maxZoomFor() { let sum = 0; for (let i = 0; i < N; i++) sum += sizes[i][1]; return Math.max(MIN_Z, (MAX_H - N * GAP) / (sum * CSS_UNITS)); }

  function setZoom(z, { fitMode = null, anchorY, anchorX } = {}) {
    if (!N) return;
    z = clamp(z, MIN_Z, Math.min(MAX_Z, maxZoomFor()));
    const sc = el.scroller, ay = anchorY ?? scrollerH() / 2, ax = anchorX ?? sc.clientWidth / 2;
    const y = sc.scrollTop + ay, p = pageAtY(y), frac = (y - tops[p]) / Math.max(1, sizes[p][1] * S);
    const sx = (sc.scrollLeft + ax) / Math.max(1, sc.scrollWidth);
    zoom = z; fit = fitMode;
    layout();
    sc.scrollTop = tops[p] + frac * sizes[p][1] * S - ay;
    sc.scrollLeft = fitMode ? 0 : sx * sc.scrollWidth - ax;
    for (const v of views.values()) if (v.renderedScale !== S) v.stale = true;
    ensureViews();
    clearTimeout(setZoom.t); setZoom.t = setTimeout(update, 110);
    updateZoomUi(); updateCurrent(); saveViewSoon();
  }
  function updateZoomUi() {
    const pct = Math.round(zoom * 100), z = el.zoom, o = (v) => z.querySelector(`option[value="${v}"]`);
    o('fitw').textContent = fit === 'width' ? `По ширине (${pct}%)` : 'По ширине';
    o('fitp').textContent = fit === 'page' ? `Целиком (${pct}%)` : 'Целиком';
    const preset = PRESETS.find((p) => Math.abs(p - zoom) < 0.004);
    o('custom').textContent = pct + '%';
    z.value = fit === 'width' ? 'fitw' : fit === 'page' ? 'fitp' : preset ? String(preset) : 'custom';
  }
  function zoomStep(dir, opts) {
    const next = dir > 0 ? PRESETS.find((p) => p > zoom * 1.004) : [...PRESETS].reverse().find((p) => p < zoom / 1.004);
    setZoom(next ?? (dir > 0 ? MAX_Z : MIN_Z), opts);
  }

  // ================================================================ pages
  function createView(n) {
    const d = document.createElement('div');
    d.className = 'pg'; d.dataset.n = n;
    d.innerHTML = '<div class="pg-wait">Стр. ' + n + '</div><div class="pg-hl"></div><div class="textLayer"></div><div class="pg-links"></div><div class="pg-pins"></div>';
    const v = { n, el: d, canvas: null, hl: d.querySelector('.pg-hl'), tlEl: d.querySelector('.textLayer'), links: d.querySelector('.pg-links'), pins: d.querySelector('.pg-pins'), tl: null, token: 0, renderedScale: 0, stale: true, state: 'new', destroyed: false, queued: false, textStarted: false, task: null };
    v.textReady = new Promise((res) => { v.resolveText = res; });
    el.pages.appendChild(d); views.set(n, v); placeView(v); buildOverlays(v);
    return v;
  }
  function destroyView(v) {
    v.destroyed = true; v.token++;
    try { v.task && v.task.cancel(); } catch { /* ignore */ }
    try { v.tl && v.tl.cancel(); } catch { /* ignore */ }
    v.el.remove(); views.delete(v.n);
    if (doc) doc.getPage(v.n).then((p) => p.cleanup()).catch(() => {});
  }
  function visibleRange(margin) {
    const t = el.scroller.scrollTop;
    return [pageAtY(Math.max(0, t - margin)), pageAtY(t + scrollerH() + margin)];
  }
  function ensureViews() {
    if (!N || !active) return;
    const h = scrollerH(), [a, z] = visibleRange(h * 0.7);
    for (let i = a; i <= z; i++) if (!views.has(i + 1)) createView(i + 1);
    for (const [n, v] of views) if (n - 1 < a - 3 || n - 1 > z + 3) destroyView(v);
  }
  function update() {
    if (!N || !active) return;
    ensureViews();
    for (const v of views.values()) if (v.stale || v.state === 'new') enqueue(v);
  }
  function enqueue(v) { if (v.queued || v.destroyed) return; v.queued = true; queue.push(v); pump(); }
  function pump() {
    while (running < 2 && queue.length) {
      queue.sort((p, q) => Math.abs(p.n - curPage) - Math.abs(q.n - curPage));
      const v = queue.shift();
      if (v.destroyed) { v.queued = false; continue; }
      running++;
      renderView(v).catch((e) => console.warn('render', v.n, e)).finally(() => { running--; v.queued = false; if (v.stale && !v.destroyed) enqueue(v); pump(); });
    }
  }
  async function renderView(v) {
    const myGen = gen, token = ++v.token;
    try { v.task && v.task.cancel(); } catch { /* ignore */ }
    v.state = 'rendering'; v.stale = false;
    const page = await doc.getPage(v.n);
    if (myGen !== gen || v.destroyed || token !== v.token) return;
    const vp = page.getViewport({ scale: S }), W = vp.width, H = vp.height;
    let out = Math.min(window.devicePixelRatio || 1, 3);
    if (W * H * out * out > MAX_PX) out = Math.sqrt(MAX_PX / (W * H));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(W * out)); canvas.height = Math.max(1, Math.floor(H * out));
    try {
      v.task = page.render({ canvas, viewport: vp, transform: out !== 1 ? [out, 0, 0, out, 0, 0] : null });
      await v.task.promise;
    } catch (e) {
      if (e && e.name === 'RenderingCancelledException') return;
      v.state = 'error'; v.el.querySelector('.pg-wait')?.replaceChildren(document.createTextNode('Не удалось отобразить страницу: ' + (e && e.message ? e.message : e)));
      return;
    }
    if (myGen !== gen || v.destroyed || token !== v.token) return;
    if (v.canvas) v.canvas.remove();
    v.canvas = canvas; v.el.insertBefore(canvas, v.el.firstChild);
    v.el.querySelector('.pg-wait')?.remove();
    v.renderedScale = S; v.state = 'rendered';
    if (!v.textStarted) { v.textStarted = true; buildText(v, page, vp, myGen); buildLinks(v, page, myGen); }
  }
  async function buildText(v, page, vp, myGen) {
    try {
      v.tl = new lib.TextLayer({ textContentSource: page.streamTextContent({ includeMarkedContent: false, disableNormalization: true }), container: v.tlEl, viewport: vp });
      await v.tl.render();
    } catch (e) { if (!(e && e.name === 'AbortException')) console.warn('text layer', e); }
    if (myGen !== gen || v.destroyed) return;
    v.resolveText();
    if (flashId) flashNote(flashId);
    if (find.q) applyFindHighlights();
  }
  async function buildLinks(v, page, myGen) {
    let anns = [];
    try { anns = await page.getAnnotations({ intent: 'display' }); } catch { return; }
    if (myGen !== gen || v.destroyed) return;
    const vp1 = page.getViewport({ scale: 1 });
    for (const a of anns) {
      if (a.subtype !== 'Link' || !a.rect || !(a.dest || a.url || a.unsafeUrl)) continue;
      const r = vp1.convertToViewportRectangle(a.rect), x = Math.min(r[0], r[2]), y = Math.min(r[1], r[3]), w = Math.abs(r[2] - r[0]), h = Math.abs(r[3] - r[1]);
      const link = document.createElement('a');
      link.className = 'lnk'; link.setAttribute('role', 'link');
      link.style.cssText = `left:${(x / vp1.width) * 100}%;top:${(y / vp1.height) * 100}%;width:${(w / vp1.width) * 100}%;height:${(h / vp1.height) * 100}%`;
      const url = a.url || a.unsafeUrl;
      link.title = url ? url : 'Перейти по ссылке внутри документа';
      link.addEventListener('click', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        if (a.dest) goToDest(a.dest);
        else if (/^(https?:|mailto:)/i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
      });
      v.links.appendChild(link);
    }
  }

  // ================================================================ navigation
  function curFrac() { const p = pageAtY(el.scroller.scrollTop); return { page: p + 1, frac: clamp((el.scroller.scrollTop - tops[p]) / Math.max(1, sizes[p][1] * S), 0, 1) }; }
  function updateCurrent() {
    if (!N) return;
    const y = el.scroller.scrollTop + Math.min(scrollerH() * 0.3, 220), p = pageAtY(y) + 1;
    if (p !== curPage) { curPage = p; }
    if (document.activeElement !== el.page) el.page.value = String(curPage);
  }
  function pushBack() { const c = curFrac(); const last = back[back.length - 1]; if (!last || last.page !== c.page || Math.abs(last.frac - c.frac) > 0.02) { back.push(c); if (back.length > 40) back.shift(); } updateToolbar(); }
  function goToPage(n, frac = 0, { push = true } = {}) {
    if (!N) return;
    n = clamp(Math.round(+n) || 1, 1, N);
    if (push) pushBack();
    el.scroller.scrollTop = frac > 0 ? tops[n - 1] + frac * sizes[n - 1][1] * S - 70 : tops[n - 1] - PAD / 2;
    updateCurrent(); update(); saveViewSoon();
  }
  async function destToLocation(dest) {
    let d = dest;
    if (typeof d === 'string') d = await doc.getDestination(d);
    if (!Array.isArray(d)) return null;
    const ref = d[0]; let idx;
    if (ref && typeof ref === 'object') idx = await doc.getPageIndex(ref); else if (Number.isInteger(ref)) idx = ref; else return null;
    let y = null; const kind = d[1] && d[1].name;
    if (kind === 'XYZ') y = d[3]; else if (kind === 'FitH' || kind === 'FitBH') y = d[2];
    let frac = 0;
    if (y !== null && y !== undefined && Number.isFinite(y)) {
      const page = await doc.getPage(idx + 1);
      if (!page.rotate) { const [, y0, , y1] = page.view; frac = clamp((y1 - y) / Math.max(1, y1 - y0), 0, 1); }
    }
    return { page: idx + 1, frac };
  }
  async function goToDest(dest) {
    try { const loc = await destToLocation(dest); if (loc) goToPage(loc.page, loc.frac); else hooks.toast('Не удалось определить, куда ведёт ссылка.', true); } catch (e) { hooks.toast('Ссылка не открылась: ' + e.message, true); }
  }
  function goBack() { const b = back.pop(); if (b) { goToPage(b.page, b.frac, { push: false }); } updateToolbar(); }

  // ================================================================ notes: overlays
  function buildOverlays(v) {
    if (!notes) { v.hl.innerHTML = ''; v.pins.innerHTML = ''; return; }
    let hl = '', pins = '';
    for (const n of notes.byPage(v.n)) {
      const c = colorHex(n.color);
      if (n.type === 'pin') {
        pins += `<button type="button" class="pin ${flashId === n.id ? 'flash' : ''}" data-id="${n.id}" style="left:${n.x * 100}%;top:${n.y * 100}%;--c:${c}" title="${esc(n.text.slice(0, 200) || 'Заметка')}" aria-label="Заметка">${BUBBLE}</button>`;
        continue;
      }
      for (const r of n.rects) hl += `<i class="hl ${n.style} ${flashId === n.id ? 'flash' : ''}" data-id="${n.id}" style="left:${r[0] * 100}%;top:${r[1] * 100}%;width:${r[2] * 100}%;height:${r[3] * 100}%;--c:${c}"></i>`;
      if (n.text) {
        const first = n.rects.reduce((a, b) => (b[1] < a[1] || (b[1] === a[1] && b[0] < a[0]) ? b : a));
        pins += `<button type="button" class="pin mark ${flashId === n.id ? 'flash' : ''}" data-id="${n.id}" style="left:${(first[0] + first[2]) * 100}%;top:${first[1] * 100}%;--c:${c}" title="${esc(n.text.slice(0, 200))}" aria-label="Комментарий">${BUBBLE}</button>`;
      }
    }
    v.hl.innerHTML = hl; v.pins.innerHTML = pins;
  }
  function flashNote(id) {
    flashId = id;
    el.pages.querySelectorAll(`[data-id="${id}"]`).forEach((e) => { e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); });
    clearTimeout(flashNote.t); flashNote.t = setTimeout(() => { flashId = null; el.pages.querySelectorAll('.flash').forEach((e) => e.classList.remove('flash')); }, 2600);
  }

  // ================================================================ notes: selection → highlight
  function mergeLines(rs) {
    rs.sort((a, b) => a.top - b.top || a.left - b.left);
    const out = [];
    for (const r of rs) {
      const cy = (r.top + r.bottom) / 2, h = r.bottom - r.top;
      let tgt = null;
      for (let i = out.length - 1; i >= 0 && i >= out.length - 6; i--) {
        const o = out[i], oc = (o.top + o.bottom) / 2, oh = o.bottom - o.top;
        if (Math.abs(oc - cy) < 0.5 * Math.min(h, oh) && r.left <= o.right + 0.9 * Math.max(h, oh) && r.right >= o.left - 0.9 * Math.max(h, oh)) { tgt = o; break; }
      }
      if (tgt) { tgt.left = Math.min(tgt.left, r.left); tgt.right = Math.max(tgt.right, r.right); tgt.top = Math.min(tgt.top, r.top); tgt.bottom = Math.max(tgt.bottom, r.bottom); } else out.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
    return out;
  }
  function collectSelection() {
    const sel = getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return [];
    const range = sel.getRangeAt(0), out = [];
    for (const v of [...views.values()].sort((a, b) => a.n - b.n)) {
      if (!range.intersectsNode(v.tlEl)) continue;
      const pr = v.el.getBoundingClientRect(); if (!pr.width || !pr.height) continue;
      const walker = document.createTreeWalker(v.tlEl, NodeFilter.SHOW_TEXT), raw = [];
      let quote = '', lastTop = null, lastRight = 0, node;
      while ((node = walker.nextNode())) {
        if (!range.intersectsNode(node)) continue;
        const s = node === range.startContainer ? range.startOffset : 0, e = node === range.endContainer ? range.endOffset : node.length;
        if (e <= s) continue;
        const r = document.createRange(); r.setStart(node, s); r.setEnd(node, e);
        const text = node.data.slice(s, e), crs = [...r.getClientRects()].filter((c) => c.width > 0.5 && c.height > 0.5);
        if (!crs.length) continue;
        const first = crs[0];
        if (quote) {
          if (lastTop !== null && Math.abs(first.top - lastTop) < first.height * 0.6) { if (first.left - lastRight > first.height * 0.18 && !/\s$/.test(quote) && !/^\s/.test(text)) quote += ' '; }
          else if (/[-­]$/.test(quote) && /^[a-zа-яё]/.test(text)) quote = quote.slice(0, -1);
          else if (!/\s$/.test(quote) && !/^\s/.test(text)) quote += ' ';
        }
        quote += text; lastTop = crs[crs.length - 1].top; lastRight = crs[crs.length - 1].right;
        for (const c of crs) raw.push({ left: c.left, right: c.right, top: c.top, bottom: c.bottom });
      }
      quote = quote.replace(/\s+/g, ' ').trim();
      if (!raw.length || !quote) continue;
      const rects = mergeLines(raw).map((r) => [(r.left - pr.left) / pr.width, (r.top - pr.top) / pr.height, (r.right - r.left) / pr.width, (r.bottom - r.top) / pr.height])
        .filter((r) => r[2] > 0.0005 && r[3] > 0.0005).map((r) => [clamp(r[0], 0, 1), clamp(r[1], 0, 1), Math.min(r[2], 1 - clamp(r[0], 0, 1)), Math.min(r[3], 1 - clamp(r[1], 0, 1))]);
      if (rects.length) out.push({ page: v.n, rects, quote });
    }
    return out;
  }
  function placeFloating(elm, r) {
    elm.hidden = false;
    const w = elm.offsetWidth, h = elm.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    const x = clamp(r.left + r.width / 2 - w / 2, 8, Math.max(8, vw - w - 8));
    let y = r.top - h - 8;
    if (y < 8) { y = r.bottom + 8; if (y + h > vh - 8) y = clamp(r.top, 8, Math.max(8, vh - h - 8)); }
    elm.style.left = x + 'px'; elm.style.top = y + 'px';
  }
  function hideSel() { el.selbar.hidden = true; pendingSel = null; }
  function refreshSelBar() {
    if (!active || mouseDown || !notes) return;
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !el.pages.contains(sel.getRangeAt(0).commonAncestorContainer)) { hideSel(); return; }
    const pieces = collectSelection();
    if (!pieces.length) { hideSel(); return; }
    pendingSel = pieces;
    const rects = [...sel.getRangeAt(0).getClientRects()].filter((r) => r.width > 0.5), last = rects[rects.length - 1] || sel.getRangeAt(0).getBoundingClientRect();
    el.selbar.querySelectorAll('.cdot').forEach((b) => b.classList.toggle('on', b.dataset.c === color));
    placeFloating(el.selbar, rects.length ? { left: Math.min(...rects.map((r) => r.left)), width: last.right - Math.min(...rects.map((r) => r.left)), top: Math.min(...rects.map((r) => r.top)), bottom: last.bottom } : last);
  }
  function createFromSelection(style, withCard, c = color) {
    const pieces = pendingSel || collectSelection();
    if (!pieces.length) { hideSel(); return; }
    color = c; hooks.saveUi({ pdfColor: c });
    let firstId = null;
    for (const p of pieces) { const n = notes.add({ type: 'hl', style, page: p.page, color: c, rects: p.rects, quote: p.quote, text: '' }); firstId = firstId || n.id; }
    getSelection().removeAllRanges(); hideSel();
    if (withCard && firstId) openCard(firstId, true);
  }

  // ================================================================ notes: pins, hit test
  function pageUnderEvent(ev) {
    const pg = ev.target.closest && ev.target.closest('.pg'); if (!pg) return null;
    const v = views.get(+pg.dataset.n); if (!v) return null;
    const r = v.el.getBoundingClientRect();
    return { v, fx: (ev.clientX - r.left) / r.width, fy: (ev.clientY - r.top) / r.height };
  }
  function hitNote(v, fx, fy) {
    let hit = null; const tol = 0.002;
    for (const n of notes.byPage(v.n)) if (n.type === 'hl' && n.rects.some((r) => fx >= r[0] - tol && fx <= r[0] + r[2] + tol && fy >= r[1] - tol && fy <= r[1] + r[3] + tol)) hit = n;
    return hit;
  }
  function onPagesClick(ev) {
    if (!notes) return;
    const pin = ev.target.closest('.pin, .hl'); if (pin && pin.dataset.id) { openCard(pin.dataset.id); return; }
    const pos = pageUnderEvent(ev); if (!pos) return;
    const sel = getSelection();
    if (tool === 'pin') {
      const n = notes.add({ type: 'pin', page: pos.v.n, color, x: clamp(pos.fx, 0, 1), y: clamp(pos.fy, 0, 1), text: '' });
      setTool(null); openCard(n.id, true); return;
    }
    if (sel && !sel.isCollapsed) return;
    const hit = hitNote(pos.v, pos.fx, pos.fy);
    if (hit) openCard(hit.id);
  }
  function setTool(t) {
    tool = t; el.scroller.classList.toggle('tool-pin', t === 'pin');
    root.querySelector('[data-pa="pin"]').setAttribute('aria-pressed', String(t === 'pin'));
    root.querySelector('[data-pa="pin"]').classList.toggle('on', t === 'pin');
    if (t === 'pin') { hideSel(); closeCard(); hooks.toast('Нажмите на страницу там, где нужна метка. Esc — отмена.'); }
  }

  // ================================================================ notes: card
  function noteAnchor(n) {
    const v = views.get(n.page); if (!v) return null;
    const pr = v.el.getBoundingClientRect();
    if (n.type === 'pin') { const x = pr.left + n.x * pr.width, y = pr.top + n.y * pr.height; return { left: x, right: x, top: y - 20, bottom: y, width: 0, height: 20 }; }
    const first = n.rects.reduce((a, b) => (b[1] < a[1] ? b : a));
    const l = pr.left + first[0] * pr.width, t = pr.top + first[1] * pr.height;
    return { left: l, right: l + first[2] * pr.width, top: t, bottom: t + first[3] * pr.height, width: first[2] * pr.width, height: first[3] * pr.height };
  }
  function openCard(id, focus = false) {
    const n = notes.get(id); if (!n) return;
    if (cardId && cardId !== id) closeCard();
    cardId = id; hideSel();
    const c = el.card;
    c.innerHTML = `<div class="nc-head"><b>${n.type === 'pin' ? 'Заметка' : n.style === 'ul' ? 'Подчёркнутый текст' : 'Подсветка'}</b><span class="mut"> · стр. ${n.page}</span><button type="button" class="nc-x" data-nc="close" aria-label="Закрыть">✕</button></div>
      ${n.quote ? `<blockquote class="nc-q">${esc(n.quote.length > 320 ? n.quote.slice(0, 320) + '…' : n.quote)}</blockquote>` : ''}
      <textarea class="nc-t" rows="4" placeholder="Комментарий…" aria-label="Текст заметки"></textarea>
      <div class="nc-foot"><div class="colors">${COLORS.map((x) => `<button type="button" class="cdot ${x.id === n.color ? 'on' : ''}" data-c="${x.id}" style="--c:${x.hex}" title="${x.name}" aria-label="${x.name}"></button>`).join('')}</div>
        <span class="nc-sp"></span><button type="button" class="btn" data-nc="del">Удалить</button><button type="button" class="btn primary" data-nc="done">Готово</button></div>`;
    const ta = c.querySelector('textarea'); ta.value = n.text;
    ta.addEventListener('input', () => { clearTimeout(ta._t); ta._t = setTimeout(() => commitText(id, ta.value), 350); });
    const a = noteAnchor(n); if (a) placeFloating(c, a); else c.hidden = false;
    flashNote(id);
    if (focus || !n.text) ta.focus({ preventScroll: true }); else ta.focus({ preventScroll: true });
  }
  function commitText(id, text) {
    const n = notes && notes.get(id); if (!n || n.text === text) return;
    notes.update(id, { text });
  }
  function closeCard() {
    if (!cardId) { el.card.hidden = true; return; }
    const id = cardId, ta = el.card.querySelector('textarea');
    cardId = null; el.card.hidden = true;
    if (ta) { clearTimeout(ta._t); commitText(id, ta.value); }
    const n = notes && notes.get(id);
    if (n && n.type === 'pin' && !n.text.trim()) notes.remove(id);
  }
  async function deleteNote(id) {
    const n = notes.get(id); if (!n) return;
    if (n.text.trim() && !(await hooks.confirm('Удалить заметку?', 'Комментарий к ней будет потерян.', 'Удалить'))) return;
    if (cardId === id) { cardId = null; el.card.hidden = true; }
    notes.remove(id);
  }

  function onNotesChange(kind, note) {
    if (kind === 'saved') { renderPanelStatus(); return; }
    if (note) { const v = views.get(note.page); if (v) buildOverlays(v); if (kind === 'update' && flashId === note.id) flashNote(note.id); }
    else for (const v of views.values()) buildOverlays(v);
    updateToolbar();
    if (panelTab === 'notes') renderPanel();
  }

  // ================================================================ panel
  function setPanel(tab) {
    panelTab = panelTab === tab ? null : tab;
    hooks.saveUi({ pdfPanel: panelTab || '' });
    renderPanel(); updateToolbar();
    requestAnimationFrame(() => { onResize(); });
  }
  function renderPanel() {
    const p = el.panel;
    if (!panelTab || !doc) { p.hidden = true; return; }
    p.hidden = false;
    const tab = (k, t) => `<button type="button" class="pt ${panelTab === k ? 'on' : ''}" data-pt="${k}" role="tab" aria-selected="${panelTab === k}">${t}</button>`;
    p.innerHTML = `<div class="pp-tabs" role="tablist">${tab('notes', 'Заметки')}${tab('toc', 'Оглавление')}${tab('search', 'Поиск')}<button type="button" class="pt x" data-pt="close" aria-label="Закрыть панель">✕</button></div><div class="pp-body" id="pp-body"></div>`;
    if (panelTab === 'notes') renderNotesTab(); else if (panelTab === 'toc') renderTocTab(); else renderSearchTab();
  }
  function renderPanelStatus() { const s = el.panel.querySelector('.pp-status'); if (s && notes) s.textContent = notes.statusText(); }
  function renderNotesTab() {
    const body = el.panel.querySelector('#pp-body');
    const q = noteFilter.trim().toLowerCase();
    const list = notes.sorted().filter((n) => !q || (n.quote || '').toLowerCase().includes(q) || n.text.toLowerCase().includes(q) || String(n.page) === q);
    body.innerHTML = `<div class="pp-tools"><input type="search" id="nq" placeholder="Фильтр: слово или номер страницы" value="${esc(noteFilter)}" aria-label="Фильтр заметок" autocomplete="off"></div>
      <div class="pp-list">${list.length ? `<ul class="nlist">${list.map((n) => `<li><div class="nt" data-id="${n.id}" role="button" tabindex="0"><div class="nt-h"><span class="nt-dot" style="background:${colorHex(n.color)}"></span><span class="nt-pg">стр. ${n.page}</span><span class="nt-type">${n.type === 'pin' ? 'метка' : n.style === 'ul' ? 'подчёркивание' : 'подсветка'}</span><button type="button" class="nt-x" data-del="${n.id}" aria-label="Удалить заметку" title="Удалить">✕</button></div>
        ${n.quote ? `<div class="nt-q">${esc(n.quote.length > 160 ? n.quote.slice(0, 160) + '…' : n.quote)}</div>` : ''}${n.text ? `<div class="nt-t">${esc(n.text)}</div>` : n.type === 'pin' ? '<div class="nt-t mut">без текста</div>' : ''}</div></li>`).join('')}</ul>`
      : `<p class="mut pp-empty">${notes.list.length ? 'Ничего не найдено.' : 'Заметок пока нет. Выделите текст в документе, чтобы подсветить его или написать комментарий, либо нажмите «✎ Заметка» и поставьте метку.'}</p>`}</div>
      <div class="pp-foot"><div class="pp-status">${esc(notes.statusText())}</div><div class="srow"><button type="button" class="btn" data-pn="md">Экспорт .md</button><button type="button" class="btn" data-pn="json">Экспорт .json</button><button type="button" class="btn" data-pn="import">Импорт…</button></div><input type="file" id="nimp" accept=".json,application/json" hidden></div>`;
    const inp = body.querySelector('#nq');
    inp.addEventListener('input', () => { noteFilter = inp.value; const pos = inp.selectionStart; renderNotesTab(); const n = el.panel.querySelector('#nq'); n.focus(); n.setSelectionRange(pos, pos); });
  }
  function download(name, text, mime) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function jumpToNote(id) {
    const n = notes.get(id); if (!n) return;
    pushBack();
    const frac = n.type === 'pin' ? n.y : Math.min(...n.rects.map((r) => r[1]));
    goToPage(n.page, Math.max(0.0001, frac), { push: false });
    flashNote(id);
    setTimeout(() => { if (notes.get(id)) openCard(id); }, 280);
  }

  // ---- outline
  async function renderTocTab() {
    const body = el.panel.querySelector('#pp-body');
    body.innerHTML = '<p class="mut pp-empty">Загружаю оглавление…</p>';
    if (outlineFor !== fp) { try { outline = await doc.getOutline(); } catch { outline = null; } outlineFor = fp; }
    if (panelTab !== 'toc') return;
    if (!outline || !outline.length) { body.innerHTML = '<p class="mut pp-empty">В этом PDF нет оглавления (закладок).</p>'; return; }
    let idx = 0; const items = [];
    const walk = (list, depth) => `<ul class="toc d${Math.min(depth, 4)}">${list.map((o) => { const id = idx++; items[id] = o; return `<li>${o.items && o.items.length ? `<details ${depth < 1 ? 'open' : ''}><summary><button type="button" class="tocb" data-ti="${id}">${esc(o.title || '(без названия)')}</button></summary>${walk(o.items, depth + 1)}</details>` : `<button type="button" class="tocb leaf" data-ti="${id}">${esc(o.title || '(без названия)')}</button>`}</li>`; }).join('')}</ul>`;
    body.innerHTML = `<div class="pp-list">${walk(outline, 0)}</div>`;
    body._items = items;
  }

  // ---- search
  async function pageIndex(n) {
    if (idxCache.has(n)) return idxCache.get(n);
    const page = await doc.getPage(n), tc = await page.getTextContent({ disableNormalization: true });
    let str = '', starts = [], lens = [], items = 0;
    for (const it of tc.items) {
      if (it.str === undefined) continue;
      starts.push(str.length); lens.push(it.str.length); items++;
      str += it.str;
      if (it.hasEOL && str.length && !/\s$/.test(str)) str += ' ';
    }
    const idx = { str, norm: normFind(str), starts, lens, items };
    idxCache.set(n, idx);
    if (idxCache.size > 40) idxCache.delete(idxCache.keys().next().value);
    return idx;
  }
  function renderSearchTab() {
    const body = el.panel.querySelector('#pp-body');
    body.innerHTML = `<form class="pp-tools" id="fq"><input type="search" id="fqi" placeholder="Найти в документе" value="${esc(find.q)}" aria-label="Поиск по тексту документа" autocomplete="off"><button class="btn primary" type="submit">Найти</button></form>
      <div class="pp-sub"><span id="fstat"></span><span class="sp"></span><button type="button" class="btn" data-pf="prev" aria-label="Предыдущее совпадение">◀</button><button type="button" class="btn" data-pf="next" aria-label="Следующее совпадение">▶</button></div>
      <div class="pp-list" id="flist"></div>`;
    renderFindResults();
    const i = body.querySelector('#fqi'); i.focus(); i.select();
  }
  function renderFindResults() {
    const list = el.panel.querySelector('#flist'), stat = el.panel.querySelector('#fstat'); if (!list) return;
    const total = find.results.length;
    if (stat) stat.textContent = !find.q ? '' : find.running ? `Найдено: ${total} · ищу, стр. ${find.scanned} из ${N}…` : total ? `Совпадение ${find.cur + 1} из ${total}${total >= 3000 ? ' (показаны первые 3000)' : ''}` : 'Ничего не найдено';
    const shown = find.results.slice(0, 600);
    list.innerHTML = shown.length ? `<ul class="flist">${shown.map((m, i) => `<li><button type="button" class="fr ${i === find.cur ? 'on' : ''}" data-fi="${i}"><span class="nt-pg">стр. ${m.page}</span> ${esc(m.pre)}<mark>${esc(m.hit)}</mark>${esc(m.post)}</button></li>`).join('')}</ul>${total > shown.length ? `<p class="mut pp-empty">Показано ${shown.length} из ${total}. Листайте совпадения кнопками ◀ ▶.</p>` : ''}` : '';
  }
  async function runFind(q) {
    q = q.trim();
    const token = ++find.token;
    Object.assign(find, { q, results: [], byPage: new Map(), cur: -1, running: false, scanned: 0 });
    clearFindHighlights();
    if (!q) { renderFindResults(); return; }
    const needle = normFind(q); find.running = true; renderFindResults();
    let lastUi = 0;
    for (let n = 1; n <= N && token === find.token; n++) {
      let idx; try { idx = await pageIndex(n); } catch { continue; }
      let from = 0, k;
      while ((k = idx.norm.indexOf(needle, from)) >= 0 && find.results.length < 3000) {
        const m = { page: n, s: k, e: k + needle.length, pre: idx.str.slice(Math.max(0, k - 36), k).replace(/\s+/g, ' '), hit: idx.str.slice(k, k + needle.length), post: idx.str.slice(k + needle.length, k + needle.length + 56).replace(/\s+/g, ' ') };
        find.results.push(m); (find.byPage.get(n) || find.byPage.set(n, []).get(n)).push(m);
        from = k + Math.max(1, needle.length);
      }
      find.scanned = n;
      if (find.results.length >= 3000) break;
      if (find.cur < 0 && find.results.length) { find.cur = 0; gotoMatch(0, true); }
      if (performance.now() - lastUi > 250) { lastUi = performance.now(); renderFindResults(); await new Promise((r) => setTimeout(r, 0)); }
    }
    if (token !== find.token) return;
    find.running = false; renderFindResults(); applyFindHighlights();
  }
  function locate(idx, c, forward) {
    for (let step = 0; step < 3; step++) {
      let lo = 0, hi = idx.starts.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (idx.starts[mid] <= c) lo = mid; else hi = mid - 1; }
      if (idx.starts[lo] <= c && c < idx.starts[lo] + idx.lens[lo]) return [lo, c - idx.starts[lo]];
      c += forward ? 1 : -1;
    }
    return null;
  }
  function rangeFor(v, idx, s, e) {
    const divs = v.tl && v.tl.textDivs; if (!divs || divs.length !== idx.items) return null;
    const a = locate(idx, s, true), b = locate(idx, e - 1, false); if (!a || !b) return null;
    const na = divs[a[0]] && divs[a[0]].firstChild, nb = divs[b[0]] && divs[b[0]].firstChild;
    if (!na || !nb || na.nodeType !== 3 || nb.nodeType !== 3) return null;
    try { const r = document.createRange(); r.setStart(na, a[1]); r.setEnd(nb, Math.min(nb.length, b[1] + 1)); return r; } catch { return null; }
  }
  function clearFindHighlights() { if (window.CSS && CSS.highlights) { CSS.highlights.delete('jh-find'); CSS.highlights.delete('jh-find-cur'); } }
  async function applyFindHighlights() {
    if (!(window.CSS && CSS.highlights) || typeof Highlight === 'undefined') return;
    const token = find.token;
    clearFindHighlights();
    if (!find.q || !find.results.length) return;
    const all = [], cur = [];
    for (const v of [...views.values()]) {
      const ms = find.byPage.get(v.n); if (!ms || !v.tl) continue;
      let idx; try { idx = await pageIndex(v.n); } catch { continue; }
      if (token !== find.token) return;
      for (const m of ms) { const r = rangeFor(v, idx, m.s, m.e); if (r) (find.results[find.cur] === m ? cur : all).push(r); }
    }
    if (token !== find.token) return;
    if (all.length) CSS.highlights.set('jh-find', new Highlight(...all));
    if (cur.length) CSS.highlights.set('jh-find-cur', new Highlight(...cur));
  }
  async function gotoMatch(i, scroll = true) {
    const m = find.results[i]; if (!m) return;
    find.cur = i;
    if (scroll) { pushBack(); goToPage(m.page, 0, { push: false }); }
    renderFindResults();
    const lst = el.panel.querySelector('.fr.on'); if (lst && lst.scrollIntoView) lst.scrollIntoView({ block: 'nearest' });
    const v = views.get(m.page) || (update(), views.get(m.page));
    if (!v) return;
    await Promise.race([v.textReady, new Promise((r) => setTimeout(r, 4000))]);
    applyFindHighlights();
    if (scroll) {
      try { const idx = await pageIndex(m.page), r = rangeFor(v, idx, m.s, m.e); if (r) { const rc = r.getBoundingClientRect(), sc = el.scroller.getBoundingClientRect(); if (rc.top < sc.top + 40 || rc.bottom > sc.bottom - 40) el.scroller.scrollTop += rc.top - sc.top - sc.height * 0.35; } } catch { /* ignore */ }
    }
  }

  // ================================================================ toolbar
  function updateToolbar() {
    if (!el.bar) return;
    const open = !!doc;
    el.title.textContent = entry ? entry.name.replace(/\.pdf$/i, '') : 'PDF не открыт'; el.title.title = entry ? entry.path || entry.name : '';
    el.total.textContent = open ? String(N) : '–';
    el.page.value = open ? String(curPage) : '';
    el.nc.textContent = notes && notes.list.length ? String(notes.list.length) : '';
    el.bar.querySelectorAll('[data-pa]').forEach((b) => { const k = b.dataset.pa; if (!['about', 'p-notes', 'p-toc', 'p-search'].includes(k)) b.disabled = !open; });
    el.bar.querySelector('[data-pa="back"]').disabled = !open || !back.length;
    el.zoom.disabled = !open; el.page.disabled = !open;
    for (const k of ['notes', 'toc', 'search']) { const b = el.bar.querySelector(`[data-pa="p-${k}"]`); b.classList.toggle('on', panelTab === k); b.disabled = !open; }
    const nb = el.bar.querySelector('[data-pa="night"]'); nb.classList.toggle('on', night); nb.setAttribute('aria-pressed', String(night));
    root.classList.toggle('night', night);
  }

  // ================================================================ open / close
  async function closeDoc() {
    gen++; find.token++; queue.length = 0;
    clearFindHighlights();
    if (notes) { try { await notes.flush(); } catch { /* ignore */ } if (unsubNotes) unsubNotes(); }
    for (const v of [...views.values()]) { try { v.task && v.task.cancel(); } catch { /* ignore */ } v.destroyed = true; }
    views.clear(); el.pages.innerHTML = '';
    try { task && (await task.destroy()); } catch { /* ignore */ }
    try { worker && worker.terminate(); } catch { /* ignore */ }
    task = null; worker = null; doc = null; notes = null; unsubNotes = null; entry = null; fp = ''; N = 0; idxCache.clear(); outline = null; outlineFor = '';
    Object.assign(find, { q: '', results: [], byPage: new Map(), cur: -1, running: false, scanned: 0 });
    back.length = 0; cardId = null; el.card.hidden = true; hideSel(); setTool(null);
    el.pages.style.height = '0px';
  }
  async function askPassword(updatePassword, reason) {
    const again = reason === 2;     // 2 = incorrect password
    const pw = await new Promise((resolve) => {
      hooks.dialog(`<h2>Документ защищён паролем</h2><form method="dialog" id="pwf"><p class="mut">${again ? 'Пароль не подошёл. Попробуйте ещё раз.' : 'Введите пароль для открытия файла. Он нигде не сохраняется.'}</p><p><input type="password" id="pwi" autocomplete="off" style="width:100%"></p></form>
        <div class="dlg-actions"><button class="btn" data-close>Отмена</button><button class="btn primary" id="pwok">Открыть</button></div>`, (d) => {
        let val = null;
        d.querySelector('#pwok').addEventListener('click', () => { val = d.querySelector('#pwi').value; d.close(); });
        d.addEventListener('close', () => resolve(val), { once: true });
        d.querySelector('#pwi').focus();
      });
    });
    return pw;
  }
  let openSeq = 0;
  async function openEntry(e) {
    const seq = ++openSeq;
    await closeDoc();
    if (seq !== openSeq) return;
    const myGen = ++gen;
    entry = e; updateToolbar();
    showState(`<div class="pdfhello"><h2>${esc(e.name.replace(/\.pdf$/i, ''))}</h2><p id="pload">Читаю файл…</p></div>`);
    const setLoad = (t) => { const p = el.state.querySelector('#pload'); if (p) p.textContent = t; };
    try {
      lib = await loadPdfJs();
      const file = e.handle ? await e.handle.getFile() : e.file;
      const data = new Uint8Array(await file.arrayBuffer());
      if (myGen !== gen) return;
      setLoad('Разбираю документ…');
      worker = new lib.PDFWorker({ port: newWorkerPort() });
      task = lib.getDocument({ data, worker, ...DOC_OPTIONS });
      let tries = 0;
      task.onPassword = async (update, reason) => { const pw = await askPassword(update, reason); if (pw === null || ++tries > 5) { try { task.destroy(); } catch { /* ignore */ } return; } update(pw); };
      doc = await task.promise;
      if (myGen !== gen) { try { await task.destroy(); } catch { /* ignore */ } return; }
      N = doc.numPages; fp = (doc.fingerprints && doc.fingerprints[0]) || (e.name + ':' + file.size);
      const p1 = await doc.getPage(1), vp = p1.getViewport({ scale: 1 });
      sizes = Array.from({ length: N }, () => [vp.width, vp.height]); known = new Array(N).fill(false); known[0] = true;
      notes = await Notes.open(e, fp, N);
      if (myGen !== gen) return;
      unsubNotes = notes.onChange(onNotesChange);
      const saved = await store.kvGet('pdfview:' + fp);
      showState('');
      curPage = 1; color = hooks.ui().pdfColor || 'y';
      zoom = saved && saved.zoom ? clamp(saved.zoom, MIN_Z, MAX_Z) : 1; fit = saved ? saved.fit || null : 'width';
      layout();
      if (fit) { zoom = clamp(fitZoom(fit), MIN_Z, Math.min(MAX_Z, maxZoomFor())); layout(); }
      if (saved && saved.page) { const pg = clamp(saved.page, 1, N); el.scroller.scrollTop = tops[pg - 1] + (saved.frac || 0) * sizes[pg - 1][1] * S - (saved.frac ? 0 : PAD / 2); } else el.scroller.scrollTop = 0;
      el.scroller.scrollLeft = 0;
      updateCurrent(); updateZoomUi(); updateToolbar(); renderPanel(); update();
      scanSizes(myGen);
      if (notes.error) hooks.toast(notes.error, true);
      el.scroller.focus({ preventScroll: true });
    } catch (err) {
      if (myGen !== gen) return;
      console.error(err);
      const msg = err && err.name === 'PasswordException' ? 'Файл защищён паролем, пароль не введён.' : err && err.name === 'InvalidPDFException' ? 'Файл не похож на PDF или повреждён.' : (err && err.message) || String(err);
      showState(`<div class="pdfhello"><h2>Не удалось открыть «${esc(e.name)}»</h2><p class="err">${esc(msg)}</p></div>`);
      try { task && (await task.destroy()); } catch { /* ignore */ } try { worker && worker.terminate(); } catch { /* ignore */ }
      task = null; worker = null; doc = null; N = 0; notes = null; updateToolbar();
    }
  }
  async function scanSizes(myGen) {
    let changed = false;
    for (let i = 2; i <= N; i++) {
      if (myGen !== gen) return;
      try {
        const vp = (await doc.getPage(i)).getViewport({ scale: 1 }); known[i - 1] = true;
        if (Math.abs(vp.width - sizes[i - 1][0]) > 0.5 || Math.abs(vp.height - sizes[i - 1][1]) > 0.5) { sizes[i - 1] = [vp.width, vp.height]; changed = true; }
      } catch { /* ignore */ }
      if (i % 30 === 0) { if (changed) { relayoutKeep(); changed = false; } await new Promise((r) => setTimeout(r, 8)); }
    }
    if (myGen === gen && changed) relayoutKeep();
  }
  function relayoutKeep() {
    const sc = el.scroller, p = pageAtY(sc.scrollTop), off = sc.scrollTop - tops[p];
    if (fit) { zoom = clamp(fitZoom(fit), MIN_Z, Math.min(MAX_Z, maxZoomFor())); for (const v of views.values()) v.stale = true; updateZoomUi(); }
    layout(); sc.scrollTop = tops[p] + off; update();
  }

  // ================================================================ view position memory
  function saveViewSoon() {
    clearTimeout(saveViewSoon.t);
    saveViewSoon.t = setTimeout(() => { if (!doc) return; const c = curFrac(); store.kvSet('pdfview:' + fp, { page: c.page, frac: c.frac, zoom, fit, t: Date.now() }).catch(() => {}); }, 700);
  }

  // ================================================================ events
  let raf = 0;
  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; updateCurrent(); update(); saveViewSoon(); if (cardId) { const n = notes.get(cardId), a = n && noteAnchor(n); if (a) placeFloating(el.card, a); } if (!el.selbar.hidden) refreshSelBar(); });
  }
  let wheelAcc = 1, wheelRaf = 0, wheelPos = null;
  function onWheel(ev) {
    if (!(ev.ctrlKey || ev.metaKey) || !doc) return;
    ev.preventDefault();
    wheelAcc *= Math.exp(-ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.002));
    const r = el.scroller.getBoundingClientRect(); wheelPos = { anchorY: ev.clientY - r.top, anchorX: ev.clientX - r.left };
    if (!wheelRaf) wheelRaf = requestAnimationFrame(() => { wheelRaf = 0; const f = wheelAcc; wheelAcc = 1; setZoom(zoom * f, wheelPos); });
  }
  function onResize() {
    if (!doc || !active) return;
    if (fit) setZoom(fitZoom(fit), { fitMode: fit }); else { layout(); update(); }
  }
  function onKey(ev) {
    if (!active) return;
    const t = ev.target, typing = t && t.matches && t.matches('input, textarea, select, [contenteditable]');
    if (ev.key === 'Escape') {
      if (cardId) { ev.preventDefault(); closeCard(); } else if (tool) { setTool(null); } else if (!el.selbar.hidden) { hideSel(); getSelection().removeAllRanges(); }
      return;
    }
    if (!doc) return;
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && (ev.key === 'f' || ev.key === 'F') && !ev.shiftKey) { ev.preventDefault(); if (panelTab !== 'search') { panelTab = 'search'; hooks.saveUi({ pdfPanel: 'search' }); renderPanel(); updateToolbar(); onResize(); } else { const i = el.panel.querySelector('#fqi'); if (i) { i.focus(); i.select(); } } return; }
    if (mod && (ev.key === '+' || ev.key === '=')) { ev.preventDefault(); zoomStep(1); return; }
    if (mod && (ev.key === '-' || ev.key === '_')) { ev.preventDefault(); zoomStep(-1); return; }
    if (mod && ev.key === '0') { ev.preventDefault(); setZoom(1); return; }
    if (ev.altKey && ev.key === 'ArrowLeft') { ev.preventDefault(); goBack(); return; }
    if (typing) return;
    if (ev.key === 'Home' && !mod) { ev.preventDefault(); goToPage(1); } else if (ev.key === 'End' && !mod) { ev.preventDefault(); goToPage(N); }
    else if (ev.key === 'F3') { ev.preventDefault(); if (find.results.length) gotoMatch((find.cur + (ev.shiftKey ? -1 : 1) + find.results.length) % find.results.length); }
  }

  function wire() {
    el.scroller.addEventListener('scroll', onScroll, { passive: true });
    el.scroller.addEventListener('wheel', onWheel, { passive: false });
    el.scroller.addEventListener('mousedown', (ev) => { if (ev.button === 0) { mouseDown = true; if (!ev.target.closest('.pin')) { el.pages.querySelectorAll('.textLayer').forEach((t) => t.classList.add('selecting')); } } });
    document.addEventListener('mouseup', () => { if (!mouseDown) return; mouseDown = false; el.pages.querySelectorAll('.textLayer.selecting').forEach((t) => t.classList.remove('selecting')); setTimeout(refreshSelBar, 10); });
    document.addEventListener('selectionchange', () => { if (!active || mouseDown) return; clearTimeout(wire.t); wire.t = setTimeout(refreshSelBar, 180); });
    el.pages.addEventListener('click', onPagesClick);
    document.addEventListener('mousedown', (ev) => {
      if (!active) return;
      if (cardId && !el.card.contains(ev.target) && !ev.target.closest('.pin, .hl, dialog')) closeCard();
      if (!el.selbar.hidden && !el.selbar.contains(ev.target) && !ev.target.closest('.pg')) hideSel();
    }, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', () => { onResize(); if (cardId) { const n = notes.get(cardId), a = n && noteAnchor(n); if (a) placeFloating(el.card, a); } });
    if (window.ResizeObserver) new ResizeObserver(() => onResize()).observe(el.scroller);
    window.addEventListener('pagehide', () => { if (notes) notes.flush(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && notes) notes.flush(); });

    el.selbar.addEventListener('mousedown', (ev) => ev.preventDefault());
    el.selbar.addEventListener('click', (ev) => {
      const c = ev.target.closest('.cdot'), b = ev.target.closest('[data-sa]');
      if (c) createFromSelection('hl', false, c.dataset.c);
      else if (b) {
        const a = b.dataset.sa;
        if (a === 'ul') createFromSelection('ul', false); else if (a === 'note') createFromSelection('hl', true);
        else if (a === 'copy') { const txt = getSelection().toString(); (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => document.execCommand('copy')); hooks.toast('Скопировано'); hideSel(); }
      }
    });
    el.card.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-nc]'), c = ev.target.closest('.cdot');
      if (c && cardId) { const id = cardId; color = c.dataset.c; hooks.saveUi({ pdfColor: color }); notes.update(id, { color: c.dataset.c }); el.card.querySelectorAll('.cdot').forEach((x) => x.classList.toggle('on', x === c)); return; }
      if (!b) return;
      if (b.dataset.nc === 'del') deleteNote(cardId); else closeCard();
    });
    el.card.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); closeCard(); } });

    root.addEventListener('click', (ev) => {
      const pa = ev.target.closest('[data-pa]');
      if (pa) {
        const k = pa.dataset.pa;
        if (k === 'prev') goToPage(curPage - 1); else if (k === 'next') goToPage(curPage + 1); else if (k === 'back') goBack();
        else if (k === 'zoomin') zoomStep(1); else if (k === 'zoomout') zoomStep(-1);
        else if (k === 'fitw') setZoom(fitZoom('width'), { fitMode: 'width' }); else if (k === 'fitp') setZoom(fitZoom('page'), { fitMode: 'page' });
        else if (k === 'pin') setTool(tool === 'pin' ? null : 'pin');
        else if (k === 'night') { night = !night; hooks.saveUi({ pdfNight: night }); updateToolbar(); }
        else if (k.startsWith('p-')) setPanel(k.slice(2)); else if (k === 'about') hooks.about();
        return;
      }
      const pt = ev.target.closest('[data-pt]');
      if (pt) { if (pt.dataset.pt === 'close') { panelTab = null; hooks.saveUi({ pdfPanel: '' }); renderPanel(); updateToolbar(); onResize(); } else { panelTab = pt.dataset.pt; hooks.saveUi({ pdfPanel: panelTab }); renderPanel(); updateToolbar(); } return; }
      const del = ev.target.closest('[data-del]');
      if (del) { ev.stopPropagation(); deleteNote(del.dataset.del); return; }
      const nt = ev.target.closest('.nt');
      if (nt) { jumpToNote(nt.dataset.id); return; }
      const pn = ev.target.closest('[data-pn]');
      if (pn && notes) {
        const base = entry.name.replace(/\.pdf$/i, '');
        if (pn.dataset.pn === 'md') download(base + ' — заметки.md', notes.exportMarkdown(), 'text/markdown');
        else if (pn.dataset.pn === 'json') download(entry.name + '.notes.json', notes.exportJSON(), 'application/json');
        else if (pn.dataset.pn === 'import') el.panel.querySelector('#nimp').click();
        return;
      }
      const ti = ev.target.closest('[data-ti]');
      if (ti) { const items = el.panel.querySelector('#pp-body')._items; const o = items && items[+ti.dataset.ti]; if (o) { if (o.dest) goToDest(o.dest); else if (o.url && /^(https?:|mailto:)/i.test(o.url)) window.open(o.url, '_blank', 'noopener,noreferrer'); } return; }
      const fi = ev.target.closest('[data-fi]'); if (fi) { gotoMatch(+fi.dataset.fi); return; }
      const pf = ev.target.closest('[data-pf]');
      if (pf && find.results.length) { const n = find.results.length; gotoMatch((find.cur + (pf.dataset.pf === 'next' ? 1 : -1) + n) % n); }
    });
    root.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.classList && ev.target.classList.contains('nt')) { ev.preventDefault(); jumpToNote(ev.target.dataset.id); } });
    root.addEventListener('submit', (ev) => { if (ev.target.id === 'fq') { ev.preventDefault(); runFind(ev.target.querySelector('#fqi').value); } });
    root.addEventListener('change', async (ev) => {
      if (ev.target === el.zoom) { const v = el.zoom.value; if (v === 'fitw') setZoom(fitZoom('width'), { fitMode: 'width' }); else if (v === 'fitp') setZoom(fitZoom('page'), { fitMode: 'page' }); else if (v !== 'custom') setZoom(+v); }
      else if (ev.target === el.page) { goToPage(parseInt(el.page.value, 10) || curPage); el.scroller.focus({ preventScroll: true }); }
      else if (ev.target.id === 'nimp') {
        const f = ev.target.files[0]; ev.target.value = ''; if (!f || !notes) return;
        try { const r = notes.importJSON(await f.text()); hooks.toast(`Заметки импортированы: добавлено ${r.added}, обновлено ${r.updated}.`); } catch (e) { hooks.toast('Не удалось импортировать: ' + e.message, true); }
      }
    });
    el.page.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); goToPage(parseInt(el.page.value, 10) || curPage); el.scroller.focus({ preventScroll: true }); } });
    el.page.addEventListener('focus', () => el.page.select());
    // drag a PDF onto the reader
    root.addEventListener('dragover', (ev) => { if (ev.dataTransfer && [...ev.dataTransfer.types].includes('Files')) ev.preventDefault(); });
    root.addEventListener('drop', async (ev) => {
      const items = ev.dataTransfer && ev.dataTransfer.items; if (!items || !items.length) return;
      ev.preventDefault();
      const it = items[0]; let h = null;
      try { if (it.getAsFileSystemHandle) h = await it.getAsFileSystemHandle(); } catch { /* ignore */ }
      const f = h && h.kind === 'file' ? null : ev.dataTransfer.files[0];
      const name = h ? h.name : f && f.name;
      if (!name || !/\.pdf$/i.test(name)) { hooks.toast('Перетащите файл PDF.', true); return; }
      hooks.openLoose(h && h.kind === 'file' ? { name, path: name, dirPath: '', handle: h, dir: null } : { name, path: name, dirPath: '', file: f });
    });
  }

  // ================================================================ public
  mount(); wire();
  return {
    openEntry, closeDoc,
    setActive(a) { active = a; if (a) { requestAnimationFrame(() => { onResize(); }); } else { hideSel(); if (cardId) closeCard(); if (notes) notes.flush(); } },
    refreshEmpty() { if (!doc && !entry) showEmpty(); },
    get isOpen() { return !!doc; },
    // for automated checks
    debug: () => ({ N, zoom, fit, S, curPage, views: views.size, notes: notes && notes.list.length, fp, running, find: { n: find.results.length, cur: find.cur } }),
    _api: { goToPage, setZoom, notes: () => notes, views: () => views, collectSelection, doc: () => doc },
  };
}
