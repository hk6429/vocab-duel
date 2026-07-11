/* petstore 純邏輯自測：以 stub 模擬瀏覽器環境，驗證公式/經濟/裝備/統計 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = p => readFileSync(path.join(root, p), 'utf8');

/* ── stub 環境 ── */
const store = {};
globalThis.localStorage = {
  getItem: k => store[k] ?? null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
const learnedWords = new Set(); // 模擬已學單字
globalThis.VDStore = { box: w => learnedWords.has(w) ? 1 : -1 };
globalThis.VDGame = { raw: { coins: 10000, xp: 0 }, heroName: () => '測試俠' };
globalThis.fetch = async p => ({ json: async () => JSON.parse(read(p)) });
globalThis.window = globalThis;

/* 載入 petstore.js（IIFE） */
new Function(read('js/petstore.js'))();
const P = globalThis.VDPets;

let fail = 0;
const ok = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); fail++; } else console.log('PASS:', msg); };

await P.init();

/* 1. 清單 20 隻、未領養 */
let list = P.list();
ok(list.length === 20, '清單 20 隻');
ok(list.every(p => !p.owned && p.lv === 0), '初始全未領養');

/* 2. 詞源之力：學 inkfox 家族一半的字 → power ≈ 0.5 */
const fox = [...P.wordsOf('inkfox')];
ok(fox.length > 0, 'inkfox 家族有單字');
fox.slice(0, Math.floor(fox.length / 2)).forEach(w => learnedWords.add(w));
const pw = P.power('inkfox');
ok(Math.abs(pw - Math.floor(fox.length / 2) / fox.length) < 1e-9, `詞源之力=已學比例 (${pw.toFixed(3)})`);

/* 3. 領養：首隻免費、第二隻 100、第三隻 150；自動設出戰 */
ok(P.adoptCost() === 0, '首隻免費');
let r = P.adopt('inkfox');
ok(r.ok && r.cost === 0, '領養 inkfox 成功');
ok(P.active() === 'inkfox', '首隻自動出戰');
ok(P.adoptCost() === 100, '第二隻 100');
r = P.adopt('timeturtle');
ok(r.ok && r.cost === 100 && VDGame.raw.coins === 9900, '領養第二隻扣 100');
ok(P.adoptCost() === 150, '第三隻 150');
r = P.adopt('inkfox');
ok(!r.ok, '重複領養被擋');

/* 4. 屬性公式：Lv1 無裝備 atk=round(12×(1+P))、hp=106 */
ok(P.atk('inkfox') === Math.round(12 * (1 + pw)), `Lv1 atk 公式 (${P.atk('inkfox')})`);
ok(P.hp('inkfox') === 106, 'Lv1 hp=106');

/* 5. 升級：cost=20+10lv；Lv10 進化 stage2 */
const c0 = VDGame.raw.coins;
r = P.levelUp('inkfox');
ok(r.ok && r.lv === 2 && c0 - VDGame.raw.coins === 30, 'Lv1→2 花 30');
for (let i = 2; i < 9; i++) P.levelUp('inkfox');
ok(P.lvOf('inkfox') === 9, '升到 Lv9');
r = P.levelUp('inkfox');
ok(r.ok && r.lv === 10 && r.evolved === 2, 'Lv10 進化 stage2');
ok(P.stageOf(P.lvOf('inkfox')) === 2, 'stageOf(10)=2');
for (let i = 10; i < 24; i++) P.levelUp('inkfox');
r = P.levelUp('inkfox');
ok(r.ok && r.lv === 25 && r.evolved === 3, 'Lv25 進化 stage3');
r = P.levelUp('inkfox');
ok(!r.ok, '滿級被擋');

/* 6. 掉落與裝備：三檔數值範圍、裝上加屬性、卸下還原 */
const tiers = { common: [2, 4], rare: [5, 8], legendary: [10, 15] };
for (const [t, [lo, hi]] of Object.entries(tiers)) {
  for (let i = 0; i < 20; i++) {
    const d = P.rollDrop(t);
    const v = d.atk || d.hp / 3;
    ok2(v >= lo && v <= hi, `${t} 掉落數值 ${v} 在 [${lo},${hi}]`);
  }
}
function ok2(cond, msg) { if (!cond) { console.error('FAIL:', msg); fail++; } } // 迴圈內只報錯不刷版
console.log('PASS: 三檔掉落數值範圍（60 抽）');
const baseAtk = P.atk('inkfox');
const item = { slot: 'weapon', tier: 'legendary', name: '測試劍', ico: '⚔️', atk: 12, hp: 0 };
P.equip('inkfox', item);
ok(P.atk('inkfox') === baseAtk + 12, '裝武器 +12 atk');
P.unequip('inkfox', 'weapon');
ok(P.atk('inkfox') === baseAtk, '卸下還原');

/* 7. 技能：Lv25 全解鎖、needLv 5/12/20 */
const sk = P.skillsOf('inkfox');
ok(sk.length === 3 && sk.every(s => s.unlocked), 'Lv25 三技全解鎖');
ok(sk[0].needLv === 5 && sk[1].needLv === 12 && sk[2].needLv === 20, '解鎖等級 5/12/20');
ok(P.skillsOf('timeturtle').filter(s => s.unlocked).length === 0, 'Lv1 無技能');

/* 8. 積分／野生進度 */
P.petWin(); P.petWin(); P.petLose();
ok(P.rating === 30, '勝勝敗 → 30 分');
P.clearWild(1);
ok(P.wildFloor === 2, '過第 1 層 → 開第 2 層');
P.clearWild(5); // 跳層不算
ok(P.wildFloor === 2, '不可跳層');

