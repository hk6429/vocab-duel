// 併高中增量：既有 words.json 的 E/J + hs_shards/hb_*.json 的 S1-S6 → words.json
// 冪等：先把既有檔過濾成只剩 E/J，再併入 S，重跑不會重複疊加
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const shardDir = process.argv[2];
if (!shardDir) { console.error('用法: node merge-hs.mjs <hs_shards目錄>'); process.exit(1); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const clean = s => s.replace(/’/g, "'");
const norm = w => clean(w).toLowerCase().replace(/\s*\([^)]*\)/g, '').split('/')[0].trim();

const existing = JSON.parse(readFileSync(join(root, 'data', 'words.json'), 'utf8'));
const base = existing.filter(w => w.level === 'E' || w.level === 'J');
const baseKeys = new Set();
for (const w of base) { baseKeys.add(norm(w.word)); (w.variants || []).forEach(v => baseKeys.add(norm(v))); }

const files = readdirSync(shardDir).filter(f => /^hb_\d+\.json$/.test(f)).sort();
let raw = 0, dupBase = 0, dupSelf = 0;
const seen = new Set();
const hs = [];
for (const f of files) {
  const arr = JSON.parse(readFileSync(join(shardDir, f), 'utf8'));
  raw += arr.length;
  for (const e of arr) {
    const k = norm(e.word);
    if (baseKeys.has(k)) { dupBase++; continue; }
    if (seen.has(k)) { dupSelf++; continue; }
    seen.add(k);
    hs.push({ ...e, word: clean(e.word), example: clean(e.example) });
  }
}

const all = base.concat(hs).sort((a, b) => a.word.toLowerCase().localeCompare(b.word.toLowerCase()));
all.forEach((w, i) => { w.id = 'w' + String(i + 1).padStart(4, '0'); });
const out = all.map(({ id, word, pos, zh, level, example, example_zh, variants }) =>
  variants ? { id, word, pos, zh, level, example, example_zh, variants }
           : { id, word, pos, zh, level, example, example_zh });

writeFileSync(join(root, 'data', 'words.json'), JSON.stringify(out, null, 1));
const byLevel = {};
for (const w of out) byLevel[w.level] = (byLevel[w.level] || 0) + 1;
console.log(`shards ${files.length} 個、原始 ${raw} 條；併基底 ${base.length} → 總 ${out.length}`);
console.log(`去重：撞既有 ${dupBase}、高中內部重複 ${dupSelf}`);
console.log('各級:', byLevel);
