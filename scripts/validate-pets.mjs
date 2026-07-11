/* 驗證 pets.json：172 字綴不重不漏分進 20 寵、技能引用存在、id 唯一 */
import { readFileSync } from 'fs';
const pets = JSON.parse(readFileSync(new URL('../data/pets.json', import.meta.url)));
const affixes = JSON.parse(readFileSync(new URL('../data/affixes.json', import.meta.url)));

const KIND = { p: 'prefixes', s: 'suffixes', r: 'roots' };
let fail = 0;
const err = m => { console.error('FAIL:', m); fail++; };

// 1. id 唯一、剛好 20 寵
const ids = pets.pets.map(p => p.id);
if (ids.length !== 20) err(`寵物數 ${ids.length} != 20`);
if (new Set(ids).size !== ids.length) err('寵物 id 重複');

// 2. 每個 claim 的 (kind,form) 在 affixes.json 存在；同一 form 不得由兩寵認領
const claims = new Map(); // "k|f" → petId
for (const p of pets.pets) {
  if (!Array.isArray(p.affixes) || !p.affixes.length) err(`${p.id} 沒有字綴`);
  for (const a of p.affixes) {
    const key = a.k + '|' + a.f;
    if (claims.has(key)) err(`${a.f}(${a.k}) 被 ${claims.get(key)} 與 ${p.id} 重複認領`);
    claims.set(key, p.id);
    const pool = affixes[KIND[a.k]] || [];
    if (!pool.some(x => x.form === a.f)) err(`${p.id} 認領了不存在的 ${KIND[a.k]}:${a.f}`);
  }
}

// 3. affixes.json 每一條（含同形重複條目）都被涵蓋；總條目數 = 172
let total = 0, covered = 0;
for (const [k, kind] of Object.entries({ p: 'prefixes', s: 'suffixes', r: 'roots' })) {
  for (const a of affixes[kind]) {
    total++;
    if (claims.has(k + '|' + a.form)) covered++;
    else err(`${kind}:${a.form} 沒有寵物認領`);
  }
}
if (total !== 172) err(`affixes 總條目 ${total} != 172`);
if (covered !== total) err(`涵蓋 ${covered}/${total}`);

// 4. 技能引用存在、每寵 3 技
for (const p of pets.pets) {
  if (!Array.isArray(p.skills) || p.skills.length !== 3) err(`${p.id} 技能數 != 3`);
  for (const s of p.skills || []) if (!pets.skills[s]) err(`${p.id} 引用未定義技能 ${s}`);
}

// 5. 野生梯度 10 層遞增
if (pets.wild.length !== 10) err(`野生層數 ${pets.wild.length} != 10`);
for (let i = 1; i < pets.wild.length; i++)
  if (pets.wild[i].lv <= pets.wild[i - 1].lv) err(`野生第 ${i + 1} 層等級未遞增`);

if (fail) { console.error(`\n${fail} 個問題`); process.exit(1); }
console.log(`ALL CLEAN — 20 寵、${total} 綴全數認領、技能/野生梯度皆合法`);
