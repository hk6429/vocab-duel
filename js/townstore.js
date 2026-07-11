/* 單字之城純邏輯層 VDTown：狀態(vd_town)、建造/升級規則、人口與職業、
   四資源經濟、學習換資源、徵戰掉落、WordToken。零 DOM。
   設計魂：市政廳等級 ≤ 學識（精熟字數）門檻——城的高度＝單字量。 */
const VDTown = (() => {
  const KEY = 'vd_town';
  const GRID = 8;
  const RES = ['wood', 'stone', 'ore', 'rice'];
  const RES_META = { wood: { name: '木頭', ico: '🪵' }, stone: { name: '石頭', ico: '🪨' }, ore: { name: '礦石', ico: '⛏️' }, rice: { name: '稻米', ico: '🌾' } };
  const MOVEIN_PER_DAY = 2, HOUSE_CAP = 4, MAX_LV = 5;
  const PACK = { wood: 3, stone: 2, ore: 1, rice: 1 };   // 學習換資源：每包內容
  const PACK_PER = 5;                                     // 每答對 5 題換 1 包
  const TOKEN_RATING = 40;                                // 每 40 競技積分兌 1 代幣
  const UPGRADE_MIN = 5;                                  // 升級耗時 5 分鐘 × 目標等級

  let data = null, g = null;

  const today = () => VDStore.today();
  const now = () => Date.now();

  const DEFAULT = () => ({
    grid: { '3,3': { b: 'townhall', lv: 1 } },
    res: { wood: 20, stone: 10, ore: 0, rice: 5 },
    tokens: 0, redeemedRating: 0,
    pop: [],
    movein: { date: '', count: 0 },
    harvest: { date: '' },
    packs: { date: '', claimed: 0 },
    quest: null,        // { text, res, n, rewardTokens, giver }
    questDate: '',
    seq: 1
  });

  function load() {
    try { g = Object.assign(DEFAULT(), JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch { g = DEFAULT(); }
    if (!g.grid['3,3']) g.grid['3,3'] = { b: 'townhall', lv: 1 };
  }
  const save = () => localStorage.setItem(KEY, JSON.stringify(g));
  load(); // 同步先載：徵戰掉落 battleLoot 不必等 init

  async function init() {
    if (data) return;
    load();
    data = await (await fetch('data/town.json')).json();
    if (!g.pop.length) { addResident(); addResident(); save(); } // 開村送兩位村民
  }

  /* ── 查詢 ── */
  const cells = () => Object.entries(g.grid).map(([k, v]) => ({ key: k, r: +k.split(',')[0], c: +k.split(',')[1], ...v }));
  const countOf = (b) => cells().filter(x => x.b === b).length;
  const thLevel = () => (cells().find(x => x.b === 'townhall') || { lv: 1 }).lv;
  const resCap = () => 200 + 100 * thLevel();
  const popCap = () => countOf('house') * HOUSE_CAP;
  const profCount = (job) => g.pop.filter(p => p.job === job).length;
  const idle = () => g.pop.filter(p => !p.job);
  const mastered = () => {
    let m = 0;
    const prog = JSON.parse(localStorage.getItem('vd_progress') || '{}');
    for (const w in prog) if ((prog[w].b || 0) >= 3) m++;
    return m;
  };

  function needProfOk(need) {
    for (const job in (need || {})) if (profCount(job) < need[job]) return data.jobs[job].name + ' ×' + need[job];
    return '';
  }
  function costOk(cost) {
    for (const r in (cost || {})) if ((g.res[r] || 0) < cost[r]) return RES_META[r].name + ' 不足';
    return '';
  }
  function payCost(cost) { for (const r in (cost || {})) g.res[r] -= cost[r]; }
  function gainRes(obj, mult) {
    for (const r in obj) g.res[r] = Math.min(resCap(), (g.res[r] || 0) + Math.round(obj[r] * (mult || 1)));
  }

  /* ── 建造 ── */
  function canBuild(b) {
    const def = data.buildings[b];
    if (!def) return { ok: false, msg: '沒有這種建築' };
    if (b === 'townhall') return { ok: false, msg: '市政廳只有一座' };
    if (countOf(b) >= def.max) return { ok: false, msg: `${def.name} 最多 ${def.max} 座` };
    const lack = needProfOk(def.needProf);
    if (lack) return { ok: false, msg: `需要職業居民：${lack}` };
    const short = costOk(def.cost);
    if (short) return { ok: false, msg: short };
    return { ok: true };
  }
  function build(b, r, c) {
    const key = `${r},${c}`;
    if (r < 0 || c < 0 || r >= GRID || c >= GRID) return { ok: false, msg: '出了城界' };
    if (g.grid[key]) return { ok: false, msg: '這格已有建築' };
    const chk = canBuild(b);
    if (!chk.ok) return chk;
    payCost(data.buildings[b].cost);
    g.grid[key] = { b, lv: 1 };
    save();
    return { ok: true };
  }

  /* ── 升級（市政廳走學識門檻；其他建築 ≤ 市政廳等級、Lv2+ 要木工坊） ── */
  function upgradeReq(key) {
    const cell = g.grid[key];
    if (!cell) return { ok: false, msg: '沒有建築' };
    const next = cell.lv + 1;
    if (next > MAX_LV) return { ok: false, msg: '已是最高級' };
    if (cell.up) return { ok: false, msg: '升級中' };
    if (cell.b === 'townhall') {
      const req = data.thUpgrade[next];
      const m = mastered();
      if (m < req.mastered) return { ok: false, msg: `學識不足：精熟 ${m}/${req.mastered} 字（多背單字，城才能長高）` };
      const lack = needProfOk(req.needProf);
      if (lack) return { ok: false, msg: `需要職業居民：${lack}` };
      const short = costOk(req.cost);
      if (short) return { ok: false, msg: short };
      return { ok: true, cost: req.cost, next };
    }
    if (next > thLevel()) return { ok: false, msg: `市政廳只有 Lv${thLevel()}——先升市政廳` };
    if (next >= 2 && !countOf('carpenter')) return { ok: false, msg: '升 Lv2 以上要先蓋木工坊（要有木工）' };
    const base = data.buildings[cell.b].cost;
    const cost = {};
    for (const r in base) cost[r] = base[r] * next;
    const short = costOk(cost);
    if (short) return { ok: false, msg: short };
    return { ok: true, cost, next };
  }
  function upgrade(key) {
    const req = upgradeReq(key);
    if (!req.ok) return req;
    payCost(req.cost);
    const cell = g.grid[key];
    cell.up = { done: now() + req.next * UPGRADE_MIN * 60000, to: req.next };
    save();
    return { ok: true, minutes: req.next * UPGRADE_MIN };
  }
  function tickUpgrades() {
    let changed = false;
    for (const key in g.grid) {
      const c = g.grid[key];
      if (c.up && now() >= c.up.done) { c.lv = c.up.to; delete c.up; changed = true; }
    }
    if (changed) save();
    return changed;
  }
  function rushUpgrade(key) {
    const c = g.grid[key];
    if (!c || !c.up) return { ok: false, msg: '沒有進行中的升級' };
    if (g.tokens < 1) return { ok: false, msg: '需要 1 枚城邦代幣' };
    g.tokens -= 1; c.lv = c.up.to; delete c.up; save();
    return { ok: true };
  }

  /* ── 人口 ── */
  function addResident() {
    const name = data.names[(g.seq - 1) % data.names.length];
    g.pop.push({ id: g.seq++, name, job: '' });
  }
  function moveinInfo() {
    if (g.movein.date !== today()) { g.movein = { date: today(), count: 0 }; save(); }
    return {
      todayLeft: MOVEIN_PER_DAY - g.movein.count,
      roomLeft: popCap() - g.pop.length,
      riceOk: g.res.rice > 0
    };
  }
  function tryMovein() {
    const m = moveinInfo();
    if (m.todayLeft <= 0) return { ok: false, msg: '今天已搬入 2 位——明天再來（每日上限）' };
    if (m.roomLeft <= 0) return { ok: false, msg: '沒有空屋——先蓋民房' };
    if (!m.riceOk) return { ok: false, msg: '沒有稻米，居民不肯來——先種田或學習換資源' };
    g.res.rice -= 1;
    g.movein.count++;
    addResident();
    save();
    return { ok: true, name: g.pop[g.pop.length - 1].name };
  }

  /* ── 職業 ── */
  function assignJob(id, job) {
    const p = g.pop.find(x => x.id === id);
    if (!p) return { ok: false, msg: '沒有這位居民' };
    if (job === '') { p.job = ''; save(); return { ok: true }; }
    const def = data.jobs[job];
    if (!def) return { ok: false, msg: '沒有這種工作' };
    if (!def.basic) return { ok: false, msg: '職業要到學校訓練' };
    p.job = job; save();
    return { ok: true };
  }
  /* 學校訓練：UI 先跑主題單字測驗，通過了才呼叫 train */
  function train(id, job, quizPassed) {
    const p = g.pop.find(x => x.id === id);
    const def = data.jobs[job];
    if (!p) return { ok: false, msg: '沒有這位居民' };
    if (!def || def.basic) return { ok: false, msg: '這不是訓練職業' };
    if (!countOf('school')) return { ok: false, msg: '先蓋學校' };
    if (p.job && !data.jobs[p.job].basic) return { ok: false, msg: `${p.name} 已是${data.jobs[p.job].name}` };
    if (!quizPassed) return { ok: false, msg: '要先通過主題單字測驗' };
    if (VDGame.raw.coins < def.tuition) return { ok: false, msg: `學費不足，需要 ${def.tuition} 字幣` };
    VDGame.raw.coins -= def.tuition;
    localStorage.setItem('vd_game', JSON.stringify(VDGame.raw));
    p.job = job; save();
    return { ok: true };
  }

  /* ── 每日產出（工人＝自動化倍率；親自學習永遠更快） ── */
  function dailyOutput() {
    const out = { wood: 0, stone: 0, ore: 0, rice: 0 };
    for (const p of g.pop) {
      const def = data.jobs[p.job];
      if (!def) continue;
      if (p.job === 'farmer' && !countOf('farm')) continue;
      for (const r in def.out) {
        let v = def.out[r];
        if (def.boostBy && countOf(def.boostBy)) v += 2;
        out[r] += v;
      }
    }
    if (countOf('hospital')) for (const r of RES) if (out[r]) out[r] += 1;
    return out;
  }
  function harvestReady() { return g.harvest.date !== today() && Object.values(dailyOutput()).some(v => v); }
  function harvest() {
    if (g.harvest.date === today()) return { ok: false, msg: '今天收過了——明天再來' };
    const out = dailyOutput();
    if (!Object.values(out).some(v => v)) return { ok: false, msg: '沒有工人在工作' };
    gainRes(out);
    g.harvest.date = today();
    save();
    return { ok: true, out };
  }

  /* ── 學習換資源：今日答對題數 → 資源包（燈塔 +2 包上限） ── */
  function packInfo() {
    if (g.packs.date !== today()) { g.packs = { date: today(), claimed: 0 }; save(); }
    const vg = JSON.parse(localStorage.getItem('vd_game') || '{}');
    const correct = ((vg.quests || {}).date === today() ? (vg.quests.prog || {}).correct : 0) || 0;
    const cap = 6 + (countOf('lighthouse') ? 2 : 0);
    const earned = Math.min(cap, Math.floor(correct / PACK_PER));
    return { correct, earned, claimed: g.packs.claimed, avail: Math.max(0, earned - g.packs.claimed), cap };
  }
  function claimPacks() {
    const info = packInfo();
    if (!info.avail) return { ok: false, msg: `再答對 ${PACK_PER - (info.correct % PACK_PER)} 題就有下一包` };
    for (let i = 0; i < info.avail; i++) gainRes(PACK);
    g.packs.claimed += info.avail;
    save();
    return { ok: true, n: info.avail, pack: PACK };
  }

  /* ── 徵戰掉資源（petbattle 野生勝利呼叫） ── */
  function battleLoot(floor) {
    const loot = { wood: 2 + floor, stone: 1 + floor };
    if (floor >= 3) loot.ore = Math.ceil(floor / 2);
    if (floor >= 5) loot.rice = Math.ceil(floor / 3);
    gainRes(loot);
    save();
    return loot;
  }

  /* ── WordToken：競技積分兌代幣（遊戲內記帳，非真金錢） ── */
  function tokenInfo() {
    const rating = (window.VDPets && VDPets.rating) || 0;
    const avail = Math.floor(Math.max(0, rating - g.redeemedRating) / TOKEN_RATING);
    return { tokens: g.tokens, rating, avail, per: TOKEN_RATING };
  }
  function redeemTokens() {
    const t = tokenInfo();
    if (!t.avail) return { ok: false, msg: `再拿 ${TOKEN_RATING - (t.rating - g.redeemedRating) % TOKEN_RATING} 競技積分兌 1 枚` };
    g.tokens += t.avail;
    g.redeemedRating += t.avail * TOKEN_RATING;
    save();
    return { ok: true, n: t.avail };
  }
  function tokenToRes(r) {
    if (!RES.includes(r)) return { ok: false, msg: '沒有這種資源' };
    if (g.tokens < 1) return { ok: false, msg: '代幣不足' };
    g.tokens -= 1;
    gainRes({ [r]: 20 });
    save();
    return { ok: true };
  }

  /* ── 英文委託（每日一單，居民隨機發） ── */
  function questInfo() {
    if (g.questDate !== today()) {
      g.questDate = today();
      if (g.pop.length) {
        const t = data.questTemplates[Math.floor(Math.random() * data.questTemplates.length)];
        const n = t.n[0] + Math.floor(Math.random() * (t.n[1] - t.n[0] + 1));
        const giver = g.pop[Math.floor(Math.random() * g.pop.length)];
        g.quest = { text: t.text.replace('{n}', n), res: t.res, n, rewardTokens: t.rewardTokens, giver: giver.name, done: false };
      } else g.quest = null;
      save();
    }
    return g.quest;
  }
  function fulfillQuest() {
    const q = questInfo();
    if (!q || q.done) return { ok: false, msg: '今天沒有委託了' };
    if ((g.res[q.res] || 0) < q.n) return { ok: false, msg: `${RES_META[q.res].name}不夠（要 ${q.n}）` };
    g.res[q.res] -= q.n;
    g.tokens += q.rewardTokens;
    q.done = true;
    save();
    return { ok: true, tokens: q.rewardTokens };
  }

  /* ── NPC 台詞：依職業出英文句＋目標單字 ── */
  function npcLine(p) {
    const kind = p.job && data.npcLines[p.job] ? p.job : 'villager';
    const lines = data.npcLines[kind];
    const words = data.npcWords[kind];
    const w = words[Math.floor(Math.random() * words.length)];
    return { text: lines[Math.floor(Math.random() * lines.length)].replace('{w}', `<b class="npc-w" data-w="${w}">${w}</b>`), word: w };
  }

  /* ── 雲端綁定（同步碼） ── */
  function exportState() { return JSON.parse(JSON.stringify(g)); }
  function importState(obj) {
    if (!obj || !obj.grid || !obj.res) return false;
    g = Object.assign(DEFAULT(), obj);
    save();
    return true;
  }

  return {
    init, GRID, RES, RES_META, MAX_LV,
    get raw() { return g; },
    cells, countOf, thLevel, resCap, popCap, profCount, idle, mastered,
    canBuild, build, upgradeReq, upgrade, tickUpgrades, rushUpgrade,
    moveinInfo, tryMovein, assignJob, train,
    dailyOutput, harvestReady, harvest,
    packInfo, claimPacks, battleLoot,
    tokenInfo, redeemTokens, tokenToRes,
    questInfo, fulfillQuest, npcLine,
    exportState, importState,
    buildings: () => data.buildings, jobs: () => data.jobs,
    trainWords: (job) => (data.trainWords[job] || []).slice()
  };
})();
window.VDTown = VDTown;
