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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [], warns = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); else if (m.type() === 'warning') warns.push(m.text().slice(0, 160)); });
await page.goto(URL);
await page.waitForFunction(() => window.__appReady === true, null, { timeout: 20000 });
const names = ['scan_jpx.pdf', 'scan_g4.pdf', 'big.pdf'];
const payload = names.map((n) => ({ n, b64: fs.readFileSync(SP + '/pdftest/' + n).toString('base64') }));
await page.evaluate(async (payload) => {
  const root = await navigator.storage.getDirectory();
  try { await root.removeEntry('pdf2', { recursive: true }); } catch {}
  const db = await root.getDirectoryHandle('pdf2', { create: true });
  for (const f of payload) { const fh = await db.getFileHandle(f.n, { create: true }), w = await fh.createWritable(); const bin = atob(f.b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); await w.write(u); await w.close(); }
  window.__pdfroot = db;
}, payload);
await page.click('.modes [data-mode="pdf"]');
await page.evaluate(() => window.__app.useDirectory(window.__pdfroot));
await page.waitForFunction(() => document.querySelectorAll('#spacer .row').length === 3, null, { timeout: 10000 });
const sub = async (name, fn) => { await page.fill('#q', name); await sleep(150); await page.locator('#spacer .row').first().click(); };
const dark = () => page.evaluate(() => { const c = document.querySelector('.pg canvas'); if (!c) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 120 && d[i + 1] < 120) n++; return n; });

// JPEG 2000
let t0 = Date.now(); await sub('scan_jpx'); await page.waitForSelector('.pg canvas', { timeout: 30000 }); await sleep(500);
let nd = await dark(); ck(nd > 2000, `JPEG2000 scan rendered (dark px ${nd}, ${Date.now() - t0} ms)`);
await page.screenshot({ path: shots + '/20_jpx_dark.png' });
// CCITT G4
t0 = Date.now(); await sub('scan_g4'); await page.waitForFunction(() => document.querySelector('#pb-title').textContent.includes('scan_g4'), null, { timeout: 10000 }); await page.waitForSelector('.pg canvas', { timeout: 30000 }); await sleep(800);
nd = await dark(); ck(nd > 2000, `CCITT G4 scan rendered (dark px ${nd}, ${Date.now() - t0} ms)`);
await page.screenshot({ path: shots + '/21_g4.png' });
// night mode
await page.click('[data-pa="night"]'); await sleep(300);
ck(await page.evaluate(() => document.querySelector('#pdfapp').classList.contains('night')), 'night mode on');
await page.screenshot({ path: shots + '/22_night.png' }); await page.click('[data-pa="night"]');

// big document
t0 = Date.now(); await sub('big'); await page.waitForFunction(() => document.querySelector('#pb-title').textContent === 'big', null, { timeout: 10000 }); await page.waitForSelector('.pg canvas', { timeout: 30000 });
console.log('  first canvas after', Date.now() - t0, 'ms');
let d = await page.evaluate(() => window.__app.reader.debug());
ck(d.N === 1440, 'big doc pages ' + d.N);
ck(d.views <= 8, 'only a few page views in the DOM: ' + d.views);
await page.fill('#pb-page', '1000'); await page.press('#pb-page', 'Enter'); await sleep(1200);
d = await page.evaluate(() => window.__app.reader.debug());
ck(d.curPage === 1000 && d.views <= 8, `jump to page 1000 (cur ${d.curPage}, views ${d.views})`);
await page.keyboard.press('End'); await sleep(800);
d = await page.evaluate(() => window.__app.reader.debug()); ck(d.curPage >= 1439, 'End goes to the last page: ' + d.curPage);
// scroll fast
await page.hover('#ps'); t0 = Date.now(); for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, -3000); } await sleep(1000);
d = await page.evaluate(() => window.__app.reader.debug()); ck(d.views <= 10, 'fast scrolling keeps few views: ' + d.views + ' page ' + d.curPage);
// zoom the big doc
await page.selectOption('#pb-zoom', '0.25'); await sleep(900);
d = await page.evaluate(() => window.__app.reader.debug()); ck(d.views <= 40, 'zoom 25% views ' + d.views);
await page.screenshot({ path: shots + '/23_big_25.png' });
// full text search in 1440 pages
await page.click('[data-pa="p-search"]'); await page.fill('#fqi', 'шадбала'); const ts = Date.now(); await page.press('#fqi', 'Enter');
await page.waitForFunction(() => /Совпадение|Ничего/.test(document.querySelector('#fstat')?.textContent || ''), null, { timeout: 120000 });
console.log('  search over 1440 pages took', Date.now() - ts, 'ms:', await page.textContent('#fstat'));

