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
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text().slice(0, 200)); });
await page.goto(URL); await page.waitForFunction(() => window.__appReady === true);
const names = ['enc.pdf', 'broken.pdf', 'fake.pdf', 'test_ru.pdf'];
const payload = names.map((n) => ({ n, b64: fs.readFileSync(SP + '/pdftest/' + n).toString('base64') }));
await page.evaluate(async (payload) => {
  const root = await navigator.storage.getDirectory();
  const db = await root.getDirectoryHandle('pdf3', { create: true });
  for (const f of payload) { const fh = await db.getFileHandle(f.n, { create: true }), w = await fh.createWritable(); const bin = atob(f.b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); await w.write(u); await w.close(); }
  window.__pdfroot = db;
}, payload);
await page.click('.modes [data-mode="pdf"]');
await page.evaluate(() => window.__app.useDirectory(window.__pdfroot));
await page.waitForFunction(() => document.querySelectorAll('#spacer .row').length === 4, null, { timeout: 10000 });
const open = async (name) => { await page.fill('#q', name); await sleep(150); await page.locator('#spacer .row').first().click(); };

// broken / fake
await open('fake'); await page.waitForFunction(() => /Не удалось открыть/.test(document.querySelector('#pstate').textContent), null, { timeout: 15000 });
console.log('  fake:', (await page.textContent('#pstate')).replace(/\s+/g, ' ').slice(0, 160));
ck(true, 'fake PDF reports an error instead of hanging');
await open('broken'); await sleep(2500);
const bt = await page.textContent('#pstate'); console.log('  broken:', bt.replace(/\s+/g, ' ').slice(0, 200));
const bd = await page.evaluate(() => window.__app.reader.debug()); console.log('  broken debug', JSON.stringify(bd));
ck(/Не удалось/.test(bt) || bd.N > 0, 'truncated PDF: error shown or recovered pages');

// password
await open('enc'); await page.waitForSelector('#dlg[open] #pwi', { timeout: 15000 });
await page.fill('#pwi', 'wrong'); await page.click('#pwok'); await page.waitForSelector('#dlg[open] #pwi', { timeout: 15000 }); await sleep(300);
ck(/не подошёл/.test(await page.textContent('#dlg')), 'wrong password asks again');
await page.fill('#pwi', 'userpw'); await page.click('#pwok'); await page.waitForSelector('.pg canvas', { timeout: 20000 }); await sleep(500);
ck((await page.evaluate(() => window.__app.reader.debug())).N === 1, 'encrypted PDF opens with the right password');
ck(await page.evaluate(() => !document.querySelector('#dlg').open), 'password dialog closed');
// cancel
await page.evaluate(() => window.__app.reader.closeDoc()); await open('enc'); await page.waitForSelector('#dlg[open] #pwi'); await page.click('#dlg [data-close]'); await sleep(800);
ck(/Не удалось открыть/.test(await page.textContent('#pstate')), 'cancelled password shows a message');

// good doc, then switch while another is loading (race)
await page.fill('#q', ''); await sleep(100);
await page.locator('#spacer .row', { hasText: 'test_ru' }).click(); await page.locator('#spacer .row', { hasText: 'enc' }).click(); await sleep(300);
await page.fill('#pwi', 'userpw').catch(() => {}); await page.click('#pwok').catch(() => {}); await sleep(1500);
console.log('  race debug', JSON.stringify(await page.evaluate(() => window.__app.reader.debug())), (await page.textContent('#pb-title')));

// reload: PDF mode is restored. (Headless Chromium crashes when an OPFS handle is read back from IndexedDB after a reload, so the
// stored handles are removed first and the remembered folder is simulated below.)
await page.evaluate(() => new Promise((res) => { const rq = indexedDB.open('jhora-web', 1); rq.onsuccess = () => { const tx = rq.result.transaction('kv', 'readwrite'); tx.objectStore('kv').delete('dir-pdf'); tx.objectStore('kv').delete('dir'); tx.oncomplete = res; }; }));
await page.reload(); await page.waitForFunction(() => window.__appReady === true); await sleep(500);
ck(await page.evaluate(() => document.querySelector('#main').classList.contains('pdfmode')), 'PDF mode restored after reload');
ck(await page.evaluate(() => /pdfmode/.test(document.querySelector('#main').className) && document.querySelector('.modes [data-mode="pdf"]').classList.contains('on')), 'mode switch shows PDF');
await page.evaluate(async () => { const root = await navigator.storage.getDirectory(); const db = await root.getDirectoryHandle('pdf3'); window.__app.S.remembered = { name: 'pdf3', handle: db }; });
await page.click('.modes [data-mode="charts"]'); await page.click('.modes [data-mode="pdf"]'); await sleep(300);
const fbText = await page.textContent('#folderbar'); console.log('  folderbar:', fbText.replace(/\s+/g, ' '));
ck(/Продолжить: «pdf3»/.test(fbText), 'remembered PDF folder offered');
await page.click('#folderbar [data-side="resume"]');
await page.waitForFunction(() => document.querySelectorAll('#spacer .row').length === 4, null, { timeout: 10000 });
ck(true, 'resume reads the PDF folder');
await page.screenshot({ path: shots + '/30_resume.png' });
// charts mode has its own folder state
await page.click('.modes [data-mode="charts"]'); await sleep(300);
const ct = await page.textContent('#folderbar'); console.log('  charts folderbar:', ct.replace(/\s+/g, ' '));
ck(!/pdf3/.test(ct), 'charts library does not show the PDF folder');
console.log('errors:', errors.length ? [...new Set(errors)].join('\n') : 'none');
console.log(fails ? 'FAILS: ' + fails : 'ALL OK');
await browser.close();
