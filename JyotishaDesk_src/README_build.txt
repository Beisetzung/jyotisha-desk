Jyotisha Desk - исходники
=========================
Один HTML-файл: приложение, WebAssembly-эфемериды (Swiss Ephemeris), атлас городов и читалка PDF (pdf.js) внутри.

Сборка (Node 18+):
  mkdir npmwork && cd npmwork && npm init -y && npm i sweph-wasm@2.6.9 pdfjs-dist@5.7.284 esbuild && cd ..
  node build.mjs            -> dist/JyotishaDesk.html

Атлас (data/atlas.tsv.gz уже лежит в архиве; пересобрать из GeoNames):
  скачать cities1000.zip с download.geonames.org/export/dump/ и распаковать cities1000.txt
  node tools/build_atlas.mjs путь/к/cities1000.txt   -> data/atlas.tsv.gz
  (в атласе: названия, русские альтернативные названия, страна, область, координаты, население, IANA-пояс)

Тесты расчётного ядра (нужны ваши .jhd; путь к ним задаётся в test/common.mjs, константа DATA):
  node test/t_charts.mjs ; node test/t_more.mjs ; node test/t_shadbala.mjs ; node test/t_jaimini.mjs
  node test/t_yogas.mjs ; node test/t_transit_varsha.mjs ; node test/t_eclipse.mjs
  node test/t_atlas.mjs ; node test/t_timing.mjs   (скорость поиска событий и затмений)
  node test/t_example.mjs  (пример карты test/fixtures/shchuchin.jhd: разбор строк 9/10 с летним временем, запись, поиск по атласу)
  node test/t_vargadeg.mjs (градусы в варгах, Уран/Нептун/Плутон, метки карак в клетках карт)
  node test/t_motion.mjs   (входы в знаки/накшатры/пады, стоянки, ретро-периоды; сверка с перебором и с известными датами 2024-2025; test/fixtures/transitx_old.js - прежняя findEvents для сверки)

Структура src/:
  astro.js, tables.js, jhd.js, swe.js       ядро: карта, варги, даши Вимшоттари/Йогини, Шадбала, панчанга, запись .jhd
  jaimini.js                                Чара-даша, арудхи, Карака-амша, раши-драшти
  yogas2.js                                 йоги (определения по знакам/домам, без оценки силы)
  transitx.js                               входы в знаки/накшатры/пады, стоянки, ретро-периоды, пребывание в зоне, Сади Сати, гочара с ведхой, транзит к натальным точкам
  varsha.js                                 Варшапхала (Таджика), Мудда-даша
  eclipse.js                                солнечные и лунные затмения
  translit.js                               транслитерация и поиск по названиям
  app/                                      интерфейс (views*.js, main.js, atlas.js, store.js, style.css)
  app/views_motion.js                       вкладка «Движение» (скорость, стоянки, периоды в знаках/накшатрах/падах, ретро)
  app/pdfreader.js, pdfnotes.js, pdfjs_loader.js, pdf.css
                                            читалка PDF: страницы/масштаб/текстовый слой/поиск, заметки (файл рядом с PDF + IndexedDB),
                                            ленивая загрузка pdf.js (gzip+base64 внутри HTML, воркер - обычный blob Worker)

Тесты читалки PDF (Playwright + Chromium, пример запуска на локальном сервере из dist/; нужны тестовые PDF):
  e2e/city.cjs (новая карта: нет Москвы по умолчанию, город и пояс из атласа, проверка пояса), e2e/charts_new.cjs (градусы в варгах, Уран/Нептун/Плутон, караки)
  e2e/pdf1.mjs (открытие, масштаб, заметки), e2e/pdf2.mjs (оглавление, поиск, ссылки, сканы, пароль, ошибки), e2e/pdf3.mjs (папка PDF, режимы)
  Замечание: Chromium headless падает при перезагрузке страницы, если в IndexedDB лежит дескриптор папки OPFS - это среда тестов, не приложение.

Лицензии:
  pdf.js (c) Mozilla Foundation - Apache-2.0; декодер JBIG2 (PDFium) - BSD-3-Clause; OpenJPEG - BSD-2-Clause.
  Swiss Ephemeris (c) Astrodienst AG - AGPL-3.0; sweph-wasm - AGPL-3.0. Эта программа распространяется на тех же условиях.
  Атлас: GeoNames (geonames.org), CC BY 4.0 - при распространении сохраняйте указание источника (оно есть в окне "О программе").
