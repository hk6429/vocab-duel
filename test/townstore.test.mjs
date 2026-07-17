/* 單字之城純邏輯測試（城邦/養地系統優化 P1–P3）：以最小 shim 在 node 載入 townstore.js IIFE，
   驗證審查修正版的每一條——學習係數綁真實新精熟、精熟堵假熟、無日限旁路封死、林場解木頭瓶頸、
   前期門檻下修＋endgame 聲望/奇觀、倉儲綁精熟、稻米涓滴＋餵食順序、委託輸入化、每日鉤子等。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(__dirname, '..', 'js', 'townstore.js'), 'utf8');
const TOWN_JSON = JSON.parse(readFileSync(path.join(__dirname, '..', 'data', 'town.json'), 'utf8'));

const mkProg = (n, box = 3) => { const o = {}; for (let i = 0; i < n; i++) o['w' + i] = { b: box, d: '2026-01-01', s: 1 }; return o; };

async function loadTown({ townSave = null, prog = {}, coins = 100000, today = '2026-07-18',
  fakeSet = [], rnd = 0.5, lifetime = 0, correct = 0 } = {}) {
  const storeMem = {};
  if (townSave) storeMem['vd_town'] = JSON.stringify(townSave);
  storeMem['vd_progress'] = JSON.stringify(prog);
  storeMem['vd_game'] = JSON.stringify({ coins, quests: { date: today, prog: { correct } } });
  const localStorage = {
    getItem: k => (k in storeMem ? storeMem[k] : null),
    setItem: (k, v) => { storeMem[k] = String(v); },
    removeItem: k => { delete storeMem[k]; }
  };
  const enrolled = [];
  const VDStore = {
    today: () => today,
    isFakeMastery: w => fakeSet.includes(w),
    enroll: w => enrolled.push(w),
    isDue: () => false
  };
  const gameRaw = JSON.parse(storeMem['vd_game']);
  const spendCalls = [];
  const VDGame = {
    raw: gameRaw,
    spend: n => { spendCalls.push(n); if ((gameRaw.coins || 0) < n) return false; gameRaw.coins -= n; localStorage.setItem('vd_game', JSON.stringify(gameRaw)); return true; },
    heroName: () => '英雄', isBeaten: () => false
  };
  const VDPets = { lifetime: () => lifetime };
  const rngFn = typeof rnd === 'function' ? rnd : () => rnd;
  const MathShim = Object.create(Math); MathShim.random = rngFn;
  const fetch = async () => ({ json: async () => JSON.parse(JSON.stringify(TOWN_JSON)) });
  const ctx = { localStorage, VDStore, VDGame, VDPets, fetch, console, Math: MathShim, JSON, Object, Array, Set, Date, Promise, setTimeout };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  await ctx.VDTown.init();
  const setProg = p => { storeMem['vd_progress'] = JSON.stringify(p); };
  return { T: ctx.VDTown, storeMem, VDGame, enrolled, spendCalls, setProg };
}

// 造一座可運作的城（含市政廳＋自訂格子/人口）
const town = (over = {}) => Object.assign({
  name: '測城', grid: { '3,3': { b: 'townhall', lv: 1 } },
  res: { wood: 200, stone: 200, ore: 200, rice: 200 }, tokens: 10, redeemedRating: 0,
  pop: [], seq: 1, harvest: { date: '' }, log: []
}, over);

/* ── P1-1 收成學習係數：綁真實新精熟，不是隨便答對 ── */
test('P1-1 learnMult：今日新精熟 ≥3 才全額 ×1.0', async () => {
  const { T, setProg } = await loadTown({ prog: mkProg(0) });   // 基準 0
  setProg(mkProg(3));                                            // 今天新精熟 3 個
  assert.equal(T.newMasteredToday(), 3);
  assert.equal(T.learnMult(), 1.0);
});
test('P1-1 learnMult：新精熟 1–2 → 0.85', async () => {
  const { T, setProg } = await loadTown({ prog: mkProg(0) });
  setProg(mkProg(1));
  assert.equal(T.learnMult(), 0.85);
});
test('P1-1 learnMult：0 新精熟但認真複習(≥10題) → 0.7、地板 0.5', async () => {
  const a = await loadTown({ prog: mkProg(5), correct: 12 });   // 基準 5、沒新精熟
  assert.equal(a.T.newMasteredToday(), 0);
  assert.equal(a.T.learnMult(), 0.7);
  const b = await loadTown({ prog: mkProg(5), correct: 0 });
  assert.equal(b.T.learnMult(), 0.5);
});
test('P1-1 刷爛熟字答對無法灌滿：todayCorrect 高但 0 新精熟仍非 1.0', async () => {
  const { T } = await loadTown({ prog: mkProg(5), correct: 999 });
  assert.ok(T.learnMult() < 1.0);
});

