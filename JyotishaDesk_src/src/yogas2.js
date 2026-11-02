// Extended list of classical yogas. Definitions follow the usual textbook statements (BPHS and later compilations).
// Everything is tested by sign and house only: the strength of the planets, orbs, combustion and most cancellations are NOT weighed
// unless the text of the match says so. Each match carries the condition that triggered it.
import * as T from './tables.js';
import { aspectedSigns, vargaSign, norm } from './astro.js';
const { SUN, MOON, MARS, MERCURY, JUPITER, VENUS, SATURN, RAHU, KETU } = T;

const N = (id) => T.PLANET_RU[id];
const KENDRA = [1, 4, 7, 10], DUSTHANA = [6, 8, 12], UPACHAYA = [3, 6, 10, 11];
const STRONG = ['Own', 'Exalted', 'Moolatrikona'];

export const GROUP_ORDER = ['Раджа', 'Дхана', 'Махапуруша', 'Чандра', 'Сурья', 'Паривартана', 'Набхаса', 'Прочие', 'Доши'];

// short classical meaning, shown next to the name (keyed by the base name)
export const MEANING = {
  'Raja yoga': 'власть, положение, успех', 'Yogakaraka': 'планета, дающая и поддержку, и положение', 'Dharma-Karmadhipati': 'сочетание долга и дела: карьера, признание',
  'Dhana yoga': 'накопление богатства', 'Harsha': 'выигрыш через трудности, здоровье, победа над врагами', 'Sarala': 'долголетие, стойкость, неожиданные выигрыши', 'Vimala': 'бережливость, независимость, добрая репутация',
  'Neecha Bhanga': 'ослабление падения планеты', 'Ruchaka': 'смелость, лидерство, воля', 'Bhadra': 'ум, речь, торговля', 'Hamsa': 'мудрость, добродетель, уважение', 'Malavya': 'комфорт, искусство, семейное счастье', 'Sasa': 'власть над людьми, дисциплина',
  'Gajakesari': 'известность, ум, прочная репутация', 'Budhaditya': 'острый ум, мастерство', 'Chandra-Mangala': 'энергия в делах, заработок', 'Guru-Mangala': 'практичный ум, инициатива',
  'Sunapha': 'самостоятельно нажитое состояние', 'Anapha': 'здоровье, уверенность, репутация', 'Durudhara': 'достаток и пользование им', 'Kemadruma': 'одиночество, трудности (при отсутствии отмен)',
  'Adhi yoga': 'руководящее положение, победа над врагами', 'Sakata': 'взлёты и падения судьбы', 'Vasumati': 'достаток', 'Vesi': 'сдержанность, ясность речи', 'Vosi': 'способность, память, деловитость', 'Ubhayachari': 'положение, лидерство',
  'Maha Parivartana': 'взаимное усиление двух домов', 'Khala Parivartana': 'обмен через 3-й дом: борьба, но и инициатива', 'Dainya Parivartana': 'обмен через дусштхану: трудности, потери в домах обмена',
  'Lakshmi': 'богатство, достоинство', 'Saraswati': 'знания, красноречие, искусства', 'Chatussagara': 'известность, широкое влияние', 'Amala': 'добрая слава, безупречное поведение', 'Vargottama': 'планета одинакова в Расси и Навамше — усиливается',
  'Shubha Kartari': 'защита и поддержка', 'Papa Kartari': 'сжатие обстоятельств, давление', 'Sanyasa': 'склонность к уединению, отречению',
  'Kala Sarpa': 'карма узлов: отсрочки, резкие повороты', 'Mangal dosha': 'напряжение в партнёрстве (по традиции)', 'Guru-Chandala': 'сомнение в авторитетах, нестандартные взгляды', 'Surya Grahana': 'затмение Солнца при рождении: отец, самооценка', 'Chandra Grahana': 'затмение Луны при рождении: ум, мать, эмоции',
  'Shrapit': 'долги прошлого, задержки', 'Angarak': 'вспыльчивость, риск', 'Vish': 'тяжесть, тревожность', 'Pitra dosha': 'долг перед предками',
  'Rajju': 'подвижность, путешествия', 'Musala': 'устойчивость, самоуважение', 'Nala': 'гибкость, разносторонность',
  'Maala': 'приятная жизнь, достаток, удобства', 'Sarpa': 'трудные обстоятельства, зависть, резкость', 'Vajra': 'счастье в начале и конце жизни, смелость', 'Yava': 'счастье в середине жизни, твёрдость в обетах',
  'Vapi': 'накопление средств, запасы', 'Yupa': 'склонность к дисциплине, обрядам, духовным практикам', 'Gada': 'достаток своими усилиями, щедрость', 'Hala': 'много труда, зависимость от других', 'Vihanga': 'разъезды, посредничество, беспокойство', 'Shringataka': 'любовь к удовольствиям и спорам, популярность',
  'Gola': 'все планеты в одном знаке', 'Yuga': 'планеты в двух знаках', 'Shoola': 'планеты в трёх знаках', 'Kedara': 'планеты в четырёх знаках', 'Pasha': 'планеты в пяти знаках', 'Daama': 'планеты в шести знаках', 'Veena': 'планеты в семи знаках',
};

