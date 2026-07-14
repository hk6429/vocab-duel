/* townstore 純邏輯驗證：建造規則／市政廳學識門檻／人口／職業訓練／
   每日產出／學習換資源／代幣／委託。node scripts/test-townstore.mjs */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
globalThis.window = globalThis;
globalThis.VDGame = { raw: { coins: 1000, xp: 0, quests: { date: '', prog: { correct: 0 } } } };
globalThis.VDStore = { today: () => TODAY };
globalThis.VDPets = { rating: 0 };
let TODAY = '2026-07-12';
Math.random = () => 0.5; // 固定亂數：不出稀有居民、不觸發奇遇
store.vd_game = JSON.stringify({ coins: 1000, quests: { date: TODAY, prog: { correct: 10 } } }); // 今日已練功，收成不打折
const townJson = JSON.parse(readFileSync(join(root, 'data/town.json'), 'utf8'));
globalThis.fetch = async () => ({ json: async () => townJson });

const src = readFileSync(join(root, 'js/townstore.js'), 'utf8');
new Function(src)();
const T = globalThis.VDTown;
await T.init();

let fail = 0;
const ok = (c, m) => { if (c) console.log('PASS:', m); else { console.error('FAIL:', m); fail++; } };

/* 1. 初始狀態 */
ok(T.thLevel() === 1 && T.cells().length === 1, '開村只有市政廳 Lv1');
ok(T.raw.pop.length === 2 && T.idle().length === 2, '送 2 位閒置村民');

/* 2. 建造 */
ok(!T.build('house', 3, 3).ok, '同格不能疊');
ok(T.build('house', 2, 2).ok, '蓋民房');
ok(T.raw.res.wood === 10, '扣 10 木');
ok(T.canBuild('farm').ok, '開田不需農夫（死鎖已修，農夫只管產出）');
ok(!T.build('hospital', 2, 4).ok, '沒醫護不能開醫院');
ok(T.popCap() === 4, '一棟民房住 4 人');

/* 3. 人口搬入 */
ok(T.tryMovein().ok && T.tryMovein().ok, '搬入 2 位');
ok(!T.tryMovein().ok, '每日上限 2 位');
ok(T.raw.pop.length === 4 && T.raw.res.rice === 3, '人口 4、耗 2 米');
TODAY = '2026-07-13';
ok(!T.tryMovein().ok, '第二天但沒空屋擋下');

/* 4. 基礎工作＋每日產出 */
const p1 = T.raw.pop[0], p2 = T.raw.pop[1];
ok(T.assignJob(p1.id, 'lumberjack').ok && T.assignJob(p2.id, 'quarryman').ok, '派工樵夫＋石匠');
ok(!T.assignJob(p1.id, 'doctor').ok, '職業要學校訓練');
let out = T.dailyOutput();
ok(out.wood === 3 && out.stone === 3, '樵夫 3 木、石匠 3 石');
T.build('quarry', 2, 4);
out = T.dailyOutput();
ok(out.stone === 5, '採石場讓石匠 +2');
store.vd_game = JSON.stringify({ coins: 1000, quests: { date: TODAY, prog: { correct: 10 } } }); // 今日已練功
T.raw.res.rice = 20;                       // 喂飽口糧，避開饑荒（饑荒另測）
const w0 = T.raw.res.wood;
ok(T.harvest().ok && T.raw.res.wood === w0 + 3, '收成入庫');
ok(!T.harvest().ok, '一天只能收一次');

/* 5. 學校訓練（職業鏈） */
ok(!T.train(p1.id, 'farmer', true).ok, '沒學校不能訓練');
T.raw.res.wood += 40; T.raw.res.stone += 20;
ok(T.build('school', 2, 5).ok, '蓋學校');
ok(!T.train(p1.id, 'farmer', false).ok, '沒過測驗不能結業');
const c0 = VDGame.raw.coins;
ok(T.train(p1.id, 'farmer', true).ok && c0 - VDGame.raw.coins === 60, '農夫結業扣學費 60');
ok(T.profCount('farmer') === 1, '有 1 位農夫');
ok(T.build('farm', 4, 4).ok, '有農夫就能開田');
out = T.dailyOutput();
ok(out.rice === 4, '農夫種田日產 4 米');

