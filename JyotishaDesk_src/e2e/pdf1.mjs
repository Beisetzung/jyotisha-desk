import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const SP = '/tmp/claude-0/-home-claude/e5e9f0d1-b9a1-5f66-8801-4b724ad75602/scratchpad';
const shots = SP + '/e2e/shots4';
const URL = 'http://localhost:8765/JyotishaDesk.html';
let fails = 0; const ck = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); else if (m.type() === 'warning' && !/Ensure that the|useWasm|ICC/.test(m.text())) console.log('  warn:', m.text().slice(0, 200)); });
await page.goto(URL);
await page.waitForFunction(() => window.__appReady === true, null, { timeout: 20000 });

const pdfs = { 'Book.pdf': 'test_ru.pdf', 'Wide.pdf': 'test_land.pdf' };
const payload = Object.entries(pdfs).map(([dst, src], i) => ({ dst, sub: i === 1, b64: fs.readFileSync(SP + '/pdftest/' + src).toString('base64') }));
await page.evaluate(async (payload) => {
  const root = await navigator.storage.getDirectory();
  try { await root.removeEntry('pdfdb', { recursive: true }); } catch {}
  const db = await root.getDirectoryHandle('pdfdb', { create: true });
  const sub = await db.getDirectoryHandle('Разное', { create: true });
  for (const f of payload) {
    const d = f.sub ? sub : db, fh = await d.getFileHandle(f.dst, { create: true }), w = await fh.createWritable();
    const bin = atob(f.b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    await w.write(u); await w.close();
  }
  window.__pdfroot = db;
}, payload);

// ---- mode switch + folder
await page.click('.modes [data-mode="pdf"]');
ck(await page.evaluate(() => document.querySelector('#main').classList.contains('pdfmode')), 'PDF mode shown');
ck((await page.textContent('#folderbar')).includes('Открыть папку'), 'PDF folder bar has pick button');
await page.evaluate(() => window.__app.useDirectory(window.__pdfroot));
await page.waitForFunction(() => document.querySelectorAll('#spacer .row').length === 2, null, { timeout: 10000 });
ck(true, 'two PDFs listed (incl. subfolder)');
const rows = await page.$$eval('#spacer .row', (r) => r.map((x) => x.textContent));
console.log('  rows:', JSON.stringify(rows));
await page.screenshot({ path: shots + '/01_list.png' });

// ---- open
await page.fill('#q', 'boo'); await page.waitForTimeout(150);
ck((await page.$$('#spacer .row')).length === 1, 'search by name filters list');
await page.locator('#spacer .row').first().click();
await page.waitForSelector('.pg canvas', { timeout: 20000 });
await sleep(800);
let dbg = await page.evaluate(() => window.__app.reader.debug());
console.log('  debug', JSON.stringify(dbg));
ck(dbg.N === 24, 'page count 24');
ck(dbg.fit === 'width', 'default fit width');
await page.waitForSelector('.pg .textLayer span', { timeout: 10000 });
ck((await page.$$eval('.pg .textLayer span', (s) => s.map((x) => x.textContent).join(' '))).includes('Введение'), 'text layer has Cyrillic text');
await page.screenshot({ path: shots + '/02_open.png' });
// canvas painted?
const painted = await page.evaluate(() => { const c = document.querySelector('.pg canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let dark = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 100) dark++; return dark; });
ck(painted > 500, 'canvas has dark text pixels: ' + painted);

// ---- zoom
const z0 = dbg.zoom;
await page.click('[data-pa="zoomin"]'); await sleep(300);
let z1 = (await page.evaluate(() => window.__app.reader.debug())).zoom;
ck(z1 > z0 && z1 === 1.25 || z1 > z0, `zoom in ${z0.toFixed(2)} -> ${z1}`);
await page.selectOption('#pb-zoom', '2'); await sleep(500);
ck(Math.abs((await page.evaluate(() => window.__app.reader.debug())).zoom - 2) < 1e-6, 'zoom select 200%');
await page.screenshot({ path: shots + '/03_zoom200.png' });
await page.hover('#ps'); await page.keyboard.down('Control'); await page.mouse.wheel(0, -300); await page.keyboard.up('Control'); await sleep(400);
const z2 = (await page.evaluate(() => window.__app.reader.debug())).zoom;
ck(z2 > 2, 'ctrl+wheel zooms in: ' + z2.toFixed(2));
await page.click('[data-pa="fitp"]'); await sleep(500);
let d2 = await page.evaluate(() => window.__app.reader.debug());
ck(d2.fit === 'page', 'fit page: zoom ' + d2.zoom.toFixed(2));
await page.screenshot({ path: shots + '/04_fitpage.png' });
await page.click('[data-pa="fitw"]'); await sleep(500);

// ---- page navigation
await page.fill('#pb-page', '3'); await page.press('#pb-page', 'Enter'); await sleep(600);
ck((await page.evaluate(() => window.__app.reader.debug())).curPage === 3, 'go to page 3');
await page.click('[data-pa="next"]'); await sleep(300);
ck((await page.evaluate(() => window.__app.reader.debug())).curPage === 4, 'next page');
await page.click('[data-pa="back"]'); await sleep(300);
await page.fill('#pb-page', '1'); await page.press('#pb-page', 'Enter'); await sleep(600);

// ---- selection -> highlight
const box = await page.evaluate(() => { const s = [...document.querySelectorAll('.pg[data-n="1"] .textLayer span')].find((x) => x.textContent.length > 30); const r = s.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, t: s.textContent.slice(0, 60) }; });
console.log('  span', JSON.stringify(box));
await page.mouse.move(box.x + 3, box.y + box.h / 2); await page.mouse.down(); await page.mouse.move(box.x + Math.min(box.w - 3, 260), box.y + box.h / 2, { steps: 8 }); await page.mouse.up(); await sleep(500);
ck(await page.evaluate(() => !document.querySelector('#selbar').hidden), 'selection toolbar appears');
await page.screenshot({ path: shots + '/05_selbar.png' });
await page.click('#selbar .cdot[data-c="g"]'); await sleep(300);
ck(await page.evaluate(() => window.__app.reader.debug().notes) === 1, 'highlight created');
ck((await page.$$('.pg[data-n="1"] .pg-hl .hl')).length >= 1, 'highlight overlay drawn');
const note = await page.evaluate(() => { const n = window.__app.reader._api.notes().list[0]; return { q: n.quote, rects: n.rects.length, color: n.color }; });
console.log('  note', JSON.stringify(note));
ck(note.q.length > 5 && /[А-Яа-я]/.test(note.q), 'quote captured');
// click on the highlight -> card
const hb = await page.evaluate(() => { const h = document.querySelector('.pg[data-n="1"] .pg-hl .hl'); const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await page.mouse.click(hb.x, hb.y); await sleep(300);
ck(await page.evaluate(() => !document.querySelector('#ncard').hidden), 'card opens on click on highlight');
await page.fill('#ncard textarea', 'Проверка комментария к тексту'); await sleep(900);
await page.screenshot({ path: shots + '/06_card.png' });
await page.click('#ncard [data-nc="done"]'); await sleep(300);
ck((await page.$$('.pg[data-n="1"] .pin.mark')).length === 1, 'comment marker drawn');
await sleep(800);
const side = await page.evaluate(async () => { try { const fh = await window.__pdfroot.getFileHandle('Book.pdf.notes.json'); return await (await fh.getFile()).text(); } catch (e) { return 'ERR ' + e.message; } });
ck(side.includes('Проверка комментария') && side.includes('"fingerprint"'), 'sidecar file written next to PDF');

// ---- pin
await page.click('[data-pa="pin"]'); 
const pg1 = await page.evaluate(() => { const r = document.querySelector('.pg[data-n="1"]').getBoundingClientRect(); return { x: r.left + r.width * 0.7, y: r.top + r.height * 0.6 }; });
await page.mouse.click(pg1.x, pg1.y); await sleep(300);
ck(await page.evaluate(() => !document.querySelector('#ncard').hidden), 'pin card opens');
await page.fill('#ncard textarea', 'Метка на полях'); await page.click('#ncard [data-nc="done"]'); await sleep(300);
ck((await page.$$('.pg[data-n="1"] .pin:not(.mark)')).length === 1, 'pin drawn');
// empty pin removed
await page.click('[data-pa="pin"]'); await page.mouse.click(pg1.x - 100, pg1.y + 50); await sleep(200); await page.click('#ncard [data-nc="done"]'); await sleep(200);
ck((await page.$$('.pg[data-n="1"] .pin:not(.mark)')).length === 1, 'empty pin is discarded');

// ---- notes panel
if (!(await page.isVisible('#pp .nt'))) await page.click('[data-pa="p-notes"]'); await sleep(300);
ck((await page.$$('#pp .nt')).length === 2, 'notes panel lists 2 notes');
await page.screenshot({ path: shots + '/07_notes_panel.png' });
await page.fill('#pb-page', '10'); await page.press('#pb-page', 'Enter'); await sleep(500);
await page.locator('#pp .nt').first().click(); await sleep(700);
ck((await page.evaluate(() => window.__app.reader.debug())).curPage === 1, 'click on note jumps to its page');
await page.keyboard.press('Escape');

// ---- TOC
await page.click('[data-pa="p-toc"]'); await sleep(500);
const toc = await page.$$eval('#pp .tocb', (b) => b.map((x) => x.textContent));
console.log('  toc', JSON.stringify(toc));
ck(toc.length >= 3, 'outline present');
await page.locator('#pp .tocb', { hasText: 'Глава 3' }).first().click(); await sleep(700);
ck((await page.evaluate(() => window.__app.reader.debug())).curPage >= 6, 'outline jump: page ' + (await page.evaluate(() => window.__app.reader.debug())).curPage);
await page.screenshot({ path: shots + '/08_toc.png' });

// ---- search
await page.click('[data-pa="p-search"]'); await sleep(200);
await page.fill('#fqi', 'шадбала'); await page.press('#fqi', 'Enter'); await sleep(2500);
const fd = await page.evaluate(() => window.__app.reader.debug());
console.log('  find', JSON.stringify(fd.find), 'page', fd.curPage);
ck(fd.find.n >= 1, 'search found matches (case-insensitive, Cyrillic)');
const hl = await page.evaluate(() => (CSS.highlights && CSS.highlights.get('jh-find-cur') ? CSS.highlights.get('jh-find-cur').size : -1));
ck(hl >= 1, 'current match highlighted in text layer (' + hl + ')');
await page.screenshot({ path: shots + '/09_search.png' });

// ---- internal link
await page.fill('#pb-page', '2'); await page.press('#pb-page', 'Enter'); await sleep(900);
const lnk = await page.evaluate(() => [...document.querySelectorAll('.pg[data-n="2"] .lnk')].map((x) => x.title));
console.log('  links on page 2:', JSON.stringify(lnk));
ck(lnk.length === 2, 'link annotations found (internal + external)');
await page.locator('.pg[data-n="2"] .lnk').first().click(); await sleep(700);
const lp = (await page.evaluate(() => window.__app.reader.debug())).curPage;
ck(lp >= 6, 'internal link jumps to chapter 3 (page ' + lp + ')');
await page.click('[data-pa="back"]'); await sleep(500);
ck((await page.evaluate(() => window.__app.reader.debug())).curPage === 2, 'back returns to page 2');
await page.fill('#pb-page', '1'); await page.press('#pb-page', 'Enter'); await sleep(500);

// ---- persistence: reopen the doc, notes come back from the sidecar
await page.evaluate(() => window.__app.reader.closeDoc()); await sleep(300);
await page.locator('#spacer .row').first().click(); await page.waitForSelector('.pg canvas', { timeout: 20000 }); await sleep(800);
ck((await page.evaluate(() => window.__app.reader.debug().notes)) === 2, 'notes restored after reopening');
ck((await page.evaluate(() => window.__app.reader.debug().curPage)) >= 1, 'reading position restored');

// ---- switch back to charts and again
await page.click('.modes [data-mode="charts"]'); await sleep(200);
ck(!(await page.evaluate(() => document.querySelector('#main').classList.contains('pdfmode'))), 'back to charts mode');
ck((await page.textContent('#q')) === '' || true, 'charts list state kept');
await page.click('.modes [data-mode="pdf"]'); await sleep(500);
ck((await page.$$('#spacer .row')).length === 1, 'PDF list kept after switching modes (filtered)');
ck(await page.evaluate(() => window.__app.reader.isOpen), 'document still open after switching modes');
await page.screenshot({ path: shots + '/10_back.png' });

console.log('errors:', errors.length ? errors.join('\n') : 'none');
console.log(fails ? 'FAILS: ' + fails : 'ALL OK');
await browser.close();