export function allYogas(chart) {
  const P = chart.planets, lagna = chart.lagnaSign, out = [];
  const add = (group, name, why) => { const base = name.replace(/ \(.*\)$/, ''); out.push({ group, name, why, meaning: MEANING[base] || '' }); };
  const s = (id) => P[id].sign, h = (id) => P[id].house;
  const hFrom = (fromSign, sign) => ((sign - fromSign + 12) % 12) + 1;
  const fromMoon = (id) => hFrom(s(MOON), s(id));
  const lordOf = (k) => T.SIGN_LORD[(lagna + k - 1) % 12];
  const ownsHouses = (id) => { const r = []; for (let k = 1; k <= 12; k++) if (lordOf(k) === id) r.push(k); return r; };
  const seven = [SUN, MOON, MARS, MERCURY, JUPITER, VENUS, SATURN];
  const waxing = norm(P[MOON].lon - P[SUN].lon) < 180;          // Moon 0..180 ahead of the Sun
  // natural benefics: Jupiter, Venus, Mercury and the waxing Moon (no account of Mercury's company)
  const natBenefic = (id) => id === JUPITER || id === VENUS || id === MERCURY || (id === MOON && waxing);
  const inSigns = (ids, sign) => ids.filter((id) => s(id) === sign);
  const ben3 = [MERCURY, VENUS, JUPITER];

  // two planets connected: same sign, mutual graha drishti, or exchange of signs
  const connection = (a, b) => {
    const r = [];
    if (s(a) === s(b)) r.push('вместе');
    else {
      if (aspectedSigns(P[a]).includes(s(b)) && aspectedSigns(P[b]).includes(s(a))) r.push('взаимный аспект');
      if (T.OWN_SIGNS[a].includes(s(b)) && T.OWN_SIGNS[b].includes(s(a))) r.push('обмен знаками');
    }
    return r;
  };
  const real = (a, b) => a !== b && a <= SATURN && b <= SATURN;

  // ---------- Raja yogas
  const kl = [...new Set([4, 7, 10].map(lordOf))], tl = [...new Set([5, 9].map(lordOf))];
  const seenR = new Set();
  for (const a of kl) for (const b of tl) {
    if (!real(a, b)) continue;
    const key = [a, b].sort().join('-'); if (seenR.has(key)) continue; seenR.add(key);
    const c = connection(a, b);
    if (c.length) add('Раджа', 'Raja yoga', `управитель кендры ${N(a)} и трикона ${N(b)}: ${c.join(', ')}`);
  }
  for (let id = MARS; id <= SATURN; id++) {
    const hs = ownsHouses(id), k = hs.filter((x) => [4, 7, 10].includes(x)), t = hs.filter((x) => [5, 9].includes(x));
    if (k.length && t.length) add('Раджа', 'Yogakaraka', `${N(id)} управляет кендрой (${k.join(',')}-й) и триконом (${t.join(',')}-й)`);
  }
  {
    const a = lordOf(9), b = lordOf(10);
    if (real(a, b)) { const c = connection(a, b); if (c.length) add('Раджа', 'Dharma-Karmadhipati', `управители 9-го и 10-го (${N(a)}, ${N(b)}): ${c.join(', ')}`); }
  }
  [['Harsha', 6], ['Sarala', 8], ['Vimala', 12]].forEach(([nm, k]) => {
    const l = lordOf(k);
    if (l <= SATURN && DUSTHANA.includes(h(l))) add('Раджа', `${nm} (Viparita Raja)`, `управитель ${k}-го (${N(l)}) стоит в ${h(l)}-м доме`);
  });
  for (let id = SUN; id <= SATURN; id++) {
    if (P[id].dignity !== 'Debilitated') continue;
    const disp = T.SIGN_LORD[s(id)], exl = T.SIGN_LORD[T.EXALT[id][0]];
    const ok = (pl) => KENDRA.includes(h(pl)) || KENDRA.includes(fromMoon(pl));
    if (ok(disp) || ok(exl)) add('Раджа', 'Neecha Bhanga', `${N(id)} в падении; управитель знака (${N(disp)}) или знака экзальтации (${N(exl)}) в кендре от Лагны/Луны`);
  }

  // ---------- Dhana yogas: any two of the lords of 1, 2, 5, 9, 11 connected
  const dh = [1, 2, 5, 9, 11].map((k) => [k, lordOf(k)]), seenD = new Set();
  for (let i = 0; i < dh.length; i++) for (let j = i + 1; j < dh.length; j++) {
    const [ka, a] = dh[i], [kb, b] = dh[j];
    if (!real(a, b)) continue;
    const key = [a, b].sort().join('-'); if (seenD.has(key)) continue; seenD.add(key);
    const c = connection(a, b);
    if (c.length) add('Дхана', 'Dhana yoga', `управители ${ka}-го и ${kb}-го (${N(a)}, ${N(b)}): ${c.join(', ')}`);
  }

  // ---------- Pancha Mahapurusha
  [[MARS, 'Ruchaka'], [MERCURY, 'Bhadra'], [JUPITER, 'Hamsa'], [VENUS, 'Malavya'], [SATURN, 'Sasa']].forEach(([id, nm]) => {
    if (KENDRA.includes(h(id)) && STRONG.includes(P[id].dignity)) add('Махапуруша', `${nm} (Pancha Mahapurusha)`, `${N(id)} в ${P[id].dignity === 'Exalted' ? 'экзальтации' : 'своём знаке'}, ${h(id)}-й дом`);
  });

  // ---------- Moon
  if (KENDRA.includes(fromMoon(JUPITER))) add('Чандра', 'Gajakesari', `Юпитер в ${fromMoon(JUPITER)}-м доме от Луны`);
  if (s(MOON) === s(MARS)) add('Чандра', 'Chandra-Mangala', 'Луна и Марс в одном знаке');
  if (s(JUPITER) === s(MARS) || (aspectedSigns(P[JUPITER]).includes(s(MARS)) && aspectedSigns(P[MARS]).includes(s(JUPITER)))) add('Чандра', 'Guru-Mangala', 'Юпитер и Марс вместе или во взаимном аспекте');
  const five = [MARS, MERCURY, JUPITER, VENUS, SATURN];
  const in2 = inSigns(five, (s(MOON) + 1) % 12), in12 = inSigns(five, (s(MOON) + 11) % 12), withMoon = inSigns(five, s(MOON));
  if (in2.length && in12.length) add('Чандра', 'Durudhara', `планеты во 2-м (${in2.map(N).join(', ')}) и 12-м (${in12.map(N).join(', ')}) от Луны`);
  else if (in2.length) add('Чандра', 'Sunapha', `во 2-м от Луны: ${in2.map(N).join(', ')}`);
  else if (in12.length) add('Чандра', 'Anapha', `в 12-м от Луны: ${in12.map(N).join(', ')}`);
  else if (!withMoon.length) {
    const cancel = [];
    if (KENDRA.includes(h(MOON))) cancel.push('Луна в кендре от Лагны');
    const k = five.filter((id) => KENDRA.includes(fromMoon(id)));
    if (k.length) cancel.push('планеты в кендре от Луны: ' + k.map(N).join(', '));
    add('Чандра', cancel.length ? 'Kemadruma (отменена)' : 'Kemadruma', 'нет планет (кроме Солнца и узлов) с Луной и во 2-м/12-м от неё' + (cancel.length ? '; отмена: ' + cancel.join('; ') : ''));
  }
  const adhiM = ben3.filter((id) => [6, 7, 8].includes(fromMoon(id)));
  if (adhiM.length >= 2) add('Чандра', 'Adhi yoga', `благие в 6/7/8 от Луны: ${adhiM.map(N).join(', ')}${adhiM.length < 3 ? ' (неполная)' : ''}`);
  const adhiL = ben3.filter((id) => [6, 7, 8].includes(h(id)));
  if (adhiL.length >= 2) add('Чандра', 'Adhi yoga', `благие в 6/7/8 от Лагны: ${adhiL.map(N).join(', ')}${adhiL.length < 3 ? ' (неполная)' : ''}`);
  if (DUSTHANA.includes(hFrom(s(JUPITER), s(MOON))) && !KENDRA.includes(h(MOON))) add('Чандра', 'Sakata', `Луна в ${hFrom(s(JUPITER), s(MOON))}-м от Юпитера и не в кендре от Лагны`);
  if (ben3.every((id) => UPACHAYA.includes(fromMoon(id)))) add('Чандра', 'Vasumati', 'Меркурий, Венера и Юпитер в упачая-домах (3/6/10/11) от Луны');
  else if (ben3.every((id) => UPACHAYA.includes(h(id)))) add('Чандра', 'Vasumati', 'Меркурий, Венера и Юпитер в упачая-домах (3/6/10/11) от Лагны');

  // ---------- Sun (the Moon is not counted)
  const s2 = inSigns(five, (s(SUN) + 1) % 12), s12 = inSigns(five, (s(SUN) + 11) % 12);
  if (s2.length && s12.length) add('Сурья', 'Ubhayachari', 'планеты по обе стороны от Солнца (2-й и 12-й), без Луны');
  else if (s2.length) add('Сурья', 'Vesi', `во 2-м от Солнца: ${s2.map(N).join(', ')}`);
  else if (s12.length) add('Сурья', 'Vosi', `в 12-м от Солнца: ${s12.map(N).join(', ')}`);
  if (s(SUN) === s(MERCURY)) add('Сурья', 'Budhaditya', 'Солнце и Меркурий в одном знаке' + (P[MERCURY].combust ? ' (Меркурий сожжён)' : ''));

  // ---------- Parivartana by kind: the kind follows the two houses in which the planets sit (each owns the other's house)
  for (let a = SUN; a <= SATURN; a++) for (let b = a + 1; b <= SATURN; b++) {
    if (s(a) === s(b) || !T.OWN_SIGNS[a].includes(s(b)) || !T.OWN_SIGNS[b].includes(s(a))) continue;
    const hs = [h(a), h(b)];
    const kind = hs.some((k) => DUSTHANA.includes(k)) ? 'Dainya Parivartana' : hs.includes(3) ? 'Khala Parivartana' : 'Maha Parivartana';
    add('Паривартана', kind, `${N(a)} (в ${h(a)}-м) и ${N(b)} (в ${h(b)}-м) обменялись знаками`);
  }

  // ---------- Lakshmi / Saraswati / Chatussagara / Amala / Vargottama / Sanyasa
  const l9 = lordOf(9), l1 = lordOf(1);
  if (STRONG.includes(P[l9].dignity) && (KENDRA.includes(h(l9)) || [5, 9].includes(h(l9))) && (KENDRA.includes(h(l1)) || [5, 9].includes(h(l1)) || STRONG.includes(P[l1].dignity)))
    add('Прочие', 'Lakshmi', `управитель 9-го (${N(l9)}) в своём знаке/экзальтации в кендре или трикона; управитель Лагны (${N(l1)}) в кендре/трикона либо в силе`);
  if (ben3.every((id) => KENDRA.includes(h(id)) || [2, 5, 9].includes(h(id))) && ['Own', 'Exalted', 'Moolatrikona', 'Adhimitra', 'Mitra'].includes(P[JUPITER].dignity))
    add('Прочие', 'Saraswati', 'Юпитер, Венера и Меркурий в кендрах, трикона или 2-м доме; Юпитер в своём/дружественном знаке или экзальтации');
  if (KENDRA.every((k) => P.slice(0, 9).some((p) => p.house === k))) add('Прочие', 'Chatussagara', 'все четыре кендры заняты планетами');
  const amL = [MOON, MERCURY, JUPITER, VENUS].filter((id) => h(id) === 10), amM = [MERCURY, JUPITER, VENUS].filter((id) => fromMoon(id) === 10);
  if (amL.length) add('Прочие', 'Amala', 'благая планета в 10-м от Лагны: ' + amL.map(N).join(', '));
  if (amM.length) add('Прочие', 'Amala', 'благая планета в 10-м от Луны: ' + amM.map(N).join(', '));
  for (let id = SUN; id <= SATURN; id++) if (vargaSign(P[id].lon, 9) === s(id)) add('Прочие', 'Vargottama', `${N(id)}: один знак в Расси и Навамше (${T.SIGN_RU[s(id)]})`);
  const crowd = new Map();
  seven.forEach((id) => crowd.set(s(id), [...(crowd.get(s(id)) || []), id]));
  for (const [sign, ids] of crowd) if (ids.length >= 4) add('Прочие', 'Sanyasa', `${ids.length} планет в одном знаке (${T.SIGN_RU[sign]}): ${ids.map(N).join(', ')}`);

  // ---------- Kartari around the lagna and the Moon
  const kartari = (sign, who) => {
    const a = (sign + 11) % 12, b = (sign + 1) % 12, ids = T.PLANETS.map((_, i) => i);
    const pa = ids.filter((id) => s(id) === a), pb = ids.filter((id) => s(id) === b);
    if (!pa.length || !pb.length) return;
    const all = [...pa, ...pb];
    if (all.every((id) => id <= SATURN && natBenefic(id))) add('Прочие', `Shubha Kartari (${who})`, `по обе стороны только благие: ${all.map(N).join(', ')}`);
    else if (all.every((id) => !(id <= SATURN && natBenefic(id)))) add('Прочие', `Papa Kartari (${who})`, `по обе стороны только злые: ${all.map(N).join(', ')}`);
  };
  kartari(lagna, 'от Лагны'); kartari(s(MOON), 'от Луны');

  // ---------- Nabhasa (seven planets Sun..Saturn only)
  const houses7 = seven.map(h), signs7 = seven.map(s);
  const mod = (id) => s(id) % 3;
  if (seven.every((id) => mod(id) === 0)) add('Набхаса', 'Rajju', 'все семь планет в подвижных знаках');
  if (seven.every((id) => mod(id) === 1)) add('Набхаса', 'Musala', 'все семь планет в неподвижных знаках');
  if (seven.every((id) => mod(id) === 2)) add('Набхаса', 'Nala', 'все семь планет в двойственных знаках');
  const kBen = KENDRA.filter((k) => seven.some((id) => h(id) === k && natBenefic(id))), kMal = KENDRA.filter((k) => seven.some((id) => h(id) === k && !natBenefic(id)));
  if (kBen.length >= 3 && !kMal.length) add('Набхаса', 'Maala', `благие занимают кендры ${kBen.join(', ')}, злых в кендрах нет`);
  if (kMal.length >= 3 && !kBen.length) add('Набхаса', 'Sarpa', `злые занимают кендры ${kMal.join(', ')}, благих в кендрах нет`);
  const used = new Set(signs7).size;
  add('Набхаса', { 1: 'Gola', 2: 'Yuga', 3: 'Shoola', 4: 'Kedara', 5: 'Pasha', 6: 'Daama', 7: 'Veena' }[used], `семь планет занимают ${used} ${used === 1 ? 'знак' : used < 5 ? 'знака' : 'знаков'}`);
  const shapes = [
    ['Shakata', [1, 7]], ['Vihanga', [4, 10]], ['Gada', [1, 4]], ['Gada', [4, 7]], ['Gada', [7, 10]], ['Gada', [10, 1]],
    ['Shringataka', [1, 5, 9]], ['Hala', [2, 6, 10]], ['Hala', [3, 7, 11]], ['Hala', [4, 8, 12]], ['Kamala', [1, 4, 7, 10]],
    ['Yupa', [1, 2, 3, 4]], ['Shara', [4, 5, 6, 7]], ['Shakti', [7, 8, 9, 10]], ['Danda', [10, 11, 12, 1]],
    ['Vapi', [2, 5, 8, 11]], ['Vapi', [3, 6, 9, 12]],
  ];
  const shown = new Set();
  for (const [nm, set] of shapes) {
    if (shown.has(nm)) continue;
    if (houses7.every((k) => set.includes(k)) && set.every((k) => houses7.includes(k))) { shown.add(nm); add('Набхаса', nm, `семь планет занимают именно дома ${set.join(', ')}`); }
  }
  const benS = (ks) => ks.every((k) => seven.some((id) => h(id) === k && natBenefic(id))), malS = (ks) => ks.every((k) => seven.some((id) => h(id) === k && !natBenefic(id)));
  if (benS([1, 7]) && malS([4, 10])) add('Набхаса', 'Vajra', 'благие в 1-м и 7-м, злые в 4-м и 10-м');
  if (benS([4, 10]) && malS([1, 7])) add('Набхаса', 'Yava', 'благие в 4-м и 10-м, злые в 1-м и 7-м');

  // ---------- Doshas
  if (s(JUPITER) === s(RAHU)) add('Доши', 'Guru-Chandala', 'Юпитер вместе с Раху');
  const rl = P[RAHU].lon, side = seven.map((id) => norm(P[id].lon - rl) < 180);
  if (side.every(Boolean) || side.every((x) => !x)) add('Доши', 'Kala Sarpa', 'все семь планет по одну сторону оси Раху-Кету');
  const mars = [h(MARS), fromMoon(MARS), hFrom(s(VENUS), s(MARS))], md = [1, 2, 4, 7, 8, 12], mp = [];
  ['Лагны', 'Луны', 'Венеры'].forEach((w, i) => { if (md.includes(mars[i])) mp.push(`от ${w} (${mars[i]}-й)`); });
  if (mp.length) add('Доши', 'Mangal dosha', 'Марс в 1/2/4/7/8/12: ' + mp.join(', ') + ' — без учёта отмен');
  for (const lum of [SUN, MOON]) for (const nd of [RAHU, KETU]) if (s(lum) === s(nd)) add('Доши', lum === SUN ? 'Surya Grahana' : 'Chandra Grahana', `${N(lum)} вместе с ${N(nd)} в знаке ${T.SIGN_RU[s(lum)]}`);
  if (s(SATURN) === s(RAHU)) add('Доши', 'Shrapit', 'Сатурн вместе с Раху');
  if (s(MARS) === s(RAHU)) add('Доши', 'Angarak', 'Марс вместе с Раху');
  if (s(MOON) === s(SATURN)) add('Доши', 'Vish', 'Луна вместе с Сатурном');
  if (h(SUN) === 9 && (s(SUN) === s(RAHU) || s(SUN) === s(SATURN))) add('Доши', 'Pitra dosha', 'Солнце в 9-м доме вместе с Раху или Сатурном');

  out.sort((x, y) => GROUP_ORDER.indexOf(x.group) - GROUP_ORDER.indexOf(y.group));
  return out;
}
