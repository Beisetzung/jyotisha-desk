// Jaimini techniques: Chara dasha, arudha padas (house and graha), Upapada, Karakamsa, Jaimini sign aspects.
// Chara dasha follows P.V.R. Narasimha Rao's description (the rules JHora implements):
//   * sign sequence: all 12 signs from the lagna, forward if the 9th house from the starting sign is odd-footed, otherwise backward;
//   * period of a sign = signs counted from it to its lord (inclusive, in the direction given by the sign's own foot: odd-footed forward,
//     even-footed backward) minus one; lord in its own sign = 12 years; Scorpio (Mars/Ketu) and Aquarius (Saturn/Rahu) have two lords,
//     the stronger one is used (rules below); no exaltation/debilitation adjustment unless switched on;
//   * antardasha: 12 equal parts starting from the dasha sign itself, direction as for a sequence that starts in that sign.
// Items the sources do not settle (antardasha start, second cycle = 12 minus the first period) are implemented in the commonly used form.
import * as T from './tables.js';
import { vargaSign, norm, DEFAULT_SETTINGS } from './astro.js';
const { SUN, MOON, MARS, MERCURY, JUPITER, VENUS, SATURN, RAHU, KETU } = T;

export const ODD_FOOTED = [0, 1, 2, 6, 7, 8];
const modality = (s) => s % 3;                      // 0 movable, 1 fixed, 2 dual
const countForward = (sign) => ODD_FOOTED.includes(sign);

// direction of the sign sequence that starts at `sign`
export function sequenceForward(sign, st = DEFAULT_SETTINGS) {
  return st.charaDir === 'lagna' ? sign % 2 === 0 : ODD_FOOTED.includes((sign + 8) % 12);
}
const step = (sign, fwd, k) => (((sign + (fwd ? k : -k)) % 12) + 12) % 12;
const countTo = (from, to, fwd) => (fwd ? (to - from + 12) % 12 : (from - to + 12) % 12) + 1;   // inclusive, 1..12

function signsOfPlanets(chart) { return chart.planets.map((p) => p.sign); }

// sign where counting for `sign` ends and the lord that is used
export function charaLord(chart, sign) {
  const sg = signsOfPlanets(chart);
  const fwd = countForward(sign);
  const pair = sign === 7 ? [MARS, KETU] : sign === 10 ? [SATURN, RAHU] : null;
  const yearsFor = (lordSign) => (lordSign === sign ? 12 : countTo(sign, lordSign, fwd) - 1);
  if (!pair) {
    const lord = T.SIGN_LORD[sign];
    return { lord, lordSign: sg[lord], years: yearsFor(sg[lord]) };
  }
  const [a, b] = pair, inA = sg[a] === sign, inB = sg[b] === sign;
  if (inA && inB) return { lord: a, lordSign: sign, years: 12, why: 'оба управителя в знаке' };
  if (inA) return { lord: b, lordSign: sg[b], years: yearsFor(sg[b]), why: 'один управитель в знаке — берётся второй' };
  if (inB) return { lord: a, lordSign: sg[a], years: yearsFor(sg[a]), why: 'один управитель в знаке — берётся второй' };
  const conj = (id) => chart.planets.filter((p) => p.id !== id && p.sign === sg[id]).length;
  const pick = (() => {
    if (conj(a) !== conj(b)) return conj(a) > conj(b) ? a : b;
    if (modality(sg[a]) !== modality(sg[b])) return modality(sg[a]) < modality(sg[b]) ? a : b;
    return yearsFor(sg[a]) >= yearsFor(sg[b]) ? a : b;
  })();
  return { lord: pick, lordSign: sg[pick], years: yearsFor(sg[pick]), why: 'сильнейший из двух управителей' };
}

function adjust(chart, info, st) {
  if (!st.charaExaltAdj || info.lord > SATURN) return info.years;
  const p = chart.planets[info.lord];
  if (p.dignity === 'Exalted') return info.years + 1;
  if (p.dignity === 'Debilitated') return Math.max(1, info.years - 1);
  return info.years;
}