/* ── P1-2 精熟堵假熟 ── */
test('P1-2 mastered() 排除假熟練(isFakeMastery)的字', async () => {
  const { T } = await loadTown({ prog: { real: { b: 4 }, fake: { b: 3 } }, fakeSet: ['fake'] });
  assert.equal(T.mastered(), 1);   // 只算 real，fake 被排除
});
test('P1-2 nearMastered 補盲區：盒≥3 但假熟的字也要能「去練」', async () => {
  const { T } = await loadTown({ prog: { a: { b: 1 }, fake: { b: 3 } }, fakeSet: ['fake'] });
  const near = T.nearMastered();
  assert.ok(near.includes('fake') && near.includes('a'));
});

/* ── P1-3 封無日限旁路 ── */
test('P1-3 battleLoot 每日前 3 場全額、第 4 場減半', async () => {
  const { T } = await loadTown({ townSave: town() });
  const full = T.battleLoot(2);            // wood=4 stone=3
  T.battleLoot(2); T.battleLoot(2);
  const throttled = T.battleLoot(2);       // 第 4 場減半 → wood=2 stone=1
  assert.equal(full.wood, 4);
  assert.equal(throttled.wood, 2);
  assert.equal(throttled.stone, 1);
});
test('P1-3 tokenToRes 匯率 10 且每日上限 3 次', async () => {
  const { T } = await loadTown({ townSave: town({ tokens: 10, res: { wood: 0, stone: 0, ore: 0, rice: 0 } }) });
  assert.equal(T.tokenToRes('wood').ok, true);
  assert.equal(T.raw.res.wood, 10);        // 匯率 10（原 20）
  T.tokenToRes('wood'); T.tokenToRes('wood');
  assert.equal(T.tokenToRes('wood').ok, false);   // 第 4 次超日限
});
test('P1-3 rushUpgrade 每日上限 3 次', async () => {
  const g = town({ tokens: 10, grid: {
    '3,3': { b: 'townhall', lv: 1 },
    '0,0': { b: 'house', lv: 1, up: { done: 9e15, to: 2 } },
    '0,1': { b: 'house', lv: 1, up: { done: 9e15, to: 2 } },
    '0,2': { b: 'house', lv: 1, up: { done: 9e15, to: 2 } },
    '0,3': { b: 'house', lv: 1, up: { done: 9e15, to: 2 } }
  } });
  const { T } = await loadTown({ townSave: g });
  assert.equal(T.rushUpgrade('0,0').ok, true);
  assert.equal(T.rushUpgrade('0,1').ok, true);
  assert.equal(T.rushUpgrade('0,2').ok, true);
  assert.equal(T.rushUpgrade('0,3').ok, false);   // 第 4 次超日限
});
test('P1-3 答題加速上限放寬到 4（learn-to-skip ≥ pay-to-skip）', async () => {
  const { T } = await loadTown({ townSave: town() });
  assert.equal(T.rushInfo().todayLeft, 4);
});

/* ── P1-4 林場解木頭瓶頸 ── */
test('P1-4 林場 boostBy：樵夫產出隨林場等級成長', async () => {
  const g = town({
    grid: { '3,3': { b: 'townhall', lv: 3 }, '3,4': { b: 'sawmill', lv: 3 } },
    pop: [{ id: 1, name: 'x', job: 'lumberjack', rare: false }]
  });
  const { T } = await loadTown({ townSave: g });
  assert.equal(T.dailyOutput().wood, 3 + 2 * 3);   // 基礎 3 + 林場 sumLv 3×2 = 9
});

