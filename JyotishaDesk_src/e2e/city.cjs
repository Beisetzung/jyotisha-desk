// The user's example chart (Shchuchin, Belarus, 10.11.1986): opening, zone check, new chart with the remembered place
const { chromium } = require('playwright');
const SP = '/tmp/claude-0/-home-claude/e5e9f0d1-b9a1-5f66-8801-4b724ad75602/scratchpad';
const HTML = 'file://' + SP + '/jhapp/dist/JyotishaDesk.html';
const EX = SP + '/jhapp/test/fixtures/shchuchin.jhd';
const shots = SP + '/e2e/shots7'; require('fs').mkdirSync(shots, { recursive: true });
let fails = 0; const ck = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.goto(HTML); await page.waitForFunction(() => window.__appReady === true);
  // 1. new chart with nothing remembered: no default city
  await page.click('[data-side="new"]'); await page.waitForSelector('#dlg[open]');
  ck(await page.inputValue('#ef input[name="city"]') === '' && await page.inputValue('#ef input[name="lat"]') === '', 'new chart: no default city (it used to be Moscow)');
  await page.click('#eok'); await page.waitForTimeout(200);
  ck(/Выберите город/.test(await page.locator('#eerr').innerText()), 'new chart without a city: asks to choose one');
  await page.screenshot({ path: shots + '/01_new_empty.png' });
  // typing the Latin spelling used in JHora finds the place
  await page.fill('#ef input[name="city"]', 'Shchuchin, Belarus'); await page.waitForSelector('.cityopt', { timeout: 8000 });
  const first = (await page.locator('.cityopt').first().innerText()).replace(/\n/g, ' ');
  ck(/Shchuchyn/.test(first) && /Беларусь/.test(first), '"Shchuchin, Belarus" finds Shchuchyn: ' + first);
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  await page.fill('#ef input[name="y"]', '1986'); await page.fill('#ef input[name="m"]', '11'); await page.fill('#ef input[name="d"]', '10'); await page.locator('#ef input[name="d"]').dispatchEvent('change');
  await page.waitForTimeout(200);
  console.log('  tzinfo:', await page.locator('#tzinfo').innerText());
  ck(await page.inputValue('#ef input[name="tz"]') === '+03:00' && await page.inputValue('#ef input[name="dst"]') === '0', 'Minsk 10.11.1986: +03:00, no DST (' + await page.inputValue('#ef input[name="tz"]') + ')');
  await page.fill('#ef input[name="name"]', 'Test new'); await page.click('#eok'); await page.waitForTimeout(500);
  ck(await page.locator('#dlg[open]').count() === 0, 'chart created');
  // 2. the next new chart starts with the same place
  await page.click('[data-top="edit"]'); await page.click('#dlg [data-close]');
  await page.evaluate(() => document.querySelector('[data-side="new"]') && document.querySelector('[data-side="new"]').click());
  if (!(await page.locator('#dlg[open]').count())) await page.click('[data-side="new"]');
  await page.waitForSelector('#dlg[open]'); await page.waitForTimeout(700);
  const city = await page.inputValue('#ef input[name="city"]');
  ck(/Shchuchyn/.test(city), 'next new chart is offered the last place: "' + city + '"');
  console.log('  lat/lon/tz:', await page.inputValue('#ef input[name="lat"]'), await page.inputValue('#ef input[name="lon"]'), await page.inputValue('#ef input[name="tz"]'), '|', await page.locator('#tzinfo').innerText());
  await page.screenshot({ path: shots + '/02_new_remembered.png' });
  await page.click('#dlg [data-close]');
  // 3. open the example file
  await page.setInputFiles('#fone', EX); await page.waitForSelector('#view .charts svg');
  const info = await page.locator('#view').innerText();
  const m = info.match(/Дата и время\s*([^\n]*)/); console.log('  date/time line:', m && m[1]);
  ck(/\+02:00 \+ 1 ч летнее/.test(info), 'example: zone +2 and 1 h of DST are read');
  ck(/Shchuchin/.test(info), 'place shown');
  await page.screenshot({ path: shots + '/03_example.png' });
  await page.click('[data-top="edit"]'); await page.waitForSelector('#dlg[open]'); await page.waitForTimeout(800);
  ck(await page.inputValue('#ef input[name="city"]') === 'Shchuchin, Belarus', 'edit: the city field is filled from the chart');
  const tzi = await page.locator('#tzinfo').innerText(); console.log('  tzinfo:', tzi);
  ck(/Пояс проверен/.test(tzi), 'edit: zone check passes for the example (+3 = Europe/Minsk)');
  await page.screenshot({ path: shots + '/04_example_edit.png' });
  // change tz to +2/0 -> mismatch is reported with a button
  await page.fill('#ef input[name="dst"]', '0'); await page.locator('#ef input[name="dst"]').dispatchEvent('change'); await page.waitForTimeout(200);
  ck(/В карте UTC\+02:00/.test(await page.locator('#tzinfo').innerText()) && await page.locator('[data-applyzone]').count() === 1, 'edit: a mismatch is reported with a button');
  await page.click('[data-applyzone]'); await page.waitForTimeout(200);
  console.log('  after button: tz', await page.inputValue('#ef input[name="tz"]'), 'dst', await page.inputValue('#ef input[name="dst"]'), await page.locator('#tzinfo').innerText());
  ck(await page.inputValue('#ef input[name="tz"]') === '+03:00' && await page.inputValue('#ef input[name="dst"]') === '0', 'the button applies the atlas zone');
  await page.click('#dlg [data-close]');
  console.log(errors.length ? 'ERRORS: ' + errors.join('\n') : 'ERRORS: none'); console.log(fails ? 'FAILS ' + fails : 'ALL OK');
  await browser.close();
})();
