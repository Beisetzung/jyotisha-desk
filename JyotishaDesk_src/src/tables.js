// Constant tables for Vedic astrology (classical Parashari values).

export const SIGNS = ['Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya', 'Tula', 'Vrischika', 'Dhanu', 'Makara', 'Kumbha', 'Meena'];
export const SIGN_ABBR = ['Ar', 'Ta', 'Ge', 'Cn', 'Le', 'Vi', 'Li', 'Sc', 'Sg', 'Cp', 'Aq', 'Pi'];
export const SIGN_RU = ['Овен', 'Телец', 'Близнецы', 'Рак', 'Лев', 'Дева', 'Весы', 'Скорпион', 'Стрелец', 'Козерог', 'Водолей', 'Рыбы'];

// planet ids used throughout: 0 Sun 1 Moon 2 Mars 3 Mercury 4 Jupiter 5 Venus 6 Saturn 7 Rahu 8 Ketu
export const PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
// Trans-Saturnian planets (ids 9..11) are kept apart from PLANETS: the nine grahas are all that dashas, strengths, yogas and the like use.
export const URANUS = 9, NEPTUNE = 10, PLUTO = 11;
export const OUTER = [URANUS, NEPTUNE, PLUTO];
export const OUTER_NAMES = ['Uranus', 'Neptune', 'Pluto'];
export const PLANET_ABBR = ['Su', 'Mo', 'Ma', 'Me', 'Ju', 'Ve', 'Sa', 'Ra', 'Ke', 'Ur', 'Ne', 'Pl'];
export const PLANET_RU = ['Солнце', 'Луна', 'Марс', 'Меркурий', 'Юпитер', 'Венера', 'Сатурн', 'Раху', 'Кету', 'Уран', 'Нептун', 'Плутон'];
export const SUN = 0, MOON = 1, MARS = 2, MERCURY = 3, JUPITER = 4, VENUS = 5, SATURN = 6, RAHU = 7, KETU = 8;

export const NAKSHATRAS = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha', 'Magha',
  'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha',
  'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'];

// sign lords (Aries..Pisces)
export const SIGN_LORD = [MARS, VENUS, MERCURY, MOON, SUN, MERCURY, VENUS, MARS, JUPITER, SATURN, SATURN, JUPITER];

// Vimshottari
export const VIM_ORDER = [KETU, VENUS, SUN, MOON, MARS, RAHU, JUPITER, SATURN, MERCURY];
export const VIM_YEARS = { [KETU]: 7, [VENUS]: 20, [SUN]: 6, [MOON]: 10, [MARS]: 7, [RAHU]: 18, [JUPITER]: 16, [SATURN]: 19, [MERCURY]: 17 };

// Yogini: names, lords, years (36-year cycle)
export const YOGINI = [
  { name: 'Mangala', lord: MOON, years: 1 }, { name: 'Pingala', lord: SUN, years: 2 }, { name: 'Dhanya', lord: JUPITER, years: 3 },
  { name: 'Bhramari', lord: MARS, years: 4 }, { name: 'Bhadrika', lord: MERCURY, years: 5 }, { name: 'Ulka', lord: SATURN, years: 6 },
  { name: 'Siddha', lord: VENUS, years: 7 }, { name: 'Sankata', lord: RAHU, years: 8 },
];

// exaltation: [sign, degree]; debilitation is the opposite sign, same degree
export const EXALT = { [SUN]: [0, 10], [MOON]: [1, 3], [MARS]: [9, 28], [MERCURY]: [5, 15], [JUPITER]: [3, 5], [VENUS]: [11, 27], [SATURN]: [6, 20] };
// moolatrikona: [sign, fromDeg, toDeg]
export const MOOLATRIKONA = { [SUN]: [4, 0, 20], [MOON]: [1, 3, 30], [MARS]: [0, 0, 12], [MERCURY]: [5, 15, 20], [JUPITER]: [8, 0, 10], [VENUS]: [6, 0, 15], [SATURN]: [10, 0, 20] };
export const OWN_SIGNS = { [SUN]: [4], [MOON]: [3], [MARS]: [0, 7], [MERCURY]: [2, 5], [JUPITER]: [8, 11], [VENUS]: [1, 6], [SATURN]: [9, 10] };

// natural relationships (BPHS): friends / enemies; everything else neutral
export const FRIENDS = {
  [SUN]: [MOON, MARS, JUPITER], [MOON]: [SUN, MERCURY], [MARS]: [SUN, MOON, JUPITER], [MERCURY]: [SUN, VENUS],
  [JUPITER]: [SUN, MOON, MARS], [VENUS]: [MERCURY, SATURN], [SATURN]: [MERCURY, VENUS],
};
export const ENEMIES = {
  [SUN]: [VENUS, SATURN], [MOON]: [], [MARS]: [MERCURY], [MERCURY]: [MOON],
  [JUPITER]: [MERCURY, VENUS], [VENUS]: [SUN, MOON], [SATURN]: [SUN, MOON, MARS],
};