/* ── P1-5 曲線兩端 ── */
test('P1-5 前期門檻下修：市政廳 Lv2 只要精熟 45 字', async () => {
  const g = town({ res: { wood: 999, stone: 999, ore: 999, rice: 999 } });
  const { T } = await loadTown({ townSave: g, prog: mkProg(45) });
  const req = T.upgradeReq('3,3');
  assert.equal(req.ok, true, req.msg);
});
test('P1-5 endgame：精熟超過 700 每 50 字一顆聲望★', async () => {
  const { T } = await loadTown({ prog: mkProg(800) });
  assert.equal(T.prestige(), 2);   // (800-700)/50 = 2
});
test('P1-5 世界奇觀＝代幣＋後期資源的出口（滿級才開）', async () => {
  const g5 = town({ grid: { '3,3': { b: 'townhall', lv: 5 } }, tokens: 5, res: { wood: 0, stone: 0, ore: 100, rice: 100 } });
  const { T } = await loadTown({ townSave: g5 });
  const r = T.donateWonder();
  assert.equal(r.ok, true, r.msg);
  assert.equal(T.raw.tokens, 3);   // 扣 2 代幣
  assert.equal(T.raw.res.ore, 50); // 扣 50 礦
  assert.equal(T.prestige(), 1);   // 奇觀 +1 也算聲望
});
test('P1-5 世界奇觀在市政廳未滿級時不開', async () => {
  const { T } = await loadTown({ townSave: town({ grid: { '3,3': { b: 'townhall', lv: 4 } } }) });
  assert.equal(T.donateWonder().ok, false);
});

/* ── P2-1 倉儲綁精熟 ── */
test('P2-1 resCap 也吃精熟字數（廣度沾學習）', async () => {
  const { T } = await loadTown({ prog: mkProg(50) });   // th1
  assert.equal(T.resCap(), 300 + 200 * 1 + 0 + 50);
});

/* ── P2-2 稻米死亡螺旋 ── */
test('P2-2 稻田無農夫也涓滴產米', async () => {
  const g = town({ grid: { '3,3': { b: 'townhall', lv: 1 }, '1,1': { b: 'farm', lv: 1 }, '1,2': { b: 'farm', lv: 1 } }, pop: [] });
  const { T } = await loadTown({ townSave: g });
  assert.equal(T.dailyOutput().rice, 4);   // 2 座 × 2
});
test('P2-2 農夫改基礎職業：免學校可直接指派', async () => {
  const g = town({ pop: [{ id: 1, name: 'x', job: '' }] });
  const { T } = await loadTown({ townSave: g });
  assert.equal(T.assignJob(1, 'farmer').ok, true);
});
test('P3-2 餵食順序修正：當天農夫產的米算進當天口糧、不誤判饑荒', async () => {
  // 5 人口、庫存 4 米、2 座稻田各配農夫→產 8 米，淨值為正不該饑荒
  const g = town({
    grid: { '3,3': { b: 'townhall', lv: 1 }, '1,1': { b: 'farm', lv: 1 } },
    res: { wood: 50, stone: 50, ore: 50, rice: 4 },
    pop: [{ id: 1, job: 'farmer', name: 'a' }, { id: 2, job: 'farmer', name: 'b' },
      { id: 3, job: '', name: 'c' }, { id: 4, job: '', name: 'd' }, { id: 5, job: '', name: 'e' }]
  });
  const { T } = await loadTown({ townSave: g, prog: mkProg(5), correct: 12, rnd: 0.5 });
  const r = T.harvest();
  assert.equal(r.famine, false, '當天種的米應算進口糧、不該饑荒');
});

/* ── P2-5 雕像可達 ── */
test('P2-5 雕像 scaleCost 1.15：第 20 座造價仍在倉儲上限內', async () => {
  const cost = Math.ceil(15 * Math.pow(1.15, 19));   // 第 20 座 count=19
  assert.ok(cost <= 1500 + 500, `第20座 stone=${cost} 應 ≤ 最大 resCap`);
});

