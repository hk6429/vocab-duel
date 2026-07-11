// 合併 shards/batch_*.json → data/words.json
// 同字多條（如 can 名詞/助動詞）合併：pos 聯集、zh 用「；」串接、例句取第一條
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const shardDir = process.argv[2];
if (!shardDir) { console.error('用法: node merge.mjs <shards目錄>'); process.exit(1); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(shardDir).filter(f => /^batch_\d+\.json$/.test(f)).sort();
console.log('shards:', files.join(', '));

const byWord = new Map();
let total = 0;
for (const f of files) {
  const arr = JSON.parse(readFileSync(join(shardDir, f), 'utf8'));
  total += arr.length;
  for (const e of arr) {
    const key = e.word.toLowerCase().replace(/’/g, "'");
    if (byWord.has(key)) {
      const prev = byWord.get(key);
      prev.pos = [...new Set([...prev.pos, ...e.pos])];
      const zhs = new Set(prev.zh.split('；'));
      for (const z of e.zh.split('；')) zhs.add(z);
      prev.zh = [...zhs].join('；');
      if (e.variants) prev.variants = [...new Set([...(prev.variants || []), ...e.variants])];
      if (prev.level === 'J' && e.level === 'E') { prev.level = 'E'; prev.example = e.example; prev.example_zh = e.example_zh; }
    } else {
      byWord.set(key, { ...e, word: e.word.replace(/’/g, "'"), example: e.example.replace(/’/g, "'") });
    }
  }
}

const words = [...byWord.values()].sort((a, b) => a.word.toLowerCase().localeCompare(b.word.toLowerCase()));
words.forEach((w, i) => { w.id = 'w' + String(i + 1).padStart(4, '0'); });
// id 排到最前
const out = words.map(({ id, word, pos, zh, level, example, example_zh, variants }) =>
  variants ? { id, word, pos, zh, level, example, example_zh, variants }
           : { id, word, pos, zh, level, example, example_zh });

writeFileSync(join(root, 'data', 'words.json'), JSON.stringify(out, null, 1));
console.log(`原始 ${total} 條 → 合併後 ${out.length} 條（重複併掉 ${total - out.length}）`);
console.log('E:', out.filter(w => w.level === 'E').length, ' J:', out.filter(w => w.level === 'J').length);