// Ashtakavarga (BPHS): for each receiving planet, for each contributor (7 planets + lagna) the houses (counted from the contributor) that get a point
export const AV_TABLE = {
  [SUN]:     { [SUN]: [1,2,4,7,8,9,10,11], [MOON]: [3,6,10,11], [MARS]: [1,2,4,7,8,9,10,11], [MERCURY]: [3,5,6,9,10,11,12], [JUPITER]: [5,6,9,11], [VENUS]: [6,7,12], [SATURN]: [1,2,4,7,8,9,10,11], L: [3,4,6,10,11,12] },
  [MOON]:    { [SUN]: [3,6,7,8,10,11], [MOON]: [1,3,6,7,10,11], [MARS]: [2,3,5,6,9,10,11], [MERCURY]: [1,3,4,5,7,8,10,11], [JUPITER]: [1,4,7,8,10,11,12], [VENUS]: [3,4,5,7,9,10,11], [SATURN]: [3,5,6,11], L: [3,6,10,11] },
  [MARS]:    { [SUN]: [3,5,6,10,11], [MOON]: [3,6,11], [MARS]: [1,2,4,7,8,10,11], [MERCURY]: [3,5,6,11], [JUPITER]: [6,10,11,12], [VENUS]: [6,8,11,12], [SATURN]: [1,4,7,8,9,10,11], L: [1,3,6,10,11] },
  [MERCURY]: { [SUN]: [5,6,9,11,12], [MOON]: [2,4,6,8,10,11], [MARS]: [1,2,4,7,8,9,10,11], [MERCURY]: [1,3,5,6,9,10,11,12], [JUPITER]: [6,8,11,12], [VENUS]: [1,2,3,4,5,8,9,11], [SATURN]: [1,2,4,7,8,9,10,11], L: [1,2,4,6,8,10,11] },
  [JUPITER]: { [SUN]: [1,2,3,4,7,8,9,10,11], [MOON]: [2,5,7,9,11], [MARS]: [1,2,4,7,8,10,11], [MERCURY]: [1,2,4,5,6,9,10,11], [JUPITER]: [1,2,3,4,7,8,10,11], [VENUS]: [2,5,6,9,10,11], [SATURN]: [3,5,6,12], L: [1,2,4,5,6,7,9,10,11] },
  [VENUS]:   { [SUN]: [8,11,12], [MOON]: [1,2,3,4,5,8,9,11,12], [MARS]: [3,5,6,9,11,12], [MERCURY]: [3,5,6,9,11], [JUPITER]: [5,8,9,10,11], [VENUS]: [1,2,3,4,5,8,9,10,11], [SATURN]: [3,4,5,8,9,10,11], L: [1,2,3,4,5,8,9,11] },
  [SATURN]:  { [SUN]: [1,2,4,7,8,10,11], [MOON]: [3,6,11], [MARS]: [3,5,6,10,11,12], [MERCURY]: [6,8,9,10,11,12], [JUPITER]: [5,6,11,12], [VENUS]: [6,11,12], [SATURN]: [3,5,6,11], L: [1,3,4,6,10,11] },
};
export const AV_TOTALS = { [SUN]: 48, [MOON]: 49, [MARS]: 39, [MERCURY]: 54, [JUPITER]: 56, [VENUS]: 52, [SATURN]: 39 };

export const WEEKDAYS = ['Ravivara (Вс)', 'Somavara (Пн)', 'Mangalavara (Вт)', 'Budhavara (Ср)', 'Guruvara (Чт)', 'Shukravara (Пт)', 'Shanivara (Сб)'];
export const WEEKDAY_LORD = [SUN, MOON, MARS, MERCURY, JUPITER, VENUS, SATURN];

export const TITHI_NAMES = ['Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi'];
export const YOGA_NAMES = ['Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda', 'Sukarma', 'Dhriti', 'Shula', 'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata', 'Harshana', 'Vajra', 'Siddhi', 'Vyatipata', 'Variyana', 'Parigha', 'Shiva', 'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma', 'Indra', 'Vaidhriti'];
export const KARANA_MOVING = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Gara', 'Vanija', 'Vishti'];

export const AYANAMSAS = [
  { id: 1, name: 'Lahiri (Chitrapaksha)' }, { id: 3, name: 'Raman' }, { id: 5, name: 'Krishnamurti (KP)' },
  { id: 0, name: 'Fagan/Bradley' }, { id: 7, name: 'Yukteshwar' }, { id: 27, name: 'True Chitrapaksha' },
  { id: 28, name: 'True Revati' }, { id: 29, name: 'True Pushya' },
];
