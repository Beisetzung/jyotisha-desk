import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import createModule from '../npmwork/node_modules/sweph-wasm/dist/wasm/swisseph.js';
import * as swe from '../src/swe.js';
const here = path.dirname(fileURLToPath(import.meta.url));
export async function setup() {
  await swe.initSwe(createModule, fs.readFileSync(path.join(here, '../npmwork/node_modules/sweph-wasm/dist/wasm/swisseph.wasm')));
  return swe;
}
export const DATA = '/tmp/claude-0/-home-claude/e5e9f0d1-b9a1-5f66-8801-4b724ad75602/scratchpad/jh_extract/Jagannatha Hora/data';
export function readJhd(name) { return fs.readFileSync(path.join(DATA, name), 'latin1'); }