/* 9. 字綴統計：條目數 172、top/weak 排序合理 */
const stats = P.affixStats();
ok(stats.length === 172, `affixStats 172 條 (${stats.length})`);
const top = P.topAffixes(5);
ok(top.every(a => a.learned > 0), 'top 只含已學');
const weak = P.weakAffixes(5);
ok(weak.every(a => a.pct <= (top[0]?.pct ?? 1)), 'weak pct 不高於 top');

/* 10. snapshot／持久化 */
const snap = P.snapshot();
ok(snap && snap.petId === 'inkfox' && snap.lv === 25 && snap.skills.length === 3, 'snapshot 完整');
const saved = JSON.parse(store.vd_pets);
ok(saved.owned.inkfox.lv === 25 && saved.rating === 30, 'localStorage 持久化正確');


/* 11. 背包／鍛造／詞條／助戰（二期D） */
{
  while (P.bag().length) P.dropBag(0); // 清掉前面測試卸下的殘件
  // 背包收納與上限
  for (let i = 0; i < 3; i++) P.addToBag({ slot: 'weapon', tier: 'common', base: '羽毫劍', name: '羽毫劍', ico: '⚔️', atk: 3, hp: 0, perk: '' });
  ok(P.bag().length === 3, '背包收 3 件');
  // 鍛造：3 同階 → 高一階
  const r = P.forge([0, 1, 2]);
  ok(r.ok && r.item.tier === 'rare', '鍛造 3 普通 → 1 稀有');
  ok(P.bag().length === 1, '鍛造後背包剩 1 件');
  const bad = P.forge([0, 0, 0]);
  ok(!bad.ok, '重複索引不可鍛造');
  // 卸下進背包
  P.equip('inkfox', { slot: 'weapon', tier: 'legendary', base: '斷句斧', name: '傳說斷句斧', ico: '⚔️', atk: 12, hp: 0, perk: 'xp10' });
  ok(P.hasPerk('xp10') && !P.hasPerk('sprint5'), '出戰詞靈詞條生效');
  const u = P.unequip('inkfox', 'weapon');
  ok(u.ok && P.bag().length === 2, '卸下裝備進背包');
  ok(!P.hasPerk('xp10'), '卸下後詞條失效');
  // 從背包裝上（換裝把原件放回背包）
  const e1 = P.equipFromBag('inkfox', P.bag().length - 1);
  ok(e1.ok && P.hasPerk('xp10'), '背包裝上恢復詞條');
  // 裝備圖鑑
  const dex = P.eqDex();
  ok(dex.length === 48, `裝備圖鑑 48 格 (${dex.length})`);
  ok(dex.filter(x => x.got).length >= 2, '打過的裝備已點亮');
  // 助戰
  const as = P.assist();
  ok(as && as.atk === Math.max(1, Math.round(P.atk('inkfox') / 10)), '助戰追擊 = atk/10');
  ok(as.leech === 0 || as.leech === 3, 'leech 僅 0 或 3');
  // 掉落帶 base 與 perk 規則
  let legendPerk = true;
  for (let i = 0; i < 20; i++) { const d = P.rollDrop('legendary'); if (!d.perk || !d.base) legendPerk = false; }
  ok(legendPerk, '傳說裝備必帶詞條與 base');
}


/* 12. 詞源融合（二期C） */
{
  // 準備第二隻滿級：timeturtle 直接寫 owned
  const raw = JSON.parse(store.vd_pets);
  raw.owned.timeturtle = { lv: 25, equip: {}, deco: '' };
  store.vd_pets = JSON.stringify(raw);
  // 重新 init 不可（單例）——改直接經 API 驗證：inkfox 已 25、timeturtle 25
  // 需要重載 g：petstore 沒有 reload API，改用 levelUp 無法到 25…
  // 由於 IIFE 內 g 已載，直接操作既有 owned：
  // （測試環境允許：adopt timeturtle 再灌 lv）
  if (!P.list().find(p => p.id === 'timeturtle').owned) {
    // coins 保證足夠
    VDGame.raw.coins = 99999;
    P.adopt('timeturtle');
  }
  VDGame.raw.coins = 99999;
  while (P.lvOf('timeturtle') < 25) { const r = P.levelUp('timeturtle'); if (!r.ok) break; }
  ok(P.canFuse().length >= 2, '兩隻滿級可融合');
  const pool = [...P.def('inkfox').skills, ...P.def('timeturtle').skills];
  const bad = P.fuse('inkfox', 'timeturtle', '小', pool.slice(0, 3));
  ok(!bad.ok, '名字太短擋下');
  const r = P.fuse('inkfox', 'timeturtle', '墨龜靈', [...new Set(pool)].slice(0, 3));
  ok(r.ok, '融合成功');
  ok(P.lvOf('inkfox') === 15 && P.lvOf('timeturtle') === 15, '雙親降回 Lv15');
  const fu = P.list().find(p => p.id === r.id);
  ok(fu && fu.isFusion && fu.name === '墨龜靈' && fu.lv === 1, '幼靈進清單 Lv1');
  ok(P.wordsOf(r.id).size >= P.wordsOf('inkfox').size, '幼靈家族=聯集（不小於單親）');
  ok(P.skillsOf(r.id).length === 3, '幼靈 3 技');
  const again = P.fuse('inkfox', 'timeturtle', '再來隻', [...new Set(pool)].slice(0, 3));
  ok(!again.ok, '雙親已降級不能再融');
}

if (fail) { console.error(`\n${fail} 個問題`); process.exit(1); }
console.log('\nALL PASS — petstore 純邏輯 10 組驗證通過');