export function charaDasha(chart, st = DEFAULT_SETTINGS) {
  const yl = st.yearLen, lagna = chart.lagnaSign;
  const fwd = sequenceForward(lagna, st);
  const order = Array.from({ length: 12 }, (_, i) => step(lagna, fwd, i));
  const first = order.map((sign) => ({ sign, info: charaLord(chart, sign) }));
  first.forEach((x) => { x.years = adjust(chart, x.info, st); });
  const maha = [];
  let t = chart.jd;
  first.forEach((x) => { maha.push({ lord: x.sign, start: t, end: t + x.years * yl, years: x.years, cycle: 1 }); t += x.years * yl; });
  first.forEach((x) => {                          // second cycle: 12 minus the first period
    const y = 12 - x.years;
    if (y > 0) { maha.push({ lord: x.sign, start: t, end: t + y * yl, years: y, cycle: 2 }); t += y * yl; }
  });
  const children = (p) => {
    const f = sequenceForward(p.lord, st), len = (p.end - p.start) / 12;
    return Array.from({ length: 12 }, (_, i) => ({ lord: step(p.lord, f, i), start: p.start + len * i, end: p.start + len * (i + 1) }));
  };
  return {
    system: 'Chara', total: maha.reduce((a, m) => a + m.years, 0), order, forward: fwd,
    levels: ['Maha', 'Antar', 'Pratyantar', 'Sookshma', 'Prana'],
    maha, children, label: (sign) => T.SIGN_RU[sign], first,
  };
}

// ---------------------------------------------------------------- arudha padas
export const ARUDHA_NAMES = ['AL', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'UL'];
export const ARUDHA_MEANING = ['Арудха лагна: образ, статус в глазах людей', 'Дхана-пада: богатство, как оно выглядит', 'Викрама-пада: усилия, братья и сёстры', 'Матри-пада: дом, мать, комфорт', 'Мантра-пада: дети, наставники, мантры', 'Шатру-пада: враги, болезни, споры', 'Дара-пада: партнёры в делах и жизни', 'Мритью-пада: кризисы, трансформации', 'Бхагья-пада: удача, отец, учителя', 'Раджья-пада: карьера, власть', 'Лабха-пада: доходы, друзья, сети', 'Упапада: брак, супруг(а)'];

// arudha sign for something that sits in `sign` and whose lord is in `lordSign`
export function arudhaSign(sign, lordSign) {
  const n = (lordSign - sign + 12) % 12;
  let a = (lordSign + n) % 12;
  if (a === sign || a === (sign + 6) % 12) a = (sign + 9) % 12;
  return a;
}
export function bhavaArudhas(chart) {
  return Array.from({ length: 12 }, (_, i) => {
    const hs = (chart.lagnaSign + i) % 12, lord = T.SIGN_LORD[hs];
    return { house: i + 1, name: ARUDHA_NAMES[i], sign: arudhaSign(hs, chart.planets[lord].sign), meaning: ARUDHA_MEANING[i] };
  });
}
export function grahaArudhas(chart) {
  return chart.planets.slice(0, 7).map((p) => ({ id: p.id, sign: arudhaSign(p.sign, chart.planets[T.SIGN_LORD[p.sign]].sign) }));
}

// ---------------------------------------------------------------- Karakamsa
export function karakamsa(chart) {
  const ak = chart.karakas[0].planet, p = chart.planets[ak];
  const sign = vargaSign(p.lon, 9);
  const inSign = chart.planets.filter((q) => q.sign === sign).map((q) => q.id);
  return { atmakaraka: ak, sign, navamsaOfLagna: vargaSign(chart.lagna.lon, 9), planetsInSign: inSign };
}

// ---------------------------------------------------------------- Jaimini sign aspects (rashi drishti)
// movable aspects fixed except the adjacent one, fixed aspects movable except the adjacent, dual aspects the other duals
export function jaiminiAspectedSigns(sign) {
  const m = modality(sign), out = [];
  for (let s = 0; s < 12; s++) {
    if (s === sign) continue;
    const mm = modality(s);
    if (m === 0 && mm === 1 && s !== (sign + 1) % 12) out.push(s);
    else if (m === 1 && mm === 0 && s !== (sign + 11) % 12) out.push(s);
    else if (m === 2 && mm === 2) out.push(s);
  }
  return out;
}
// planets that are in the sign or aspect it (Jaimini), excluding nodes when asked
export function influencers(chart, sign) {
  const conj = [], asp = [];
  chart.planets.forEach((p) => {
    if (p.sign === sign) conj.push(p.id);
    else if (jaiminiAspectedSigns(p.sign).includes(sign)) asp.push(p.id);
  });
  return { conj, asp };
}
export const houseFrom = (fromSign, sign) => ((sign - fromSign + 12) % 12) + 1;
export const _norm = norm;