/* 6. 市政廳學識門檻 */
let r = T.upgradeReq('3,3');
ok(!r.ok && r.msg.includes('學識不足'), '精熟 0 字不能升市政廳');
const prog = {};
for (let i = 0; i < 120; i++) prog['w' + i] = { b: 3 };
store.vd_progress = JSON.stringify(prog);
T.raw.res.wood = 60; T.raw.res.stone = 40;
r = T.upgradeReq('3,3');
ok(r.ok, '精熟 120 字＋資源夠 → 可升 Lv2');
ok(T.upgrade('3,3').ok, '市政廳開始升級');
ok(!T.upgrade('3,3').ok, '升級中不能重複');
T.raw.grid['3,3'].up.done = Date.now() - 1;
T.tickUpgrades();
ok(T.thLevel() === 2, '升級完工 → 市政廳 Lv2');

/* 7. 一般建築等級 ≤ 市政廳、Lv2 需木工坊 */
T.raw.res.wood = 100; T.raw.res.stone = 100;
r = T.upgradeReq('2,2');
ok(!r.ok && r.msg.includes('木工坊'), '沒木工坊不能升 Lv2');

/* 8. 學習換資源 */
VDGame.raw.quests = { date: TODAY, prog: { correct: 23 } };
store.vd_game = JSON.stringify(VDGame.raw);
let pk = T.packInfo();
ok(pk.earned === 4 && pk.avail === 4, '答對 23 題 → 4 包');
const wood1 = T.raw.res.wood;
ok(T.claimPacks().ok && T.raw.res.wood === wood1 + 12, '領 4 包 +12 木');
ok(!T.claimPacks().ok, '領過不能再領');

/* 9. 徵戰掉落＋倉庫上限 */
const loot = T.battleLoot(5);
ok(loot.wood === 7 && loot.ore === 3 && loot.rice === 2, '第 5 層掉落表正確');
T.raw.res.wood = 999999; T.battleLoot(1);
ok(T.raw.res.wood <= T.resCap(), '倉庫上限鎖住');

/* 10. 代幣 */
VDPets.rating = 100;
let tk = T.tokenInfo();
ok(tk.avail === 2, '100 積分兌 2 枚');
ok(T.redeemTokens().ok && T.raw.tokens === 2, '兌換入帳');
ok(T.tokenToRes('ore').ok && T.raw.tokens === 1, '代幣換 20 礦');
// 加速升級
T.raw.res.wood = 200; T.raw.res.stone = 200;
T.build('carpenter', 5, 5); // 沒木工會失敗——先訓練
const p3 = T.raw.pop.find(x => !x.job);
T.train(p3.id, 'carpenter', true);
ok(T.build('carpenter', 5, 5).ok, '有木工 → 蓋木工坊');
r = T.upgrade('2,2');
ok(r.ok, '民房開始升 Lv2');
ok(T.rushUpgrade('2,2').ok && T.raw.grid['2,2'].lv === 2 && T.raw.tokens === 0, '代幣加速完工');

/* 11. 英文委託 */
const q = T.questInfo();
ok(q && q.text.length > 5 && q.n >= 3, '每日委託生成');
T.raw.res[q.res] = q.n + 5;
const f = T.fulfillQuest();
ok(f.ok && T.raw.tokens === q.rewardTokens, '交付委託得代幣');
ok(!T.fulfillQuest().ok, '一天一單');

/* 12. NPC 台詞 */
const line = T.npcLine(T.raw.pop[0]);
ok(line.text.includes('npc-w') && line.word.length > 1, 'NPC 英文台詞帶目標單字');

/* 13. 匯出／匯入 */
const snap = T.exportState();
ok(T.importState(snap), '狀態可匯出匯入');
ok(!T.importState({}), '壞資料擋下');

