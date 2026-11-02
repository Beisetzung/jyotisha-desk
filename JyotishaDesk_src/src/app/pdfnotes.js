// Notes for one PDF: highlights with a comment and pin notes. The PDF file itself is never modified.
// Storage: a JSON file next to the PDF ("<name>.pdf.notes.json") when the folder was opened with write access,
// plus a copy in the browser's IndexedDB (keyed by the content fingerprint of the PDF). The newer of the two is used when opening.
// All coordinates are fractions (0..1) of the displayed page width/height, so they do not depend on the zoom.
import * as store from './store.js';

export const COLORS = [
  { id: 'y', name: 'Жёлтый', hex: '#ffd84d' }, { id: 'g', name: 'Зелёный', hex: '#7fdc82' }, { id: 'b', name: 'Голубой', hex: '#7cc4ff' },
  { id: 'p', name: 'Розовый', hex: '#ff9fc2' }, { id: 'o', name: 'Оранжевый', hex: '#ffb066' },
];
export const colorHex = (id) => (COLORS.find((c) => c.id === id) || COLORS[0]).hex;
export const newId = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const sidecarName = (pdfName) => pdfName + store.NOTES_SUFFIX;
const r5 = (x) => Math.round(x * 1e5) / 1e5;

function clean(n) {                              // sanitise a note read from a file
  if (!n || typeof n !== 'object' || typeof n.id !== 'string' || !Number.isInteger(n.page) || n.page < 1) return null;
  const out = { id: n.id, type: n.type === 'pin' ? 'pin' : 'hl', page: n.page, color: COLORS.some((c) => c.id === n.color) ? n.color : 'y', text: typeof n.text === 'string' ? n.text : '', t: +n.t || Date.now(), u: +n.u || +n.t || Date.now() };
  if (out.type === 'pin') { out.x = Math.min(1, Math.max(0, +n.x || 0)); out.y = Math.min(1, Math.max(0, +n.y || 0)); return out; }
  out.style = n.style === 'ul' ? 'ul' : 'hl';
  out.quote = typeof n.quote === 'string' ? n.quote : '';
  out.rects = (Array.isArray(n.rects) ? n.rects : []).filter((r) => Array.isArray(r) && r.length === 4 && r.every((v) => Number.isFinite(+v))).map((r) => r.map(Number));
  return out.rects.length ? out : null;
}

export class Notes {
  constructor(entry, fp, numPages) {
    this.entry = entry; this.fp = fp; this.numPages = numPages;
    this.list = []; this.dirty = false; this.timer = 0;
    this.where = 'browser';            // where the last successful save went: 'file' | 'browser'
    this.error = ''; this.sideCorrupt = false;
    this.canWriteFile = !!(entry && entry.dir);
    this.listeners = new Set();
  }
  static async open(entry, fp, numPages) { const n = new Notes(entry, fp, numPages); await n.load(); return n; }
  get sidecar() { return sidecarName(this.entry.name); }

