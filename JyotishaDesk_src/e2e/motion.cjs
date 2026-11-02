const { chromium } = require('playwright');
const SP = '/tmp/claude-0/-home-claude/e5e9f0d1-b9a1-5f66-8801-4b724ad75602/scratchpad';
const HTML = 'file://' + SP + '/jhapp/dist/JyotishaDesk.html';
const DATA = SP + '/jh_extract/Jagannatha Hora/data';
const shots = SP + '/e2e/shots6';
require('fs').mkdirSync(shots, { recursive: true });
let fails = 0; const ck = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.goto(HTML);
  await page.waitForFunction(() => window.__appReady === true, null, { timeout: 20000 });
  await page.setInputFiles('#fb', DATA);
  await page.waitForFunction(() => document.querySelectorAll('#spacer .row').length >= 10, null, { timeout: 15000 });
  await page.fill('#q', 'gandhi'); await page.waitForTimeout(250);
  await page.locator('#spacer .row').first().click();
  await page.waitForSelector('#view .charts svg');
  const snap = async (name) => { await page.waitForTimeout(300); await page.screenshot({ path: `${shots}/${name}.png` }); };
  const txt = () => page.locator('#view').innerText();
  const tabs = await page.locator('#tabs button').allInnerTexts();
  ck(tabs.includes('Движение'), 'tab "Движение" exists: ' + tabs.join(' | '));
  // natal table
  const nat = await txt();
  ck(/Скорость, °\/сут/.test(nat), 'natal positions table has the speed column');
  await snap('01_chart');
  // motion tab at birth
  await page.click('#tabs [data-tab="motion"]'); await snap('02_at_birth');
  let t = await txt();
  ck(/Предыдущая стоянка/.test(t) && /Следующая стоянка/.test(t), 'at-tab tables are shown');
  ck(await page.locator('#view input[data-mo="date"]').inputValue() === '1869-10-02', 'date defaults to the birth date');
  const rows = await page.locator('#view table').first().locator('tbody tr').count();
  ck(rows === 12, 'nine planets + Uranus, Neptune, Pluto in the speed table: ' + rows);
  console.log(t.split('\n').filter((l) => /Сатурн|Меркурий|Раху/.test(l)).slice(0, 6).join('\n'));
  ck(/Раху[\s\S]*ретро/.test(t) && /средний узел/.test(t), 'Rahu is retrograde (mean node)');
  // a stationary date: Saturn station 2024-06-29
  await page.fill('#view input[data-mo="date"]', '2024-06-29'); await page.dispatchEvent('#view input[data-mo="date"]', 'change'); await page.waitForTimeout(500);
  t = await txt(); await snap('03_at_station');
  ck(/стационарна → ретро/.test(t), 'Saturn stationary (to retro) is flagged on 2024-06-29: ' + (t.match(/Сатурн[^\n]*/) || [''])[0].slice(0, 120));
  // buttons
  await page.click('[data-act="mbirth"]'); await page.waitForTimeout(300);
  ck(await page.locator('#view input[data-mo="date"]').inputValue() === '1869-10-02', '"Рождение" returns to the birth date');
  await page.click('[data-act="mstep"][data-u="y"][data-k="1"]'); ck(await page.locator('#view input[data-mo="date"]').inputValue() === '1870-10-02', '+1 год');
  await page.click('[data-act="mnow"]'); await snap('04_at_now');
  // periods: retro (default)
  await page.click('[data-act="msub"][data-s="per"]'); await page.waitForTimeout(400); await snap('05_per_retro');
  t = await txt();
  ck(/Ретроградные периоды/.test(t), 'retro periods card'); console.log('  retro rows (2y):', await page.locator('#view table tbody tr').count());
  await page.click('[data-act="mvp"][data-p="b30"]'); await page.waitForTimeout(800); await snap('06_per_retro_life');
  const lifeRows = await page.locator('#view table tbody tr').count(); console.log('  retro rows birth+30y:', lifeRows);
  ck(lifeRows > 80, 'many retro periods in 30 years');
  // signs
  await page.click('[data-act="mmode"][data-m="sign"]'); await page.waitForTimeout(800); await snap('07_per_sign');
  console.log('  sign cards:', await page.locator('#view section.card h3').allInnerTexts().then((a) => a.join(' | ')));
  // nak, pada
  await page.click('[data-act="mmode"][data-m="nak"]'); await page.waitForTimeout(800); await snap('08_per_nak');
  await page.click('[data-act="mmode"][data-m="pada"]'); await page.waitForTimeout(800); await snap('09_per_pada');
  // moon, 1 year, nak
  await page.click('[data-act="mmode"][data-m="nak"]'); await page.waitForTimeout(300);
  await page.click('input[data-mo="nak:1"]'); await page.waitForTimeout(300);
  await page.click('[data-act="mvp"][data-p="b1"]'); await page.waitForTimeout(1200); await snap('10_moon_nak');
  const moonCard = page.locator('#view section.card:has(h3:has-text("Луна"))').first();
  const moonRows = await moonCard.locator('tbody tr').count(); console.log('  Moon nakshatra rows in 1 year:', moonRows);
  ck(moonRows >= 360 && moonRows <= 370, 'Moon: ~1 nakshatra change per day (365 days -> ' + moonRows + ' rows)');
  // moon pada 40 years -> must be capped and fast
  await page.click('[data-act="mmode"][data-m="pada"]'); await page.waitForTimeout(300);
  await page.click('input[data-mo="pada:1"]');
  await page.fill('input[data-mo="to"]', '1909-10-02'); await page.dispatchEvent('input[data-mo="to"]', 'change');
  const t0 = Date.now(); await page.waitForFunction(() => !document.querySelector('.busy'), null, { timeout: 60000 }); await page.waitForTimeout(500);
  console.log('  Moon pada 40y capped, ms', Date.now() - t0); await snap('11_moon_pada_cap');
  ck(/сокращён/.test(await txt()), 'long Moon list is shortened with a note');
  // transits tab: stationary tag
  await page.click('#tabs [data-tab="transits"]');
  await page.fill('#view input[data-tr="date"]', '2024-06-29'); await page.dispatchEvent('#view input[data-tr="date"]', 'change'); await page.waitForTimeout(500);
  ck(/стац\./.test(await txt()), 'transit table marks the stationary planet'); await snap('12_transit_stat');
  console.log(errors.length ? 'ERRORS: ' + errors.join('\n') : 'ERRORS: none');
  console.log(fails ? 'FAILS ' + fails : 'ALL OK');
  await browser.close();
})();