/* 14. 新機制：拆除／搬移／答題加速／城名／快精熟（5,5 已有木工坊，改用空格 6,6） */
ok(!T.demolish('3,3').ok, '市政廳不能拆');
{
  const before = T.raw.res.wood;
  ok(T.build('farm', 6, 6).ok, '開田（不需農夫）');
  ok(T.move('6,6', 6, 7).ok && T.raw.grid['6,7'] && !T.raw.grid['6,6'], '搬移到空地');
  ok(!T.move('6,7', 3, 3).ok, '不能搬到有建築的格');
  ok(T.demolish('6,7').ok && T.raw.res.wood === before - 10 + 5, '拆除退一半建材');
}
{
  T.raw.res.wood = 200; T.raw.res.stone = 200;
  const hk = '1,1';
  T.build('house', 1, 1);
  T.upgrade(hk);
  ok(T.raw.grid[hk].up && !T.quizRush(hk, false).ok, '沒過測驗不能加速');
  ok(T.quizRush(hk, true).ok && T.raw.grid[hk].lv === 2 && !T.raw.grid[hk].up, '答題加速完工');
}
{
  T.raw.res.wood = 400; T.raw.res.stone = 400; T.raw.res.ore = 200; T.raw.res.rice = 200;
  T.upgrade('4,4');
  ok(T.quizRush('4,4', true).ok, '第 2 次答題加速 OK');
  T.upgrade('2,4');
  const r3 = T.quizRush('2,4', true);
  ok(!r3.ok && r3.msg.includes('用完'), '答題加速每日上限 2 次');
  TODAY = '2026-07-14';
  ok(T.quizRush('2,4', true).ok, '跨日重置後可再加速');
}
ok(!T.setName('').ok && T.setName('學霸之城').ok && T.raw.name === '學霸之城', '城名 1–12 字');
ok(!T.setName('a<b>c').ok && !T.setName('x"y').ok, '城名拒收 <>&"\' 特殊符號');
{
  store.vd_progress = JSON.stringify({ apple: { b: 2 }, dog: { b: 1 }, cat: { b: 3 }, sun: { b: 0 } });
  const nm = T.nearMastered();
  ok(nm.length === 2 && nm[0] === 'apple', '快精熟＝盒1–2、盒高在前');
}
ok(Array.isArray(T.raw.log) && T.raw.log.length > 0, '城史紀年有記錄');

/* 15. 字幣換補給（50 字幣＝1 包、每日上限 4） */
{
  VDGame.raw.coins = 1000;
  store.vd_game = JSON.stringify(VDGame.raw);
  T.raw.res.wood = 0;
  ok(T.coinToRes().ok && T.raw.res.wood === 3 && VDGame.raw.coins === 950, '50 字幣換 1 補給包（+3 木、扣 50 幣）');
  T.coinToRes(); T.coinToRes(); T.coinToRes();
  const r5 = T.coinToRes();
  ok(!r5.ok && r5.msg.includes('上限'), '字幣換補給每日上限 4 包');
  VDGame.raw.coins = 10;
  const r6 = T.coinPackInfo();
  ok(r6.todayLeft === 0 && !T.coinToRes().ok, '上限後 coinPackInfo 歸零');
}

/* 16. 雕像：遞增造價＋倉庫加成＋新 resCap 公式 */
{
  T.raw.res.wood = 500; T.raw.res.stone = 500;
  const c0 = T.buildCost('statue');
  ok(c0.stone === 15 && c0.wood === 5, '第 1 座雕像原價');
  ok(T.build('statue', 0, 0).ok, '蓋第 1 座雕像');
  const c1 = T.buildCost('statue');
  ok(c1.stone === Math.ceil(15 * 1.3) && c1.wood === Math.ceil(5 * 1.3), '第 2 座造價 ×1.3');
  ok(T.resCap() === 300 + 200 * T.thLevel() + 2, 'resCap = 300+200×市政廳＋雕像×2');
  ok(T.build('statue', 0, 1).ok && T.resCap() === 300 + 200 * T.thLevel() + 4, '第 2 座雕像再 +2 上限');
}

/* 17. 代幣基準：lifetime 優先、差值負數 clamp 0 */
{
  VDPets.lifetime = () => 400;
  ok(T.tokenInfo().rating === 400, '代幣基準吃 VDPets.lifetime()');
  delete VDPets.lifetime;
  VDPets.rating = 0;
  const tk3 = T.tokenInfo();
  ok(tk3.avail === 0 && !T.redeemTokens().ok, '積分低於已兌換值 → clamp 0 不出負數');
}

