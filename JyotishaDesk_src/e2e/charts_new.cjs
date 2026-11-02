// Degrees in charts / varga charts, Uranus-Neptune-Pluto, karakas: chart tab, vargas, strength, transits, motion, settings, dark theme
const { chromium } = require('playwright');
const SP = '/tmp/claude-0/-home-claude/e5e9f0d1-b9a1-5f66-8801-4b724ad75602/scratchpad';
const HTML = 'file://' + SP + '/jhapp/dist/JyotishaDesk.html';
const EX = SP + '/jhapp/test/fixtures/shchuchin.jhd';
const shots = SP + '/e2e/shots8'; require('fs').mkdirSync(shots, { recursive: true });
let fails = 0; const ck = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
async function run(scheme) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: scheme });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.goto(HTML); await page.waitForFunction(() => window.__appReady === true);
  await page.setInputFiles('#fone', EX); await page.waitForSelector('#view .charts svg');
  const txt = () => page.locator('#view').innerText();
  const snap = async (n) => { await page.waitForTimeout(250); await page.screenshot({ path: `${shots}/${scheme}_${n}.png` }); };
  const tag = scheme === 'dark' ? 'dark: ' : '';
  // ---- chart tab
  let svgText = await page.locator('#view .charts svg').first().textContent();
  console.log('  D1 text:', svgText.replace(/\s+/g, ' ').slice(0, 200));
  ck(/Su\s*\d+°/.test(svgText) && /Asc\s*\d+°/.test(svgText), tag + 'D1: degrees next to the planets and Asc');
  ck(/Pl\s*\d+°/.test(svgText) && /Ur\s*\d+°/.test(svgText) && /Ne\s*\d+°/.test(svgText), tag + 'D1: Uranus, Neptune, Pluto are drawn');
  ck(await page.locator('#view .charts svg .kar').count() >= 14, tag + 'karaka marks in both charts (7 + 7): ' + await page.locator('#view .charts svg .kar').count());
  ck(await page.locator('#view .charts svg .pl.out').count() >= 6, tag + 'outer planets use the "out" class');
  const d9 = await page.locator('#view .charts svg').nth(1).textContent();
  ck(/\d+°/.test(d9) && /AK|DK|AmK/.test(d9), tag + 'D9 chart has degrees and karaka marks');
  const t = await txt();
  ck(/Карака/.test(t) && await page.locator('#view tr.outrow').count() === 3, tag + 'positions table: "Карака" column and three grey rows');
  ck(/Плутон/.test(t) && /Уран/.test(t) && /Нептун/.test(t), tag + 'rows for Uranus, Neptune, Pluto');
  await snap('01_chart');
  // ---- vargas
  await page.click('#tabs [data-tab="vargas"]'); await page.waitForSelector('#view .charts svg'); await snap('02_vargas');
  let vt = await txt();
  ck(/Положения в Навамша \(D9\)/.test(vt), tag + 'varga tab: positions card for D9');
  ck(/Градусы планет во всех варгах/.test(vt), tag + 'varga tab: degrees table over all vargas');
  const vsvg = await page.locator('#view .charts svg').first().textContent();
  ck(/\d+°/.test(vsvg) && /Ur|Pl|Ne/.test(vsvg), tag + 'main varga chart: degrees and outer planets');
  const degRows = await page.locator('#view section.card', { hasText: 'Градусы планет во всех варгах' }).locator('tbody tr').count();
  ck(degRows === 13, tag + 'degree matrix: lagna + 9 + 3 outer = 13 rows, got ' + degRows);
  await page.selectOption('[data-change="varga"]', '30'); await page.waitForTimeout(300);
  vt = await txt(); ck(/Положения в Тримшамша \(D30\)/.test(vt), tag + 'D30 selected'); await snap('03_d30');
  await page.selectOption('[data-change="varga"]', '1'); await page.waitForTimeout(300);
  ck(/Положения в Раси \(D1\)/.test(await txt()), tag + 'D1 selected');
  // ---- strength: karakas
  await page.click('#tabs [data-tab="strength"]'); await page.waitForTimeout(300); await page.click('[data-act="ssub"][data-s="misc"]'); await page.waitForTimeout(400); await snap('04_strength');
  const st = await txt();
  ck(/Чара-караки/.test(st) && /Значение/.test(st) && /Натуральные \(стхира\) караки/.test(st), tag + 'strength tab: chara karaka card with meanings and the natural karakas');
  ck(/Атмакарака/.test(st) && /Даракарака/.test(st), tag + 'karaka names in Russian');
  // ---- transits
  await page.click('#tabs [data-tab="transits"]'); await page.waitForSelector('#view .charts svg'); await page.waitForTimeout(500); await snap('05_transits');
  const tt = await txt();
  ck(await page.locator('#view tr.outrow').count() === 3 && /Плутон/.test(tt), tag + 'transit table: grey rows for the outer planets');
  const trs = await page.locator('#view .charts svg').first().textContent();
  ck(/Pl/.test(trs) && /Ur/.test(trs), tag + 'transit chart: outer planets are drawn');
  await page.click('[data-act="tsub"][data-s="cal"]'); await page.waitForTimeout(600);
  ck(/Плутон/.test(await txt()), tag + 'transit calendar: Pluto can be picked');
  const plChk = page.locator('#view input[data-tr="p11"]'); ck(await plChk.count() === 1 && !(await plChk.isChecked()), tag + 'Pluto is off by default');
  await plChk.check(); await page.waitForTimeout(900);
  ck(/Плутон/.test((await txt()).split('Событий')[1] || await txt()), tag + 'Pluto events appear when it is on'); await snap('06_cal_pluto');
  // ---- motion
  await page.click('#tabs [data-tab="motion"]'); await page.waitForTimeout(1500); await snap('07_motion');
  const mrows = await page.locator('#view table').first().locator('tbody tr').count();
  ck(mrows === 12, tag + 'motion table: 12 planets, got ' + mrows);
  const mt = await txt(); console.log('  ', (mt.split('\n').find((l) => /^Плутон/.test(l)) || '').slice(0, 200));
  await page.click('[data-act="msub"][data-s="per"]'); await page.waitForTimeout(700);
  ck(/Плутон/.test(await txt()) && await page.locator('#view input[data-mo="retro:11"]').count() === 1, tag + 'retro periods: Pluto in the picker');
  await page.locator('#view input[data-mo="retro:11"]').check(); await page.waitForTimeout(900); await snap('08_retro_pluto');
  ck(/Плутон/.test((await txt()).split('Ретроградные периоды')[1] || ''), tag + 'Pluto retro period listed');
  // ---- settings: turn the three switches off
  await page.click('[data-top="settings"]'); await page.waitForSelector('#dlg[open]'); await snap('09_settings');
  await page.selectOption('#setf select[name="degrees"]', '0'); await page.selectOption('#setf select[name="marks"]', '0'); await page.selectOption('#setf select[name="outer"]', '0');
  await page.click('#setok'); await page.waitForTimeout(600);
  await page.click('#tabs [data-tab="chart"]'); await page.waitForSelector('#view .charts svg'); await page.waitForTimeout(300);
  const off = await page.locator('#view .charts svg').first().textContent();
  console.log('  switched off:', off.replace(/\s+/g, ' ').slice(0, 120));
  ck(!/\d+°/.test(off.replace(/Asc\s*\d+°/, '')) && !/Pl|Ur|Ne/.test(off.replace(/Plac/g, '')) && await page.locator('#view .charts svg .kar').count() === 0, tag + 'switches off: no degrees, no outer planets, no karaka marks');
  ck(await page.locator('#view tr.outrow').count() === 0, tag + 'switches off: no grey rows'); await snap('10_off');
  await page.click('[data-top="settings"]'); await page.waitForSelector('#dlg[open]');
  ck(await page.inputValue('#setf select[name="degrees"]') === '0', tag + 'the settings dialog shows the saved state');
  await page.selectOption('#setf select[name="degrees"]', '1'); await page.selectOption('#setf select[name="marks"]', '1'); await page.selectOption('#setf select[name="outer"]', '1'); await page.click('#setok'); await page.waitForTimeout(500);
  // ---- about
  await page.click('[data-top="about"]'); await page.waitForTimeout(200);
  const ab = await page.locator('#dlg').innerText();
  ck(/Уран, Нептун и Плутон/.test(ab) && /Караки/.test(ab) && /градус в этом знаке/.test(ab), tag + 'About mentions the new features');
  console.log('  errors:', errors.join('|') || 'none'); ck(errors.length === 0, tag + 'no page errors');
  await browser.close();
}
(async () => { await run('light'); await run('dark'); console.log(fails ? 'FAILS ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0); })();
