import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from './npmwork/node_modules/esbuild/lib/main.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const nm = path.join(here, 'npmwork/node_modules');
const res = await build({
  entryPoints: [path.join(here, 'src/app/main.js')],
  bundle: true, write: false, format: 'iife', target: 'es2020', platform: 'browser', minify: false, legalComments: 'none',
  alias: { 'sweph-wasm': path.join(nm, 'sweph-wasm') },
  define: { 'import.meta.url': '"http://localhost/"' },
  logLevel: 'warning',
});
let js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const css = fs.readFileSync(path.join(here, 'src/app/style.css'), 'utf8') + '\n' + fs.readFileSync(path.join(here, 'src/app/pdf.css'), 'utf8');
const wasm = fs.readFileSync(path.join(nm, 'sweph-wasm/dist/wasm/swisseph.wasm')).toString('base64');
const atlas = fs.readFileSync(path.join(here, 'data/atlas.tsv.gz')).toString('base64');
// pdf.js (Apache-2.0): library, worker and the wasm decoders (JBIG2, JPEG 2000) are embedded gzip+base64 and unpacked on first use of the PDF reader.
// The worker is started as a classic script from a blob: URL, so the module-only parts of the file are removed here.
const pdfDir = path.join(nm, 'pdfjs-dist');
const gzb64 = (buf) => zlib.gzipSync(buf, { level: 9 }).toString('base64');
const pdfLib = gzb64(fs.readFileSync(path.join(pdfDir, 'build/pdf.min.mjs')));
const wkText = fs.readFileSync(path.join(pdfDir, 'build/pdf.worker.min.mjs'), 'utf8').replace(/import\.meta\.url/g, '"http://localhost/"').replace(/export\{WorkerMessageHandler\};?\s*$/, '');
if (/import\.meta/.test(wkText) || /(^|[;}])export[{ ]/.test(wkText.slice(-300))) throw new Error('pdf.js worker still contains module syntax');
const pdfWorker = gzb64(Buffer.from(wkText, 'utf8'));
const pdfWasm = JSON.stringify({ jbig2: gzb64(fs.readFileSync(path.join(pdfDir, 'wasm/jbig2.wasm'))), openjpeg: gzb64(fs.readFileSync(path.join(pdfDir, 'wasm/openjpeg.wasm'))) });
const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jyotisha Desk</title>
<!-- Jyotisha Desk: local Vedic astrology workbench. Uses Swiss Ephemeris (c) Astrodienst AG, AGPL-3.0, compiled to WebAssembly (sweph-wasm). Place data: GeoNames (CC BY 4.0), geonames.org. PDF reader: pdf.js (c) Mozilla Foundation, Apache-2.0; JBIG2/OpenJPEG decoders as shipped with pdf.js. -->
<style>
${css}
</style>
</head>
<body>
<div id="app"></div>
<noscript>Для работы нужен JavaScript.</noscript>
<script>window.__SWE_WASM__="${wasm}";</script>
<script>window.__ATLAS__="${atlas}";</script>
<script>window.__PDFJS__="${pdfLib}";window.__PDFJS_WORKER__="${pdfWorker}";window.__PDFJS_WASM__=${pdfWasm};</script>
<script>
${js}
</script>
</body>
</html>
`;
const out = path.join(here, 'dist/JyotishaDesk.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('built', out, (html.length / 1024).toFixed(0) + ' KB');
