// South and North Indian chart drawing as inline SVG strings.
// cells: array(12) indexed by SIGN (0 = Aries), each an array of { t: text, c: css class }.
import { esc } from './util.js';
import { SIGN_ABBR } from '../tables.js';

const SOUTH = [[11, 0, 1, 2], [10, -1, -1, 3], [9, -1, -1, 4], [8, 7, 6, 5]];

function stack(items, cx, cy, maxW, maxH) {
  // lays out the labels centred on (cx, cy); one column up to 4 items (up to 6 when the labels are long), two columns for more
  const n = items.length;
  if (!n) return '';
  const len = (it) => it.t.length + (it.k ? it.k.length + 1 : 0), maxLen = Math.max(...items.map(len));
  const cols = n > 6 || (n > 4 && maxLen <= 7) ? 2 : 1, rows = Math.ceil(n / cols);
  const lh = Math.min(18, maxH / rows), fs = cols === 2 ? (maxLen > 7 ? 8.5 : 10) : Math.max(9, Math.min(14, lh - 3));
  const colW = (maxW + (cols === 2 && maxLen > 7 ? 18 : 0)) / cols;
  let out = '';
  items.forEach((it, i) => {
    const col = cols === 1 ? 0 : i % 2, row = cols === 1 ? i : Math.floor(i / 2);
    const x = cx + (cols === 1 ? 0 : (col - 0.5) * colW);
    const y = cy - ((rows - 1) * lh) / 2 + row * lh;
    out += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="pl ${it.c || ''}" font-size="${fs}" text-anchor="middle" dominant-baseline="central">${esc(it.t)}${it.k ? `<tspan class="kar" dx="3">${esc(it.k)}</tspan>` : ''}</text>`;
  });
  return out;
}

export function southChart({ cells, lagnaSign, title = '', sub = '', size = 400 }) {
  let g = '';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const s = SOUTH[r][c];
    if (s < 0) continue;
    const x = c * 100, y = r * 100;
    g += `<rect x="${x}" y="${y}" width="100" height="100" class="cell${s === lagnaSign ? ' lagna' : ''}"/>`;
    g += `<text x="${x + 5}" y="${y + 11}" class="sg">${SIGN_ABBR[s]}</text>`;
    if (s === lagnaSign) g += `<path d="M${x} ${y}h26l-26 26z" class="asc-mark"/>`;
    g += stack(cells[s], x + 50, y + 55, 92, 76);
  }
  g += `<rect x="100" y="100" width="200" height="200" class="mid"/>`;
  g += `<text x="200" y="${sub ? 190 : 200}" class="ttl" text-anchor="middle" dominant-baseline="central">${esc(title)}</text>`;
  if (sub) g += `<text x="200" y="215" class="sub" text-anchor="middle" dominant-baseline="central">${esc(sub)}</text>`;
  return `<svg class="chart" viewBox="-2 -2 404 404" width="${size}" height="${size}" role="img" aria-label="${esc(title)}">${g}</svg>`;
}

// house polygons (viewBox 400x400) and label points
const NORTH = [
  { p: '200,0 300,100 200,200 100,100', c: [200, 92], s: [200, 160] },
  { p: '0,0 200,0 100,100', c: [100, 38], s: [100, 84] },
  { p: '0,0 100,100 0,200', c: [36, 100], s: [74, 100] },
  { p: '0,200 100,100 200,200 100,300', c: [90, 200], s: [140, 200] },
  { p: '0,200 100,300 0,400', c: [36, 300], s: [74, 300] },
  { p: '0,400 100,300 200,400', c: [100, 362], s: [100, 316] },
  { p: '100,300 200,200 300,300 200,400', c: [200, 308], s: [200, 240] },
  { p: '200,400 300,300 400,400', c: [300, 362], s: [300, 316] },
  { p: '400,400 300,300 400,200', c: [364, 300], s: [326, 300] },
  { p: '400,200 300,300 200,200 300,100', c: [310, 200], s: [260, 200] },
  { p: '400,200 300,100 400,0', c: [364, 100], s: [326, 100] },
  { p: '400,0 300,100 200,0', c: [300, 38], s: [300, 84] },
];

export function northChart({ cells, lagnaSign, title = '', size = 400 }) {
  let g = '';
  for (let h = 0; h < 12; h++) {
    const sign = (lagnaSign + h) % 12, H = NORTH[h];
    g += `<polygon points="${H.p}" class="cell${h === 0 ? ' lagna' : ''}"/>`;
    g += `<text x="${H.s[0]}" y="${H.s[1]}" class="sg" text-anchor="middle" dominant-baseline="central">${sign + 1}</text>`;
    g += stack(cells[sign], H.c[0], H.c[1], h % 3 === 0 && h !== 0 && h !== 6 && h !== 3 && h !== 9 ? 70 : 74, 62);
  }
  return `<svg class="chart" viewBox="-2 -2 404 404" width="${size}" height="${size}" role="img" aria-label="${esc(title)}">${g}</svg>`;
}

export function drawChart(style, opts) {
  return style === 'north' ? northChart(opts) : southChart(opts);
}
