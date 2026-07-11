// 併字綴資料：讀 scratchpad 三份 subagent JSON → 驗證 member 存在於 words.json → 剔孤兒 → data/affixes.json
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2];
if (!dir) { console.error('用法: node merge-affix.mjs <scratchpad/affix 目錄>'); process.exit(1); }

const words = JSON.parse(readFileSync(join(root, 'data', 'words.json'), 'utf8'));
const wset = new Set(words.map(w => w.word.toLowerCase()));
// 正規原字：members 存回 words.json 的原始大小寫
const canon = new Map(words.map(w => [w.word.toLowerCase(), w.word]));

let dropped = 0, thin = 0;
function clean(arr, minMembers) {
  const out = [];
  for (const a of arr) {
    const seen = new Set();
    const members = [];
    for (const m of a.members || []) {
      const k = String(m).toLowerCase();
      if (!wset.has(k) || seen.has(k)) { if (!wset.has(k)) dropped++; continue; }
      seen.add(k);
      members.push(canon.get(k));
    }
    if (members.length < minMembers) { thin++; continue; }
    out.push({ form: a.form, meaning: a.meaning, members });
  }
  return out;
}

const load = f => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const prefixes = clean(load('prefixes.json'), 4);
const suffixes = clean(load('suffixes.json'), 4);
const roots = clean(load('roots.json'), 3);

const out = { prefixes, suffixes, roots };
writeFileSync(join(root, 'data', 'affixes.json'), JSON.stringify(out, null, 1));
const cnt = o => o.reduce((s, x) => s + x.members.length, 0);
console.log(`字首 ${prefixes.length}（${cnt(prefixes)} members）／字尾 ${suffixes.length}（${cnt(suffixes)}）／字根 ${roots.length}（${cnt(roots)}）`);
console.log(`剔除孤兒 member ${dropped} 個、丟棄過瘦字綴 ${thin} 個`);
