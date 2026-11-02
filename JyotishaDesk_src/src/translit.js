// Search helpers for place names: lower-case/diacritics folding, a rough Russian -> Latin transliteration and consonant "skeletons"
// that make "Екатеринбург" findable as "Yekaterinburg" and "Киев" as "Kyiv".
const CYR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', і: 'i', ї: 'i', є: 'e', ґ: 'g', ў: 'u' };
export const hasCyrillic = (s) => /[Ѐ-ӿ]/.test(s);
export function fold(s) {                       // lower case, no diacritics, only letters and digits (Latin and Cyrillic), ё = е
  return String(s).toLowerCase().replace(/ё/g, 'е').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9Ѐ-ӿ]+/g, ' ').trim();
}
export function translit(s) {
  let out = '';
  for (const ch of fold(s)) out += CYR[ch] !== undefined ? CYR[ch] : ch;
  return out;
}
// consonant skeleton: sounds that transliterations spell differently are merged, vowels dropped
export function skeleton(latin) {
  let t = fold(latin).replace(/[^a-z0-9 ]/g, '');
  t = t.replace(/shch|sch/g, 'S').replace(/zh/g, 'J').replace(/kh/g, 'H').replace(/ch/g, 'C').replace(/sh/g, 'S').replace(/ts/g, 'C').replace(/ph/g, 'f')
    .replace(/ck/g, 'k').replace(/x/g, 'ks').replace(/[qc]/g, 'k').replace(/w/g, 'v').replace(/h/g, 'H').replace(/j/g, 'J').replace(/z/g, 's');
  return t.replace(/[aeiouy ]/g, '').replace(/(.)\1+/g, '$1').toLowerCase();
}