// ---- read-only fallback (webkitdirectory input) with an existing sidecar file
await page.evaluate(() => window.__app.reader.closeDoc());
fs.mkdirSync(SP + '/pdftest/ro/sub', { recursive: true });
fs.copyFileSync(SP + '/pdftest/test_ru.pdf', SP + '/pdftest/ro/Book.pdf');
fs.copyFileSync(SP + '/pdftest/test_land.pdf', SP + '/pdftest/ro/sub/Wide.pdf');
const fp = '304217b93ff78dbca21131016867be3e';
fs.writeFileSync(SP + '/pdftest/ro/Book.pdf.notes.json', JSON.stringify({ app: 'JyotishaDesk', kind: 'pdf-notes', v: 1, file: 'Book.pdf', fingerprint: fp, saved: new Date().toISOString(), notes: [{ id: 'x1', type: 'pin', page: 2, color: 'b', x: 0.3, y: 0.3, text: 'Из файла рядом', t: 1, u: 1 }] }));
await page.fill('#q', ''); await page.setInputFiles('#fb', SP + '/pdftest/ro');
await page.waitForFunction(() => document.querySelectorAll('#spacer .row').length === 2, null, { timeout: 10000 });
ck((await page.textContent('#folderbar')).includes('только чтение'), 'read-only folder is labelled');
ck(await page.evaluate(() => [...document.querySelectorAll('#spacer .row .nb')].length === 1), 'row with notes is marked');
await page.fill('#q', ''); await sub('book'); await page.waitForSelector('.pg canvas'); await sleep(600);
d = await page.evaluate(() => window.__app.reader.debug()); ck(d.notes === 1, 'notes read from the sidecar in read-only mode');
await page.fill('#pb-page', '2'); await page.press('#pb-page', 'Enter'); await sleep(800);
ck((await page.$$('.pg[data-n="2"] .pin')).length === 1, 'pin from sidecar drawn');
await page.click('[data-pa="pin"]'); const pr = await page.evaluate(() => { const r = document.querySelector('.pg[data-n="2"]').getBoundingClientRect(); return { x: r.left + r.width * .5, y: r.top + r.height * .5 }; });
await page.mouse.click(pr.x, pr.y); await page.fill('#ncard textarea', 'Только в браузере'); await page.click('#ncard [data-nc="done"]'); await sleep(900);
if (!(await page.isVisible('.pp-status'))) await page.click('[data-pa="p-notes"]'); await sleep(300);
const st = await page.textContent('.pp-status').catch(() => '');
console.log('  status:', st); ck(/только в этом браузере/.test(st), 'status says notes live only in the browser');
await page.screenshot({ path: shots + '/24_readonly.png' });
// reopen: IndexedDB copy is newer than the sidecar and wins
await page.evaluate(() => window.__app.reader.closeDoc()); await sleep(200);
await page.locator('#spacer .row').first().click(); await page.waitForSelector('.pg canvas'); await sleep(700);
d = await page.evaluate(() => window.__app.reader.debug()); ck(d.notes === 2, 'both notes after reopening (browser copy): ' + d.notes);
// export
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-pn="md"]')]);
const mdPath = SP + '/pdftest/notes_export.md'; await dl.saveAs(mdPath); const md = fs.readFileSync(mdPath, 'utf8');
console.log(md.split('\n').slice(0, 14).join('\n'));
ck(/Страница 2/.test(md) && /Только в браузере/.test(md), 'markdown export');

console.log('warnings:', [...new Set(warns)].slice(0, 6).join(' | '));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
console.log(fails ? 'FAILS: ' + fails : 'ALL OK');
await browser.close();
