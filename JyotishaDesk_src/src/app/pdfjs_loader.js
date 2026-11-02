// Lazy loader for pdf.js (Mozilla, Apache-2.0). The library and its worker are embedded in the page as gzip+base64 (window.__PDFJS__ and
// window.__PDFJS_WORKER__), unpacked on first use and started from blob: URLs, so no server and no network are needed.
// The worker is a classic script (blob module workers are refused for file:// pages); wasm decoders for JBIG2 / JPEG 2000 are embedded too.
let libPromise = null, workerUrl = null;
const wasmCache = {};

function b64ToBytes(b64) {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function gunzip(b64) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Браузер не поддерживает распаковку (DecompressionStream). Нужен Chrome или Edge.');
  return new Response(new Blob([b64ToBytes(b64)]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

export function pdfEngineEmbedded() { return !!(libPromise || (window.__PDFJS__ && window.__PDFJS_WORKER__)); }

export function loadPdfJs() {
  if (libPromise) return libPromise;
  libPromise = (async () => {
    if (!window.__PDFJS__ || !window.__PDFJS_WORKER__) throw new Error('Модуль чтения PDF не найден в файле программы.');
    const [lib, wk] = await Promise.all([gunzip(window.__PDFJS__), gunzip(window.__PDFJS_WORKER__)]);
    workerUrl = URL.createObjectURL(new Blob([wk], { type: 'text/javascript' }));
    const mod = await import(/* @vite-ignore */ URL.createObjectURL(new Blob([lib], { type: 'text/javascript' })));
    delete window.__PDFJS__; delete window.__PDFJS_WORKER__;
    return mod;
  })();
  libPromise.catch(() => { libPromise = null; });
  return libPromise;
}
export function newWorkerPort() { return new Worker(workerUrl); }

// binary data (wasm decoders) are served from memory instead of being fetched by URL
async function wasmBytes(name) {
  if (!wasmCache[name]) {
    const b64 = window.__PDFJS_WASM__ && window.__PDFJS_WASM__[name];
    if (!b64) return null;
    wasmCache[name] = new Uint8Array(await gunzip(b64));
  }
  return wasmCache[name];
}
export class EmbeddedBinaryFactory {
  async fetch({ kind, filename }) {
    if (kind === 'wasmUrl') { const b = await wasmBytes(filename.replace(/\.wasm$/, '')); if (b) return b; }
    throw new Error(`Нет встроенных данных: ${kind} ${filename}`);
  }
}
// wasmUrl is never fetched (the factory above answers), the value only has to be a syntactically valid prefix
export const DOC_OPTIONS = { BinaryDataFactory: EmbeddedBinaryFactory, useWorkerFetch: false, wasmUrl: 'blob:null/embedded/', isEvalSupported: false, enableXfa: false, enableScripting: false };
