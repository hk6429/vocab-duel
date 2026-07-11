// 驗證 data/words.json：schema、無重複、level 分佈、例句含字、無簡體
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const words = JSON.parse(readFileSync(join(root, 'data', 'words.json'), 'utf8'));
const POS = new Set(['n','v','adj','adv','prep','conj','pron','det','int','num','aux','phr']);
const SIMP = /[们语说读写让门问间东车马鸟龙学习记忆图书馆题号级练习课认识养爱时实现观点历经济区]/;
const errs = [];

const seen = new Set();
for (const w of words) {
  const tag = w.word;
  for (const k of ['id','word','pos','zh','level','example','example_zh'])
    if (w[k] == null || w[k].length === 0) errs.push(`${tag}: 缺 ${k}`);
  if (seen.has(w.word.toLowerCase())) errs.push(`${tag}: 重複詞條`);
  seen.add(w.word.toLowerCase());
  if (!/^(E|J|S[1-6])$/.test(w.level)) errs.push(`${tag}: level 非 E/J/S1-6`);
  if (!Array.isArray(w.pos) || !w.pos.every(p => POS.has(p))) errs.push(`${tag}: pos 不合法 ${w.pos}`);
  if (SIMP.test(w.zh + w.example_zh)) errs.push(`${tag}: 疑似簡體 ${w.zh} / ${w.example_zh}`);
  // 例句需含該字或變化形（詞幹前段寬鬆比對；連字號忽略；不規則變化查表）
  const IRREG = { shoot: 'shot', tooth: 'teeth', foot: 'feet', mouse: 'mice', child: 'children', man: 'men', woman: 'women', leaf: 'leaves', knife: 'knives', wolf: 'wolves', goose: 'geese', buy: 'bought', catch: 'caught', teach: 'taught', think: 'thought', bring: 'brought', fight: 'fought', seek: 'sought', cling: 'clung', overcome: 'overcame', overtake: 'overtook', sling: 'slung', swing: 'swung', sting: 'stung' };
  const ex = w.example.toLowerCase().replace(/-/g, '');
  const stem = w.word.toLowerCase().replace(/-/g, '').split(' ')[0];
  const probe = stem.length > 4 ? stem.slice(0, Math.max(4, stem.length - 2)) : stem;
  const forms = [probe, IRREG[stem], ...(w.variants || []).map(v => v.toLowerCase().replace(/-/g, '').split(' ')[0])].filter(Boolean);
  if (!forms.some(f => ex.includes(f))) errs.push(`${tag}: 例句未含該字 "${w.example}"`);
}

const e = words.filter(w => w.level === 'E').length;
const j = words.filter(w => w.level === 'J').length;
const sCnt = {};
for (let i = 1; i <= 6; i++) sCnt['S' + i] = words.filter(w => w.level === 'S' + i).length;
const sTotal = Object.values(sCnt).reduce((a, b) => a + b, 0);
console.log(`總數 ${words.length}（E ${e} / J ${j} / 高中 ${sTotal}）`, sTotal ? sCnt : '');
if (e < 1100 || e > 1300) errs.push(`E 級數量異常: ${e}`);
// 高中未併時總數約 2000；併後約 6200
if (words.length < 1900 || words.length > 6400) errs.push(`總數異常: ${words.length}`);

if (errs.length) {
  console.error('FAIL', errs.length, '個問題：');
  errs.slice(0, 60).forEach(x => console.error(' -', x));
  process.exit(1);
}
console.log('ALL CLEAN ✅');