/* 18. 舊存檔容錯：沒有 visitCode / coinPacks 欄位也能載入 */
{
  const snap = T.exportState();
  delete snap.visitCode; delete snap.coinPacks;
  ok(T.importState(snap), '舊存檔（無雕像/visitCode/coinPacks 欄位）可載入');
  ok(T.raw.visitCode === '' && T.coinPackInfo().todayLeft >= 0, '缺欄位自動補預設值');
  T.setVisitCode('AB12');
  ok(T.raw.visitCode === 'AB12', 'setVisitCode 寫入');
}

/* 19. 升級加成：建築等級真的提升能力 */
{
  T.raw.grid = {
    '3,3': { b: 'townhall', lv: 5 },
    '3,4': { b: 'house', lv: 3 },
    '4,3': { b: 'farm', lv: 4 },
    '4,4': { b: 'mine', lv: 3 },
    '4,5': { b: 'hospital', lv: 2 },
    '5,3': { b: 'lighthouse', lv: 2 },
    '5,4': { b: 'statue', lv: 3 }
  };
  T.raw.pop = [
    { id: 1, name: 'F', job: 'farmer', rare: false },
    { id: 2, name: 'M', job: 'miner', rare: false }
  ];
  ok(T.popCap() === 12, '民房 Lv3 → 容量 4×3=12');
  ok(T.resCap() === 300 + 200 * 5 + 2 * 3, '雕像 Lv3 → 倉儲 +2×3');
  const o = T.dailyOutput();
  ok(o.rice === 12, '稻田 Lv4 讓農夫 4→10 米、醫院 Lv2 再 +2 = 12');
  ok(o.ore === 10, '礦場 Lv3 讓礦工 2→8 礦、醫院 Lv2 再 +2 = 10');
  ok(T.packInfo().cap === 6 + 2 * 2, '燈塔 Lv2 → 每日包上限 6+4=10');
}

/* 20. 每日口糧＋饑荒（人口越多吃越多，糧倉見底建材減半） */
{
  store.vd_game = JSON.stringify({ coins: 1000, quests: { date: TODAY, prog: { correct: 10 } } });
  // 米足：pop 3、rice 10
  T.raw.grid = { '3,3': { b: 'townhall', lv: 1 }, '4,3': { b: 'farm', lv: 1 } };
  T.raw.pop = [
    { id: 1, name: 'F', job: 'farmer', rare: false },
    { id: 2, name: 'B', job: '', rare: false },
    { id: 3, name: 'C', job: '', rare: false }
  ];
  T.raw.res = { wood: 0, stone: 0, ore: 0, rice: 10 };
  T.raw.harvest.date = '';
  const h = T.harvest();
  ok(h.ate === 3 && !h.famine, '口糧：3 人吃 3 米、米足不饑荒');
  ok(T.raw.res.rice === 11, '收成後米 = 10 − 3(口糧) + 4(農夫) = 11');
  // 米不足：pop 4、rice 1（無農夫產米）→ 饑荒、糧倉歸零、礦產減半
  T.raw.grid = { '3,3': { b: 'townhall', lv: 1 }, '5,5': { b: 'mine', lv: 1 } };
  T.raw.pop = [
    { id: 1, name: 'M', job: 'miner', rare: false },
    { id: 2, name: 'B', job: '', rare: false },
    { id: 3, name: 'C', job: '', rare: false },
    { id: 4, name: 'D', job: '', rare: false }
  ];
  T.raw.res = { wood: 0, stone: 0, ore: 0, rice: 1 };
  T.raw.harvest.date = '';
  const h2 = T.harvest();
  ok(h2.famine && T.raw.res.rice === 0, '米不足 → 饑荒、糧倉歸零');
  ok(T.raw.res.ore === 2, '饑荒：礦工 4 礦減半 → 2');
}

if (fail) { console.error(`\n${fail} 個問題`); process.exit(1); }
console.log('\nALL PASS — townstore 純邏輯 20 組驗證通過');