  async readSidecar() {
    const e = this.entry; let file = null;
    if (e.dir) { try { file = await (await e.dir.getFileHandle(this.sidecar)).getFile(); } catch (err) { if (err.name !== 'NotFoundError') throw err; } }
    else if (e.sidecarFile) file = e.sidecarFile;
    if (!file) return null;
    const text = await file.text();
    let obj; try { obj = JSON.parse(text); } catch { this.sideCorrupt = true; throw new Error(`Файл «${this.sidecar}» повреждён и не будет перезаписан.`); }
    if (!obj || !Array.isArray(obj.notes)) { this.sideCorrupt = true; throw new Error(`Файл «${this.sidecar}» не похож на файл заметок и не будет перезаписан.`); }
    return obj;
  }
  async load() {
    let side = null, mirror = null;
    try { side = await this.readSidecar(); } catch (e) { this.error = e.message; }
    mirror = await store.kvGet('pdfnotes:' + this.fp);
    const st = side ? Date.parse(side.saved) || 0 : -1, mt = mirror ? Date.parse(mirror.saved) || 0 : -1;
    const src = st >= mt ? side : mirror;
    this.list = (src ? src.notes : []).map(clean).filter(Boolean);
    if (src === mirror && mirror && side === null && this.canWriteFile && this.list.length && !this.sideCorrupt) this.dirty = true;     // the copy in the browser is newer: write it to the file
    if (src === mirror && side && mt > st && !this.sideCorrupt) this.dirty = true;
    this.where = side && src === side ? 'file' : 'browser';
    if (this.dirty) this.schedule(0);
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(kind, note) { for (const f of this.listeners) f(kind, note); }
  sorted() { return this.list.slice().sort((a, b) => a.page - b.page || this.top(a) - this.top(b) || a.t - b.t); }
  top(n) { return n.type === 'pin' ? n.y : Math.min(...n.rects.map((r) => r[1])); }
  byPage(p) { return this.list.filter((n) => n.page === p); }
  get(id) { return this.list.find((n) => n.id === id) || null; }

  add(n) {
    const note = clean({ ...n, id: n.id || newId(), t: Date.now(), u: Date.now() });
    if (!note) throw new Error('bad note');
    if (note.rects) note.rects = note.rects.map((r) => r.map(r5));
    if (note.type === 'pin') { note.x = r5(note.x); note.y = r5(note.y); }
    this.list.push(note); this.touch(); this.emit('add', note); return note;
  }
  update(id, patch) {
    const n = this.get(id); if (!n) return null;
    Object.assign(n, patch, { u: Date.now() }); this.touch(); this.emit('update', n); return n;
  }
  remove(id) {
    const i = this.list.findIndex((n) => n.id === id); if (i < 0) return;
    const [n] = this.list.splice(i, 1); this.touch(); this.emit('remove', n);
  }

  touch() { this.dirty = true; this.schedule(500); }
  schedule(ms) { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), ms); }
  toJSON() {
    return { app: 'JyotishaDesk', kind: 'pdf-notes', v: 1, file: this.entry.name, fingerprint: this.fp, pages: this.numPages, saved: new Date().toISOString(), notes: this.list };
  }
  async flush() {
    clearTimeout(this.timer);
    if (!this.dirty) return;
    this.dirty = false;
    const doc = this.toJSON();
    try { await store.kvSet('pdfnotes:' + this.fp, doc); } catch { /* storage unavailable */ }
    if (this.canWriteFile && !this.sideCorrupt) {
      try {
        const dir = this.entry.dir;
        if (dir.queryPermission && (await dir.queryPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('нет доступа на запись в папку');
        const fh = await dir.getFileHandle(this.sidecar, { create: true });
        const w = await fh.createWritable();
        await w.write(JSON.stringify(doc, null, 1));
        await w.close();
        this.where = 'file'; this.error = '';
      } catch (e) { this.where = 'browser'; this.error = 'Не удалось записать файл заметок: ' + e.message; }
    } else if (!this.canWriteFile) this.where = 'browser';
    this.emit('saved');
  }
  statusText() {
    if (this.error) return this.error + ' Заметки сохранены в браузере.';
    if (this.where === 'file') return `Заметки сохраняются в файле «${this.sidecar}» рядом с PDF (и копией в браузере). Сам PDF не изменяется.`;
    return this.canWriteFile ? 'Заметки сохраняются в браузере; файл рядом с PDF будет создан при первой записи.' : 'Заметки хранятся только в этом браузере: PDF открыт не через папку с правом записи. Экспортируйте их в файл, если они важны.';
  }

  // ---- export / import
  exportJSON() { return JSON.stringify(this.toJSON(), null, 1); }
  exportMarkdown() {
    const name = this.entry.name.replace(/\.pdf$/i, '');
    const out = [`# Заметки: ${name}`, '', `Файл: ${this.entry.name}. Экспорт: ${new Date().toLocaleString('ru-RU')}.`, ''];
    let page = 0;
    for (const n of this.sorted()) {
      if (n.page !== page) { page = n.page; out.push(`## Страница ${page}`, ''); }
      if (n.type === 'hl' && n.quote) out.push(...n.quote.trim().split('\n').map((l) => '> ' + l), '');
      if (n.text.trim()) out.push(n.text.trim(), '');
      else if (n.type === 'pin') out.push('(метка без текста)', '');
    }
    return out.join('\n');
  }
  importJSON(text) {
    const obj = JSON.parse(text);
    if (!obj || !Array.isArray(obj.notes)) throw new Error('Это не файл заметок.');
    let added = 0, updated = 0;
    for (const raw of obj.notes) {
      const n = clean(raw); if (!n) continue;
      const cur = this.get(n.id);
      if (!cur) { this.list.push(n); added++; this.emit('add', n); } else if (n.u > cur.u) { Object.assign(cur, n); updated++; this.emit('update', cur); }
    }
    if (added || updated) this.touch();
    return { added, updated };
  }
}
