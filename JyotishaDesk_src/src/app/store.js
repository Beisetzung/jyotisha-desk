// Folder access (File System Access API with a read-only <input webkitdirectory> fallback), the remembered folder
// (IndexedDB) and the settings (localStorage). Every storage access is wrapped: it may be unavailable.
import { parseJHD } from '../jhd.js';

export const hasFSA = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

// ---------------------------------------------------------------- settings
const SKEY = 'jhora-web-settings-v1';
export const UI_DEFAULTS = { style: 'south', ayanamsa: 1, trueNode: false, houseSystem: 'O', yearLen: 365.25, sunriseCenter: false, karakas: 7, degrees: true, marks: true, outer: true, charaDir: 'ninth', charaExaltAdj: false, mode: 'charts', pdfNight: false, pdfPanel: 'notes' };
export function loadSettings() {
  try { return { ...UI_DEFAULTS, ...JSON.parse(localStorage.getItem(SKEY) || '{}') }; } catch { return { ...UI_DEFAULTS }; }
}
export function saveSettings(s) { try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }

// ---------------------------------------------------------------- remembered folder handle
function idb() {
  return new Promise((resolve, reject) => {
    let rq;
    try { rq = indexedDB.open('jhora-web', 1); } catch (e) { reject(e); return; }
    rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}
// small key/value store on top of IndexedDB (remembered folders, notes copies, reading positions)
export async function kvSet(key, value) {
  const db = await idb();
  await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(value, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
export async function kvGet(key) {
  try {
    const db = await idb();
    return await new Promise((res) => { const rq = db.transaction('kv').objectStore('kv').get(key); rq.onsuccess = () => res(rq.result === undefined ? null : rq.result); rq.onerror = () => res(null); });
  } catch { return null; }
}
export async function kvDelete(key) {
  try {
    const db = await idb();
    await new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(key); tx.oncomplete = res; tx.onerror = res; });
  } catch { /* ignore */ }
}
// key 'dir' = folder with charts (as before), 'dir-pdf' = folder with PDF files
export async function rememberDir(handle, key = 'dir') { try { await kvSet(key, handle); } catch { /* ignore */ } }
export async function recallDir(key = 'dir') { return kvGet(key); }
export async function forgetDir(key = 'dir') { return kvDelete(key); }
export async function ensurePermission(handle, write = true) {
  const opts = { mode: write ? 'readwrite' : 'read' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}

// ---------------------------------------------------------------- scanning
const MAX_FILES = 100000, MAX_DEPTH = 6;
// entry: { name, path, dirPath, handle?, dir?, file? }
export async function scanDirectory(root, onProgress) {
  const out = [];
  async function walk(dir, prefix, depth) {
    for await (const [name, h] of dir.entries()) {
      if (out.length >= MAX_FILES) return;
      if (h.kind === 'file') {
        if (/\.jhd$/i.test(name)) out.push({ name, path: prefix + name, dirPath: prefix, handle: h, dir });
      } else if (depth < MAX_DEPTH && !name.startsWith('.')) {
        await walk(h, prefix + name + '/', depth + 1);
      }
      if (out.length % 200 === 0 && onProgress) onProgress(out.length);
    }
  }
  await walk(root, '', 0);
  return out;
}
export function entriesFromFileList(files) {
  const out = [];
  for (const f of files) {
    if (!/\.jhd$/i.test(f.name)) continue;
    const rel = f.webkitRelativePath || f.name;
    const parts = rel.split('/');
    const path = parts.slice(1).join('/') || f.name;
    out.push({ name: f.name, path, dirPath: path.slice(0, path.length - f.name.length), file: f });
  }
  return out;
}

export function decodeBytes(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); }
}
export async function readEntryText(e) {
  const file = e.handle ? await e.handle.getFile() : e.file;
  return decodeBytes(await file.arrayBuffer());
}
// JHora is an ANSI program: write single-byte text; characters outside Latin-1 become "?"
export function encodeLatin1(text) {
  const out = new Uint8Array(text.length);
  let lossy = false;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); if (c < 256) out[i] = c; else { out[i] = 63; lossy = true; } }
  return { bytes: out, lossy };
}
export async function writeFileIn(dirHandle, name, text) {
  const fh = await dirHandle.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(encodeLatin1(text).bytes);
  await w.close();
  return fh;
}
export async function writeEntry(entry, text) {
  const w = await entry.handle.createWritable();
  await w.write(encodeLatin1(text).bytes);
  await w.close();
}
export function downloadText(name, text) {
  const blob = new Blob([encodeLatin1(text).bytes], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// background indexing: fills entry.meta so the list can show date/place and be searched
export async function indexEntries(entries, onTick, shouldStop) {
  let i = 0;
  for (const e of entries) {
    if (shouldStop && shouldStop()) return;
    if (!e.meta && !e.bad) {
      try {
        const b = parseJHD(await readEntryText(e), e.name);
        e.meta = { y: b.year, m: b.month, d: b.day, time: b.time, place: b.place || '', country: b.country || '', lat: b.lat, lon: b.lonEast };
      } catch { e.bad = true; }
    }
    if (++i % 40 === 0) { if (onTick) onTick(i); await new Promise((r) => setTimeout(r, 0)); }
  }
  if (onTick) onTick(i);
}

// ---------------------------------------------------------------- PDF library (same folder logic as for charts)
export const NOTES_SUFFIX = '.notes.json';
// entry: { name, path, dirPath, handle?, dir?, file?, size, mtime, hasNotes }
export async function scanPdfDirectory(root, onProgress) {
  const out = [];
  async function walk(dir, prefix, depth) {
    const names = new Set(), files = [], dirs = [];
    for await (const [name, h] of dir.entries()) {
      if (h.kind === 'file') { names.add(name); if (/\.pdf$/i.test(name)) files.push([name, h]); } else if (depth < MAX_DEPTH && !name.startsWith('.')) dirs.push([name, h]);
    }
    for (const [name, h] of files) {
      if (out.length >= MAX_FILES) return;
      out.push({ name, path: prefix + name, dirPath: prefix, handle: h, dir, hasNotes: names.has(name + NOTES_SUFFIX) });
    }
    if (onProgress) onProgress(out.length);
    for (const [name, h] of dirs) { if (out.length >= MAX_FILES) return; await walk(h, prefix + name + '/', depth + 1); }
  }
  await walk(root, '', 0);
  return out;
}
export function pdfEntriesFromFileList(files) {
  const out = [], side = new Map();
  for (const f of files) {
    const rel = f.webkitRelativePath || f.name, parts = rel.split('/'), path = parts.slice(1).join('/') || f.name;
    if (f.name.endsWith(NOTES_SUFFIX)) side.set(path, f);
  }
  for (const f of files) {
    if (!/\.pdf$/i.test(f.name)) continue;
    const rel = f.webkitRelativePath || f.name, parts = rel.split('/'), path = parts.slice(1).join('/') || f.name;
    const sc = side.get(path + NOTES_SUFFIX);
    out.push({ name: f.name, path, dirPath: path.slice(0, path.length - f.name.length), file: f, size: f.size, mtime: f.lastModified, sidecarFile: sc || null, hasNotes: !!sc });
  }
  return out;
}
// fills size / modification time (cheap: no file content is read)
export async function indexPdfEntries(entries, onTick, shouldStop) {
  let i = 0;
  for (const e of entries) {
    if (shouldStop && shouldStop()) return;
    if (e.mtime === undefined && !e.bad) {
      try { const f = e.handle ? await e.handle.getFile() : e.file; e.size = f.size; e.mtime = f.lastModified; } catch { e.bad = true; }
    }
    if (++i % 60 === 0) { if (onTick) onTick(i); await new Promise((r) => setTimeout(r, 0)); }
  }
  if (onTick) onTick(i);
}
