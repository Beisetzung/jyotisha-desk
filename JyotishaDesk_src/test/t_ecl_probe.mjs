import { setup } from './common.mjs';
const swe = await setup();
const fmt = (jd) => { const r = swe.revjul(jd); const h = r.h; return `${r.y}-${String(r.m).padStart(2,'0')}-${String(r.d).padStart(2,'0')} ${String(Math.floor(h)).padStart(2,'0')}:${String(Math.floor((h%1)*60)).padStart(2,'0')}`; };
let t = swe.julday(2023, 1, 1, 0);
for (let i = 0; i < 6; i++) { const r = swe.solEclipseGlobal(t); console.log('SOL', fmt(r.t[0]), 'flags', r.flags); t = r.t[0] + 20; }
t = swe.julday(2025, 1, 1, 0);
for (let i = 0; i < 5; i++) { const r = swe.lunEclipseGlobal(t); const how = swe.lunEclipseHow(r.t[0], 0, 0, 0); console.log('LUN', fmt(r.t[0]), 'flags', r.flags, 'umbral mag', how.attr[0].toFixed(3), 'pen', how.attr[1].toFixed(3)); t = r.t[0] + 20; }
const w = swe.solEclipseWhere(swe.solEclipseGlobal(swe.julday(2024, 3, 1, 0)).t[0]); console.log('2024 total path max at', w.lon.toFixed(2), w.lat.toFixed(2), 'mag', w.attr[0].toFixed(3));
// local: Moscow 2026-08-12? (partial) and Madrid total
const l = swe.solEclipseLocal(swe.julday(2026, 8, 1, 0), -3.7, 40.4, 650); console.log('Madrid', fmt(l.t[0]), 'flags', l.flags, 'visible?', !!(l.flags & 128), 'mag', l.attr[0].toFixed(3), 'obsc', l.attr[2].toFixed(3), 'contacts', l.t.slice(1,5).map(fmt).join(' | '));
const m = swe.solEclipseLocal(swe.julday(2026, 8, 1, 0), 37.6, 55.75, 150); console.log('Moscow next', fmt(m.t[0]), 'mag', m.attr[0].toFixed(3));
const ll = swe.lunEclipseLocal(swe.julday(2026, 2, 1, 0), 37.6, 55.75, 150); console.log('lunar local Moscow', fmt(ll.t[0]), 'flags', ll.flags, 'visible', !!(ll.flags & 128), 'umbral mag', ll.attr[0].toFixed(3));