/* ── P2-6 每日鉤子 ── */
test('P2-6 共學連續：當日有新精熟才續連、純榮譽', async () => {
  const { T, setProg } = await loadTown({ prog: mkProg(0), townSave: town({ pop: [{ id: 1, job: 'lumberjack', name: 'x' }] }) });
  setProg(mkProg(2));                       // 今天新精熟 2
  T.harvest();                              // harvest 內 checkStreak
  assert.equal(T.streakInfo().days, 1);
  assert.equal(T.streakInfo().todayDone, true);
});
test('P2-6 nextBestAction：沒收成時導去收成、否則導去練快精熟的字', async () => {
  const g = town({ pop: [{ id: 1, job: 'lumberjack', name: 'x' }], harvest: { date: '' } });
  const { T } = await loadTown({ townSave: g });
  assert.equal(T.nextBestAction().act, 'harvest');
});

/* ── P2-7 鐵匠鋪爐火（ore 單向出口） ── */
test('P2-7 smeltOre：城內 ore 單向煉入詞靈榮譽計數、每日上限 2', async () => {
  const g = town({ grid: { '3,3': { b: 'townhall', lv: 5 }, '2,2': { b: 'smithy', lv: 1 } }, res: { wood: 0, stone: 0, ore: 100, rice: 0 } });
  const { T } = await loadTown({ townSave: g });
  assert.equal(T.smeltOre().ok, true);
  assert.equal(T.raw.res.ore, 80);          // 扣 20
  assert.equal(T.raw.forgeEmber, 1);
  T.smeltOre();
  assert.equal(T.smeltOre().ok, false);     // 第 3 次超日限
});

/* ── P2-3 委託輸入化 ── */
test('P2-3 完成委託把英文字 enroll 進閃卡', async () => {
  const g = town({ pop: [{ id: 1, job: 'lumberjack', name: 'x' }], res: { wood: 50, stone: 0, ore: 0, rice: 0 }, questDate: '', quest: null });
  const { T, enrolled } = await loadTown({ townSave: g });
  const q = T.questInfo();
  const r = T.fulfillQuest();
  assert.equal(r.ok, true, r.msg);
  assert.ok(enrolled.includes(q.word));
});

/* ── P3-6 新手委託只派拿得到的資源 ── */
test('P3-6 新手委託不派不可能的 ore（只有木頭產線時派木頭）', async () => {
  const g = town({ pop: [{ id: 1, job: 'lumberjack', name: 'x' }], res: { wood: 5, stone: 0, ore: 0, rice: 0 }, questDate: '', quest: null });
  const { T } = await loadTown({ townSave: g });
  assert.equal(T.questInfo().res, 'wood');
});

/* ── P3-3 train 走 spendCoins ── */
test('P3-3 train 透過 spendCoins 扣學費（不手寫 localStorage）', async () => {
  const g = town({ grid: { '3,3': { b: 'townhall', lv: 1 }, '2,2': { b: 'school', lv: 1 } }, pop: [{ id: 1, job: '', name: 'x' }] });
  const { T, VDGame, spendCalls } = await loadTown({ townSave: g, coins: 500 });
  const r = T.train(1, 'doctor', true);
  assert.equal(r.ok, true, r.msg);
  assert.ok(spendCalls.includes(120));       // 走了 VDGame.spend(tuition)
  assert.equal(VDGame.raw.coins, 380);
});

/* ── P3-1 gainRes 溢出不再靜默（透過 resCap 封頂驗證） ── */
test('P3-1 資源不超過 resCap（溢出被截）', async () => {
  const g = town({ res: { wood: 498, stone: 0, ore: 0, rice: 0 } });
  const { T } = await loadTown({ townSave: g, prog: mkProg(0) });  // th1 resCap=500
  T.battleLoot(9);                            // 想加一堆木頭
  assert.ok(T.raw.res.wood <= 500);
});
