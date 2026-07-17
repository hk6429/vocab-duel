/* 詞靈純邏輯測試（P1 公式）：在 node 以最小 shim 載入 petstore.js IIFE，驗證
   1) 詞源之力盒級加權  2) 攻擊力裝備收進乘數＋軟上限  3) 鍛造必成不吞料  4) 敗場不扣分 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(__dirname, '..', 'js', 'petstore.js'), 'utf8');

// ── 測試夾具 ──
const PETS = {
  pets: [{ id: 't1', name: '測靈', ico: '🐱', kind: 's', theme: 'x', skills: ['a', 'b', 'c'], affixes: [{ k: 's', f: '-test' }] }],
  wild: [], skills: { a: {}, b: {}, c: {} }
};
const AFFIXES = {
  prefixes: [], roots: [],
  suffixes: [{ form: '-test', meaning: 'm', members: ['alpha', 'beta', 'gamma', 'delta', 'omega'] }]
};

// 建一個載入好 petstore 的沙箱：boxMap 決定每個字的 Leitner 盒號，seed 預置 vd_pets 存檔
async function loadPets({ boxMap = {}, petSave = null, coins = 100000 } = {}) {
  const storeMem = {};
  if (petSave) storeMem['vd_pets'] = JSON.stringify(petSave);
  storeMem['vd_game'] = JSON.stringify({ coins, xp: 0 });
  const localStorage = {
    getItem: k => (k in storeMem ? storeMem[k] : null),
    setItem: (k, v) => { storeMem[k] = String(v); },
    removeItem: k => { delete storeMem[k]; }
  };
  const VDStore = { box: w => (w in boxMap ? boxMap[w] : -1), today: () => '2026-07-18' };
  const gameRaw = JSON.parse(storeMem['vd_game']);
  const VDGame = { raw: gameRaw, heroName: () => '測試英雄' };
  const fetch = async (url) => ({ json: async () => (url.includes('pets') ? PETS : AFFIXES) });
  const ctx = { localStorage, VDStore, VDGame, fetch, console, Math, JSON, Object, Array, Set, Date, Promise, setTimeout };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  await ctx.VDPets.init();
  return { VDPets: ctx.VDPets, VDGame, storeMem };
}

test('P1-1 詞源之力盒級加權：高盒貢獻多、box0 只算 0.2、未學算 0', async () => {
  // alpha=box5(1.0) beta=box3(1.0) gamma=box2(0.6) delta=box0(0.2) omega=未學(0)
  const { VDPets } = await loadPets({ boxMap: { alpha: 5, beta: 3, gamma: 2, delta: 0 } });
  const expected = (1.0 + 1.0 + 0.6 + 0.2 + 0) / 5; // 0.56
  assert.ok(Math.abs(VDPets.power('t1') - expected) < 1e-9, `power=${VDPets.power('t1')} 應為 ${expected}`);
});

test('P1-1 舊制刷已學無法再灌滿：全 box0 只有 0.2，不是 1.0', async () => {
  const { VDPets } = await loadPets({ boxMap: { alpha: 0, beta: 0, gamma: 0, delta: 0, omega: 0 } });
  assert.equal(VDPets.power('t1'), 0.2);
});

test('P1-1 全家族精熟(box3+)才給滿分 1.0', async () => {
  const { VDPets } = await loadPets({ boxMap: { alpha: 3, beta: 4, gamma: 5, delta: 3, omega: 3 } });
  assert.equal(VDPets.power('t1'), 1);
});

test('P1-2 攻擊力：裝備收進(1+詞源)乘數內、且軟上限＝基礎', async () => {
  // lv5 → base=20；裝備 atk 原始 200 → 軟上限壓到 20；power：全精熟=1.0 → mult=2
  const petSave = { owned: { t1: { lv: 5, equip: { weapon: { slot: 'weapon', tier: 'common', atk: 200, hp: 0 } } } }, active: 't1' };
  const { VDPets } = await loadPets({ boxMap: { alpha: 3, beta: 3, gamma: 3, delta: 3, omega: 3 }, petSave });
  const bd = VDPets.atkBreakdown('t1');
  assert.equal(bd.base, 20);
  assert.equal(bd.equip, 20, '裝備加成應被軟上限壓到＝基礎 20');
  assert.equal(bd.equipRaw, 200);
  assert.equal(bd.capped, true);
  assert.equal(bd.mult, 2);
  assert.equal(bd.total, (20 + 20) * 2); // 80
  assert.equal(VDPets.atk('t1'), 80);
});

test('P1-2 裝備未超過基礎時不封頂、且吃到詞源乘數', async () => {
  const petSave = { owned: { t1: { lv: 10, equip: { weapon: { slot: 'weapon', tier: 'common', atk: 10, hp: 0 } } } }, active: 't1' };
  // base=10+2*10=30；裝備10<30 不封頂；power：alpha box0=0.2 其餘未學 → 0.2/5=0.04 → mult=1.04
  const { VDPets } = await loadPets({ boxMap: { alpha: 0 }, petSave });
  const bd = VDPets.atkBreakdown('t1');
  assert.equal(bd.base, 30);
  assert.equal(bd.equip, 10);
  assert.equal(bd.capped, false);
  assert.equal(bd.total, Math.round((30 + 10) * 1.04)); // 42
});

test('P1-2 頂階裝備數值已被壓平（TIER_RANGE 成長 1.25 而非 1.8）', async () => {
  const { VDPets } = await loadPets({});
  const topIdx = VDPets.TIERS.length - 1;
  const item = VDPets.rollDrop(VDPets.TIERS[topIdx]);
  // 舊制頂階 atk 可達千級；壓平後上限遠低於 200
  const val = item.atk || Math.round(item.hp / 3);
  assert.ok(val < 200, `頂階裝備數值 ${val} 應被壓到 200 以下`);
});

test('P1-4 鍛造必成、不吞料：集滿同階材料一定回傳升階裝備', async () => {
  const mk = () => ({ slot: 'weapon', tier: 'common', base: '羽毫劍', name: '羽毫劍', ico: '⚔️', atk: 3, hp: 0, perk: '' });
  const petSave = { owned: { t1: { lv: 1, equip: {} } }, active: 't1', bag: [mk(), mk(), mk(), mk()] };
  const { VDPets } = await loadPets({ petSave });
  const req = VDPets.forgeReq('common');
  assert.equal(req.chance, 1, '成功率應為必成');
  assert.equal(req.items, 4);
  // 連跑多次都不該有 failed
  for (let i = 0; i < 20; i++) {
    const save2 = { owned: { t1: { lv: 1, equip: {} } }, active: 't1', bag: [mk(), mk(), mk(), mk()] };
    const inst = await loadPets({ petSave: save2 });
    const r = inst.VDPets.forge([0, 1, 2, 3]);
    assert.equal(r.ok, true);
    assert.ok(!r.failed, '鍛造不應失敗吞料');
    assert.equal(r.item.tier, 'rare');
  }
});

test('P1-3 敗場不扣分：petLose 後積分不變', async () => {
  const petSave = { owned: { t1: { lv: 1, equip: {} } }, active: 't1', rating: 50 };
  const { VDPets } = await loadPets({ petSave });
  assert.equal(VDPets.rating, 50);
  const after = VDPets.petLose();
  assert.equal(after, 50, '敗場後積分應維持 50');
  assert.equal(VDPets.rating, 50);
});

test('P1-3 勝場照加 20、lifetime 累計', async () => {
  const petSave = { owned: { t1: { lv: 1, equip: {} } }, active: 't1', rating: 50, lifetime: 50 };
  const { VDPets } = await loadPets({ petSave });
  assert.equal(VDPets.petWin(), 70);
  assert.equal(VDPets.lifetime(), 70);
});

test('P2-7 精通位階：未滿級一律 0 星', async () => {
  const petSave = { owned: { t1: { lv: 24, equip: {} } }, active: 't1' };
  const { VDPets } = await loadPets({ boxMap: { alpha: 5, beta: 5, gamma: 5, delta: 5, omega: 5 }, petSave });
  assert.equal(VDPets.starRank('t1'), 0, '未滿級不給星');
});

test('P2-7 精通位階：滿級後依精熟比例給星、掉盒會回落', async () => {
  const petSave = { owned: { t1: { lv: 25, equip: {} } }, active: 't1' };
  // 5 字全精熟(box3+) → 100% → ★5
  let inst = await loadPets({ boxMap: { alpha: 3, beta: 3, gamma: 3, delta: 3, omega: 3 }, petSave });
  assert.equal(inst.VDPets.starRank('t1'), 5);
  // 3/5 精熟=60% → ★1（跨過 0.6 門檻）
  inst = await loadPets({ boxMap: { alpha: 3, beta: 3, gamma: 3, delta: 0, omega: 0 }, petSave });
  assert.equal(inst.VDPets.starRank('t1'), 1);
  // 掉到 2/5=40% → 0 星（回落）
  inst = await loadPets({ boxMap: { alpha: 3, beta: 3, gamma: 0, delta: 0, omega: 0 }, petSave });
  assert.equal(inst.VDPets.starRank('t1'), 0);
});

test('P2-8 取名：設定/清除暱稱、超長擋下、list 與 shareCard 反映暱稱', async () => {
  const petSave = { owned: { t1: { lv: 25, equip: {} } }, active: 't1' };
  const { VDPets } = await loadPets({ boxMap: { alpha: 3, beta: 3, gamma: 3, delta: 3, omega: 3 }, petSave });
  assert.equal(VDPets.setNick('t1', '小綴綴').ok, true);
  assert.equal(VDPets.nickOf('t1'), '小綴綴');
  assert.equal(VDPets.list().find(x => x.id === 't1').name, '小綴綴');
  const card = VDPets.shareCard('t1');
  assert.equal(card.name, '小綴綴');
  assert.equal(card.baseName, '測靈');
  assert.equal(card.star, 5);
  assert.equal(card.mastered, 5);
  assert.equal(VDPets.setNick('t1', '一二三四五六七').ok, false, '超過 6 字應擋下');
  assert.equal(VDPets.setNick('t1', '').ok, true);
  assert.equal(VDPets.nickOf('t1'), '', '空字串清除暱稱');
  assert.equal(VDPets.list().find(x => x.id === 't1').name, '測靈');
});
