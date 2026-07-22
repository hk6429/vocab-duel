/* 單字之城純邏輯層 VDTown：狀態(vd_town)、建造/升級規則、人口與職業、
   四資源經濟、學習換資源、徵戰掉落、WordToken。零 DOM。
   設計魂：市政廳等級 ≤ 學識（精熟字數）門檻——城的高度＝單字量。 */
const VDTown = (() => {
  const KEY = 'vd_town';
  const GRID = 8;
  const RES = ['wood', 'stone', 'ore', 'rice'];
  const RES_META = { wood: { name: '木頭', ico: '🪵' }, stone: { name: '石頭', ico: '🪨' }, ore: { name: '礦石', ico: '⛏️' }, rice: { name: '稻米', ico: '🌾' } };
  const RES_EN = { wood: 'timber', stone: 'stone', ore: 'ore', rice: 'rice' };   // P2-3 委託英文字（交付時進閃卡）
  const MOVEIN_PER_DAY = 2, HOUSE_CAP = 4, MAX_LV = 5;
  const PACK = { wood: 3, stone: 2, ore: 1, rice: 1 };   // 學習換資源：每包內容
  const PACK_PER = 5;                                     // 每答對 5 題換 1 包
  const TOKEN_RATING = 40;                                // 每 40 競技積分兌 1 代幣
  const UPGRADE_MIN = 5;                                  // 升級耗時 5 分鐘 × 目標等級
  /* P1-3 封無日限旁路：讓「答題換資源」恆為最划算的資源主幹 */
  const LOOT_FULL_BASE = 3;                               // 徵戰每日前 3 場全額掉落（＋燈塔級），之後減半
  const TOKEN_RES_AMT = 10, TOKEN_RES_PER_DAY = 3;        // 代幣換資源：匯率 20→10、每日上限 3 次
  const RUSH_PER_DAY = 3;                                 // 代幣加速每日上限 3 次
  /* P1-5 endgame：市政廳滿級後由精熟長尾＋世界奇觀驅動的無限聲望層 */
  const PRESTIGE_BASE = 700, PRESTIGE_STEP = 50;         // 精熟每超過 700 再 +50 字點亮一顆聲望★
  const WONDER_COST = { tokens: 2, ore: 50, rice: 30 };  // 世界奇觀：後期資源＋代幣的唯一大出口
  const STREAK_MIN = 1;                                   // 共學日曆：當日「新精熟 ≥1 字」才續連（純榮譽、不發可轉資源）

  let data = null, g = null;

  const today = () => VDStore.today();
  const now = () => Date.now();

  const DEFAULT = () => ({
    name: '',
    grid: { '3,3': { b: 'townhall', lv: 1 } },
    res: { wood: 20, stone: 10, ore: 0, rice: 18 },
    tokens: 0, redeemedRating: 0,
    visitCode: '',
    log: [],
    pop: [],
    movein: { date: '', count: 0 },
    rush: { date: '', count: 0 },
    harvest: { date: '' },
    packs: { date: '', claimed: 0 },
    coinPacks: { date: '', count: 0 },
    quest: null,        // { text, res, n, rewardTokens, giver }
    questDate: '',
    seq: 1,
    lootDay: { date: '', count: 0 },      // P1-3 徵戰每日掉落計數
    tokenResDay: { date: '', count: 0 },  // P1-3 代幣換資源每日計數
    rushDay: { date: '', count: 0 },      // P1-3 代幣加速每日計數
    masterySnap: { date: '', count: 0 },  // P1-1 當日精熟基準（算「今日新精熟增量」）
    streak: { date: '', days: 0, best: 0 }, // P2-6 共學日曆連續達標
    wonder: 0,          // P1-5 世界奇觀層（代幣/後期資源出口）
    forgeEmber: 0       // P2-7 鐵匠鋪爐火：城內 ore 單向煉入詞靈的榮譽計數
  });

  function load() {
    try { g = Object.assign(DEFAULT(), JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch { g = DEFAULT(); }
    if (!g.grid['3,3']) g.grid['3,3'] = { b: 'townhall', lv: 1 };
  }
  const save = () => localStorage.setItem(KEY, JSON.stringify(g));
  load(); // 同步先載：徵戰掉落 battleLoot 不必等 init

  /* 城史紀年：大事記，最多留 40 條 */
  function logEvt(t) {
    (g.log = g.log || []).push({ d: today(), t });
    if (g.log.length > 40) g.log = g.log.slice(-40);
  }
  function setName(n) {
    n = String(n || '').trim();
    if (!n || n.length > 12) return { ok: false, msg: '城名 1–12 個字' };
    if (/[<>&"']/.test(n)) return { ok: false, msg: '名字不能包含特殊符號' };
    g.name = n; logEvt(`📜 城名定為「${n}」`); save();
    return { ok: true };
  }

  async function init() {
    if (data) return;
    load();
    data = await (await fetch('data/town.json')).json();
    try { masterySnap(); } catch { /* VDStore 尚未就緒時略過，稍後首次呼叫再抓基準 */ } // P1-1 盡早抓當日精熟基準
    if (!g.pop.length) { addResident(); addResident(); save(); } // 開村送兩位村民
  }

  /* ── 查詢 ── */
  const cells = () => Object.entries(g.grid).map(([k, v]) => ({ key: k, r: +k.split(',')[0], c: +k.split(',')[1], ...v }));
  const countOf = (b) => cells().filter(x => x.b === b).length;
  const sumLv = (b) => cells().filter(x => x.b === b).reduce((s, x) => s + (x.lv || 1), 0); // 同類建築總等級＝升級加成的計量單位
  const thLevel = () => (cells().find(x => x.b === 'townhall') || { lv: 1 }).lv;
  // P2-1 倉儲上限也綁精熟字數（廣度沾學習）：每精熟 1 字 +1，最多 +800
  // 2026-07-22 玩家反映早期倉庫太小、資源常被浪費，全面調高（基底/市政廳/雕像/精熟上限皆加大）
  const resCap = () => 600 + 300 * thLevel() + 4 * sumLv('statue') + Math.min(800, mastered());
  const popCap = () => HOUSE_CAP * sumLv('house');                    // 民房每級多住 4 人（Lv5=20）
  const profCount = (job) => g.pop.filter(p => p.job === job).length;
  const idle = () => g.pop.filter(p => !p.job);
  /* P1-2 精熟認定＝盒 ≥3「且不是假熟練」——重用 store.js 的 isFakeMastery(box≥3 但 trustScore<0.7)，
     堵死「同一場把生字連對 3 次就算精熟」的刷分後門。VDStore 未載入時退回裸 box≥3（不誤卡）。 */
  const fakeMastery = (w) => {
    try { return !!(window.VDStore && VDStore.isFakeMastery && VDStore.isFakeMastery(w)); }
    catch { return false; }
  };
  const mastered = () => {
    let m = 0;
    const prog = JSON.parse(localStorage.getItem('vd_progress') || '{}');
    for (const w in prog) if ((prog[w].b || 0) >= 3 && !fakeMastery(w)) m++;
    return m;
  };
  /* 快精熟的字（盒 1–2，再對幾次就精熟）——市政廳「去練」入口用。
     P1-2 補盲區：盒 ≥3 但被判假熟的字也要出現在這裡，否則它既不算精熟又無「去練」入口。 */
  const nearMastered = () => {
    const prog = JSON.parse(localStorage.getItem('vd_progress') || '{}');
    return Object.keys(prog)
      .filter(w => { const b = prog[w].b || 0; return b === 1 || b === 2 || (b >= 3 && fakeMastery(w)); })
      .sort((a, b) => (prog[b].b || 0) - (prog[a].b || 0));
  };
  /* P1-1 今日新精熟增量：收成的學習係數綁「真的多背了幾個字」而非「隨便答對幾題」 */
  function masterySnap() {
    if (!g.masterySnap || g.masterySnap.date !== today()) { g.masterySnap = { date: today(), count: mastered() }; save(); }
    return g.masterySnap;
  }
  const newMasteredToday = () => Math.max(0, mastered() - masterySnap().count);

  function needProfOk(need) {
    for (const job in (need || {})) if (profCount(job) < need[job]) return data.jobs[job].name + ' ×' + need[job];
    return '';
  }
  function costOk(cost) {
    for (const r in (cost || {})) if ((g.res[r] || 0) < cost[r]) return RES_META[r].name + ' 不足';
    return '';
  }
  function payCost(cost) { for (const r in (cost || {})) g.res[r] -= cost[r]; }
  /* P3-1 回傳被倉儲上限截掉的量，讓 UI 能提示「倉庫滿了、X 浪費、快加倉」而非靜默蒸發 */
  function gainRes(obj, mult) {
    const cap = resCap();
    let wasted = 0;
    for (const r in obj) {
      const want = (g.res[r] || 0) + Math.round(obj[r] * (mult || 1));
      if (want > cap) wasted += want - cap;
      g.res[r] = Math.min(cap, want);
    }
    return wasted;
  }

  /* ── 建造 ── */
  /* 可重複建築（scaleCost）：造價隨已建數量遞增（如雕像每多一座 ×1.3） */
  function buildCost(b) {
    const def = data.buildings[b];
    const base = def ? (def.cost || {}) : {};
    if (!def || !def.scaleCost) return base;
    const mult = Math.pow(def.scaleCost, countOf(b));
    const cost = {};
    for (const r in base) cost[r] = Math.ceil(base[r] * mult);
    return cost;
  }
  function canBuild(b) {
    const def = data.buildings[b];
    if (!def) return { ok: false, msg: '沒有這種建築' };
    if (b === 'townhall') return { ok: false, msg: '市政廳只有一座' };
    if (countOf(b) >= def.max) return { ok: false, msg: `${def.name} 最多 ${def.max} 座` };
    const lack = needProfOk(def.needProf);
    if (lack) return { ok: false, msg: `需要職業居民：${lack}` };
    const short = costOk(buildCost(b));
    if (short) return { ok: false, msg: short };
    return { ok: true };
  }
  function build(b, r, c) {
    const key = `${r},${c}`;
    if (r < 0 || c < 0 || r >= GRID || c >= GRID) return { ok: false, msg: '出了城界' };
    if (g.grid[key]) return { ok: false, msg: '這格已有建築' };
    const chk = canBuild(b);
    if (!chk.ok) return chk;
    payCost(buildCost(b));
    g.grid[key] = { b, lv: 1 };
    logEvt(`🏗️ ${data.buildings[b].name} 落成`);
    save();
    return { ok: true };
  }
  /* 拆除：退一半建材；搬移：搬到空地不花錢 */
  function demolish(key) {
    const cell = g.grid[key];
    if (!cell) return { ok: false, msg: '沒有建築' };
    if (cell.b === 'townhall') return { ok: false, msg: '市政廳不能拆' };
    const base = data.buildings[cell.b].cost || {};
    const back = {};
    for (const r in base) back[r] = Math.floor(base[r] / 2);
    gainRes(back);
    logEvt(`🧨 拆除 ${data.buildings[cell.b].name}`);
    delete g.grid[key];
    save();
    return { ok: true, back };
  }
  function move(key, r, c) {
    const to = `${r},${c}`;
    if (r < 0 || c < 0 || r >= GRID || c >= GRID) return { ok: false, msg: '出了城界' };
    if (!g.grid[key]) return { ok: false, msg: '沒有建築' };
    if (g.grid[to]) return { ok: false, msg: '那格已有建築' };
    g.grid[to] = g.grid[key];
    delete g.grid[key];
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
  function finishUp(key) {
    const c = g.grid[key];
    c.lv = c.up.to; delete c.up;
    logEvt(`🔨 ${data ? data.buildings[c.b].name : c.b} 升到 Lv${c.lv}`);
  }
  function tickUpgrades() {
    let changed = false;
    for (const key in g.grid) {
      const c = g.grid[key];
      if (c.up && now() >= c.up.done) { finishUp(key); changed = true; }
    }
    if (changed) save();
    return changed;
  }
  function rushDayInfo() {
    if (!g.rushDay || g.rushDay.date !== today()) { g.rushDay = { date: today(), count: 0 }; save(); }
    return { todayLeft: Math.max(0, RUSH_PER_DAY - g.rushDay.count) };
  }
  function rushUpgrade(key) {
    const c = g.grid[key];
    if (!c || !c.up) return { ok: false, msg: '沒有進行中的升級' };
    // P1-3 代幣加速加每日上限，別讓硬通貨無限 pay-to-skip 碾壓答題加速
    if (rushDayInfo().todayLeft <= 0) return { ok: false, msg: `代幣加速每日上限 ${RUSH_PER_DAY} 次，明天再來（答題加速不限次，勤學最快）` };
    if (g.tokens < 1) return { ok: false, msg: '需要 1 枚城邦代幣' };
    g.tokens -= 1; g.rushDay.count++; finishUp(key); save();
    return { ok: true };
  }
  /* 答題加速：UI 跑完 5 題對 4 才呼叫（勤學＝最快的工程隊）。
     P1-3：放寬到 4 次，讓「靠答題加速」不劣於「靠代幣加速」（learn-to-skip ≥ pay-to-skip） */
  const QUIZRUSH_PER_DAY = 4;
  function rushInfo() {
    if (!g.rush || g.rush.date !== today()) { g.rush = { date: today(), count: 0 }; save(); }
    return { todayLeft: Math.max(0, QUIZRUSH_PER_DAY - g.rush.count) };
  }
  function quizRush(key, passed) {
    const c = g.grid[key];
    if (!c || !c.up) return { ok: false, msg: '沒有進行中的升級' };
    if (rushInfo().todayLeft <= 0) return { ok: false, msg: '今日答題加速已用完，明天再來！' };
    if (!passed) return { ok: false, msg: '要先通過加速測驗' };
    g.rush.count++;
    finishUp(key); save();
    return { ok: true };
  }

  /* ── 人口 ── */
  function addResident() {
    const name = data.names[(g.seq - 1) % data.names.length];
    const rare = Math.random() < 0.08;   // ✨ 稀有居民：產量 ×2
    g.pop.push({ id: g.seq++, name, job: '', rare });
    if (rare) logEvt(`✨ 稀有居民 ${name} 入住（產量加倍）`);
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
    const np = g.pop[g.pop.length - 1];
    logEvt(`🏠 ${np.name} 搬進城`);
    save();
    return { ok: true, name: np.name, rare: np.rare };
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
    // P3-3 走統一的 spendCoins（會優先呼叫 VDGame.spend 的驗證／防負值），不再手寫 localStorage
    if (!spendCoins(def.tuition)) return { ok: false, msg: `學費不足，需要 ${def.tuition} 字幣` };
    p.job = job;
    logEvt(`🎓 ${p.name} 結業成為${def.name}`);
    save();
    return { ok: true };
  }

  /* ── 每日產出（工人＝自動化倍率；親自學習永遠更快；稀有居民 ×2） ── */
  function dailyOutput() {
    const out = { wood: 0, stone: 0, ore: 0, rice: 0 };
    for (const p of g.pop) {
      const def = data.jobs[p.job];
      if (!def) continue;
      if (p.job === 'farmer' && !countOf('farm')) continue;
      /* 升級加成：加成建築(礦場/採石場)presence 就 +2、每級再 +2；
         啟用建築(稻田)lv1 維持基準、每升 1 級 +2 */
      const boost = def.boostBy ? 2 * sumLv(def.boostBy)
        : def.needBuilding ? 2 * (sumLv(def.needBuilding) - countOf(def.needBuilding))
          : 0;
      for (const r in def.out) {
        let v = def.out[r] + boost;
        if (p.rare) v *= 2;
        out[r] += v;
      }
    }
    // P2-2 稻田涓滴：有稻田但當下沒農夫產米時，每座自動產 2 米，讓「種田」與「訓練農夫」解耦、緩解死亡螺旋
    const farmlands = countOf('farm');
    if (farmlands && !out.rice) out.rice = 2 * farmlands;
    const hosp = sumLv('hospital');                       // 醫院每級：全城每項產出 +1
    if (hosp) for (const r of RES) if (out[r]) out[r] += hosp;
    return out;
  }
  const todayCorrect = () => {
    const vg = JSON.parse(localStorage.getItem('vd_game') || '{}');
    return ((vg.quests || {}).date === today() ? (vg.quests.prog || {}).correct : 0) || 0;
  };
  function harvestReady() { return g.harvest.date !== today() && Object.values(dailyOutput()).some(v => v); }
  /* P1-1 學習係數：綁「今天真的多背了幾個字」而非「隨便答對幾題」。
     全額(×1.0)必須有真實新精熟；純複習日給 0.7 保底、地板 0.5，不把餵養做成懲罰（白帽）。 */
  function learnMult() {
    const nm = newMasteredToday();
    if (nm >= 3) return 1.0;
    if (nm >= 1) return 0.85;
    if (todayCorrect() >= 10) return 0.7;   // 沒新精熟但認真複習
    if (todayCorrect() >= 1) return 0.6;
    return 0.5;                              // 今天完全沒練
  }
  function harvest() {
    if (g.harvest.date === today()) return { ok: false, msg: '今天收過了——明天再來' };
    const base = dailyOutput();
    if (!Object.values(base).some(v => v)) return { ok: false, msg: '沒有工人在工作' };
    /* 收成變異：每項 ×0.7–1.4，天天有點不一樣 */
    const out = { wood: 0, stone: 0, ore: 0, rice: 0 };
    for (const r of RES) if (base[r]) out[r] = Math.max(1, Math.round(base[r] * (0.7 + Math.random() * 0.7)));
    /* 口糧：全城居民每人吃 1 米；判饑荒用「當日產米＋庫存」（P3-2 修正：當天種的米算得進當天口糧） */
    const ate = g.pop.length;
    const riceAvail = (g.res.rice || 0) + (out.rice || 0);
    const famine = riceAvail < ate;
    const lm = learnMult();
    /* 係數：全資源套學習係數；饑荒時建材另取「較重者」作用一次（審查：lazy×famine 不疊乘、地板不歸零） */
    for (const r of RES) {
      if (!out[r]) continue;
      let coef = lm;
      if (famine && (r === 'wood' || r === 'stone' || r === 'ore')) coef = Math.min(coef, 0.6);
      out[r] = Math.max(1, Math.round(out[r] * coef));
    }
    gainRes(out);
    if (famine) { g.res.rice = 0; logEvt('🍚 糧倉見底，居民鬧饑荒——今日建材產出打折'); }
    else g.res.rice = Math.max(0, g.res.rice - ate);
    g.harvest.date = today();
    checkStreak();
    /* 奇遇：大奇遇 5%（稀有資源大包，不再直接送代幣——避免掛機白送硬通貨）＋小奇遇 30% */
    let event = null;
    const roll = Math.random();
    if (roll < 0.05) {
      const bigs = [
        { t: '🐉 天降祥龍，留下一車奇珍', en: 'A dragon left a cart of treasures!', gain: { wood: 15, stone: 12, ore: 8 } },
        { t: '🏺 挖地基挖出前朝寶庫', en: 'We found an ancient treasure vault!', gain: { wood: 10, stone: 10, ore: 8, rice: 6 } }
      ];
      event = bigs[Math.floor(Math.random() * bigs.length)];
      gainRes(event.gain);
      logEvt(`🌟 大奇遇！${event.t}`);
    } else if (roll < 0.35) {
      const evs = [
        { t: '🐫 商隊路過，留下謝禮', en: 'A caravan passed by!', gain: { wood: 6 } },
        { t: '🎣 河裡撈到沉木與奇石', en: 'Treasure from the river!', gain: { wood: 4, stone: 4 } },
        { t: '⛏️ 礦脈露頭，撿到礦石', en: 'We found a shiny vein!', gain: { ore: 3 } },
        { t: '🌾 夜雨滋潤，稻子多熟一片', en: 'Night rain blessed the fields!', gain: { rice: 3 } }
      ];
      event = evs[Math.floor(Math.random() * evs.length)];
      gainRes(event.gain);
      logEvt(`${event.t}`);
    }
    save();
    return { ok: true, out, learnMult: lm, newMastered: newMasteredToday(), event, ate, famine };
  }
  /* P2-6 共學日曆：當日「新精熟 ≥1 字」才續連（純榮譽戳章，不發可轉資源的字幣，避免掛機續命） */
  function checkStreak() {
    if (!g.streak) g.streak = { date: '', days: 0, best: 0 };
    if (g.streak.date === today()) return;
    if (newMasteredToday() < STREAK_MIN) return;   // 今天沒有真的多背字，不續連（也不歸零，等真的學了才算）
    const y = new Date(Date.parse(today()) - 86400000).toISOString().slice(0, 10);
    g.streak.days = (g.streak.date === y) ? g.streak.days + 1 : 1;   // 昨天有續才連號，否則重新起算
    g.streak.date = today();
    g.streak.best = Math.max(g.streak.best || 0, g.streak.days);
    if (g.streak.days >= 3) logEvt(`🔥 共學連續 ${g.streak.days} 天`);
  }
  function streakInfo() { return { days: (g.streak && g.streak.date === today() ? g.streak.days : (g.streak ? g.streak.days : 0)), best: (g.streak && g.streak.best) || 0, todayDone: !!(g.streak && g.streak.date === today()) }; }

  /* ── 學習換資源：今日答對題數 → 資源包（燈塔 +2 包上限） ── */
  function packInfo() {
    if (g.packs.date !== today()) { g.packs = { date: today(), claimed: 0 }; save(); }
    const correct = todayCorrect();
    const cap = 6 + 2 * sumLv('lighthouse');   // 燈塔每級：每日包上限 +2
    const earned = Math.min(cap, Math.floor(correct / PACK_PER));
    return { correct, earned, claimed: g.packs.claimed, avail: Math.max(0, earned - g.packs.claimed), cap };
  }
  /* 每包從 3 種配方隨機抽；5% 出「✨ 金色補給包」內容雙倍 */
  const PACK_RECIPES = [
    { wood: 5, stone: 1, rice: 1 },          // 林業包
    PACK,                                    // 均衡包
    { stone: 4, ore: 2, rice: 1 }            // 礦石包
  ];
  function claimPacks() {
    const info = packInfo();
    if (!info.avail) return { ok: false, msg: `再答對 ${PACK_PER - (info.correct % PACK_PER)} 題就有下一包` };
    const got = { wood: 0, stone: 0, ore: 0, rice: 0 };
    let golden = 0;
    for (let i = 0; i < info.avail; i++) {
      const recipe = PACK_RECIPES[Math.floor(Math.random() * PACK_RECIPES.length)];
      const mult = Math.random() < 0.05 ? 2 : 1;
      if (mult === 2) golden++;
      for (const r in recipe) got[r] += recipe[r] * mult;
    }
    gainRes(got);
    g.packs.claimed += info.avail;
    save();
    return { ok: true, n: info.avail, got, golden };
  }

  /* ── 金幣資源包：50 字幣＝1 補給包（每日上限 4 包，避免打爆城鎮經濟） ── */
  const COIN_PACK_COST = 50, COIN_PACK_PER_DAY = 4;
  function spendCoins(n) {
    if (window.VDGame && typeof VDGame.spend === 'function') return VDGame.spend(n);
    if (!window.VDGame || (VDGame.raw.coins || 0) < n) return false;
    VDGame.raw.coins -= n;
    localStorage.setItem('vd_game', JSON.stringify(VDGame.raw));
    return true;
  }
  function coinPackInfo() {
    if (!g.coinPacks || g.coinPacks.date !== today()) { g.coinPacks = { date: today(), count: 0 }; save(); }
    return { todayLeft: Math.max(0, COIN_PACK_PER_DAY - g.coinPacks.count), cost: COIN_PACK_COST };
  }
  function coinToRes() {
    const info = coinPackInfo();
    if (info.todayLeft <= 0) return { ok: false, msg: `字幣換補給每日上限 ${COIN_PACK_PER_DAY} 包，明天再來！` };
    if (!spendCoins(COIN_PACK_COST)) return { ok: false, msg: `字幣不足，需要 ${COIN_PACK_COST} 枚` };
    g.coinPacks.count++;
    gainRes(PACK);
    save();
    return { ok: true, pack: PACK };
  }

  /* ── 徵戰掉資源（petbattle 野生勝利呼叫） ──
     P1-3：改「當日場次硬日限」而非 lazy——打野戰本身就要答對，lazy 對打野者永遠無效；
     每日前 (3＋燈塔級) 場全額，之後掉落減半，收窄掛機刷戰農場，讓答題換包恆為主幹。 */
  function lootDayInfo() {
    if (!g.lootDay || g.lootDay.date !== today()) { g.lootDay = { date: today(), count: 0 }; save(); }
    const cap = LOOT_FULL_BASE + sumLv('lighthouse');
    return { count: g.lootDay.count, cap, fullLeft: Math.max(0, cap - g.lootDay.count) };
  }
  function battleLoot(floor) {
    const info = lootDayInfo();
    const full = info.count < info.cap;
    const loot = { wood: 2 + floor, stone: 1 + floor };
    if (floor >= 3) loot.ore = Math.ceil(floor / 2);
    if (floor >= 5) loot.rice = Math.ceil(floor / 3);
    if (!full) for (const r in loot) loot[r] = Math.max(1, Math.floor(loot[r] * 0.5));
    g.lootDay.count++;
    gainRes(loot);
    save();
    return loot;
  }

  /* ── WordToken：累計勝分（lifetime，只增不減）兌代幣（遊戲內記帳，非真金錢） ── */
  function tokenInfo() {
    const rating = (window.VDPets && typeof VDPets.lifetime === 'function')
      ? VDPets.lifetime()
      : ((window.VDPets && VDPets.rating) || 0);
    const avail = Math.floor(Math.max(0, rating - g.redeemedRating) / TOKEN_RATING);
    return { tokens: g.tokens, rating, avail, per: TOKEN_RATING };
  }
  function redeemTokens() {
    const t = tokenInfo();
    if (!t.avail) return { ok: false, msg: `再拿 ${TOKEN_RATING - Math.max(0, t.rating - g.redeemedRating) % TOKEN_RATING} 競技積分兌 1 枚` };
    g.tokens += t.avail;
    g.redeemedRating += t.avail * TOKEN_RATING;
    save();
    return { ok: true, n: t.avail };
  }
  /* P1-3／P2-4 代幣退化成資源的洩壓閥收窄：匯率 20→10、每日上限 3 次。
     代幣主要價值改鎖進「時間（加速）＋炫耀（世界奇觀）」而非可無限刷的資源。 */
  function tokenResInfo() {
    if (!g.tokenResDay || g.tokenResDay.date !== today()) { g.tokenResDay = { date: today(), count: 0 }; save(); }
    return { todayLeft: Math.max(0, TOKEN_RES_PER_DAY - g.tokenResDay.count), amt: TOKEN_RES_AMT };
  }
  function tokenToRes(r) {
    if (!RES.includes(r)) return { ok: false, msg: '沒有這種資源' };
    if (g.tokens < 1) return { ok: false, msg: '代幣不足' };
    if (tokenResInfo().todayLeft <= 0) return { ok: false, msg: `代幣換資源每日上限 ${TOKEN_RES_PER_DAY} 次——代幣留著加速或蓋世界奇觀更值` };
    g.tokens -= 1;
    g.tokenResDay.count++;
    gainRes({ [r]: TOKEN_RES_AMT });
    save();
    return { ok: true };
  }
  /* ── P1-5 endgame：世界奇觀（後期資源＋代幣的唯一大出口）＋精熟長尾聲望★ ── */
  function wonderInfo() { return { level: g.wonder || 0, cost: WONDER_COST, unlocked: thLevel() >= MAX_LV }; }
  function donateWonder() {
    if (thLevel() < MAX_LV) return { ok: false, msg: `市政廳滿級（Lv${MAX_LV}）後才能興建世界奇觀` };
    if ((g.tokens || 0) < WONDER_COST.tokens) return { ok: false, msg: `需要 ${WONDER_COST.tokens} 枚代幣` };
    for (const r in WONDER_COST) if (r !== 'tokens' && (g.res[r] || 0) < WONDER_COST[r]) return { ok: false, msg: RES_META[r].name + ' 不足' };
    g.tokens -= WONDER_COST.tokens;
    for (const r in WONDER_COST) if (r !== 'tokens') g.res[r] -= WONDER_COST[r];
    g.wonder = (g.wonder || 0) + 1;
    logEvt(`🏯 世界奇觀 +1（第 ${g.wonder} 層）`);
    save();
    return { ok: true, level: g.wonder };
  }
  /* 聲望★＝精熟超過 700 的長尾（每 50 字一顆）＋世界奇觀層；純榮譽、不灌資源／戰力 */
  function prestige() {
    const extra = Math.max(0, mastered() - PRESTIGE_BASE);
    return Math.floor(extra / PRESTIGE_STEP) + (g.wonder || 0);
  }
  /* ── P2-7 鐵匠鋪爐火：城內 ore 單向煉入詞靈（純榮譽計數，不回饋 battleLoot，防 farm 迴圈） ── */
  const SMELT_ORE = 20, SMELT_PER_DAY = 2;
  function smeltInfo() {
    if (!g.smeltDay || g.smeltDay.date !== today()) { g.smeltDay = { date: today(), count: 0 }; save(); }
    return { todayLeft: Math.max(0, SMELT_PER_DAY - g.smeltDay.count), cost: SMELT_ORE, ember: g.forgeEmber || 0, hasSmithy: !!countOf('smithy') };
  }
  function smeltOre() {
    if (!countOf('smithy')) return { ok: false, msg: '先蓋鐵匠鋪' };
    if (smeltInfo().todayLeft <= 0) return { ok: false, msg: `爐火每日上限 ${SMELT_PER_DAY} 次，明天再來` };
    if ((g.res.ore || 0) < SMELT_ORE) return { ok: false, msg: `礦石不足，需要 ${SMELT_ORE}` };
    g.res.ore -= SMELT_ORE;
    g.smeltDay.count++;
    g.forgeEmber = (g.forgeEmber || 0) + 1;
    logEvt(`⚒️ 鐵匠鋪爐火 +1（詞靈鍛造之魂 ×${g.forgeEmber}）`);
    save();
    return { ok: true, ember: g.forgeEmber };
  }
  // P2-7 收尾：詞靈鍛造之魂 → 抵免詞靈鍛造材料（供 VDPets.forge() 呼叫）
  function spendEmber(n) {
    const have = g.forgeEmber || 0;
    const use = Math.max(0, Math.min(n, have));
    if (use > 0) { g.forgeEmber = have - use; save(); }
    return use;
  }

  /* 世界觀彩蛋：從已擊敗的文豪語錄庫借一句，當委託人的靈感來源（純文字，不影響委託本身邏輯） */
  function pickLoreQuote() {
    try {
      if (!window.VDBattle || !VDBattle.QUOTES || !window.VDGame || !VDGame.isBeaten) return '';
      const beaten = VDBattle.OPPONENTS.filter(o => VDGame.isBeaten(o.id));
      if (!beaten.length) return '';
      const o = beaten[Math.floor(Math.random() * beaten.length)];
      const qd = VDBattle.QUOTES[o.id];
      return qd ? `${o.name}：「${qd.q}」` : '';
    } catch { return ''; }
  }

  /* ── 英文委託（每日一單，居民隨機發） ── */
  function questInfo() {
    if (g.questDate !== today()) {
      g.questDate = today();
      if (g.pop.length) {
        /* P3-6 只派「拿得到的資源」委託：手上已有 or 有工人在產 的資源，避免新手一開局就撞不可能的 ore 委託 */
        const producing = new Set(g.pop.map(p => { const d = data.jobs[p.job]; return d && Object.keys(d.out || {})[0]; }).filter(Boolean));
        const elig = data.questTemplates.filter(t => (g.res[t.res] || 0) > 0 || producing.has(t.res));
        const pool = elig.length ? elig : data.questTemplates.filter(t => t.res === 'wood' || t.res === 'stone');
        const t = pool[Math.floor(Math.random() * pool.length)];
        const n = t.n[0] + Math.floor(Math.random() * (t.n[1] - t.n[0] + 1));
        const giver = g.pop[Math.floor(Math.random() * g.pop.length)];
        g.quest = { text: t.text.replace('{n}', n), res: t.res, n, rewardTokens: t.rewardTokens, giver: giver.name, done: false, loreQuote: pickLoreQuote(), word: RES_EN[t.res] };
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
    // P2-3 委託英文字進閃卡：把「搬資源」升級成「認得這個字」的學習輸入
    try { if (q.word && window.VDStore && typeof VDStore.enroll === 'function') VDStore.enroll(q.word); } catch { /* enroll 不可用不阻斷 */ }
    logEvt(`✅ 完成 ${q.giver} 的委託`);
    save();
    return { ok: true, tokens: q.rewardTokens, enrolled: q.word };
  }

  /* ── NPC 台詞：依職業出英文句＋目標單字 ──
     P3-4：目標字優先挑「學生自己該複習的字」（快精熟的字），讓 NPC 變成會走動的複習提醒；沒有就退回職業字池 */
  function npcLine(p) {
    const kind = p.job && data.npcLines[p.job] ? p.job : 'villager';
    const lines = data.npcLines[kind];
    let w = '';
    const near = nearMastered();
    if (near.length) w = near[Math.floor(Math.random() * Math.min(near.length, 20))];
    if (!w) { const words = data.npcWords[kind]; w = words[Math.floor(Math.random() * words.length)]; }
    return { text: lines[Math.floor(Math.random() * lines.length)].replace('{w}', `<b class="npc-w" data-w="${w}">${w}</b>`), word: w };
  }
  /* ── P2-6 今天的一件事：前端算出「此刻最高價值的單一動作」，給首頁大卡 CTA 用 ── */
  function nextBestAction() {
    if (g.harvest.date !== today() && Object.values(dailyOutput()).some(v => v))
      return { text: '今天的收成還沒領', cta: '去收成', act: 'harvest' };
    const th = g.grid['3,3'];
    if (th) {
      const req = data.thUpgrade[th.lv + 1];
      if (req) {
        const gap = req.mastered - mastered();
        if (gap > 0) return { text: `再精熟 ${gap} 個字，市政廳就能升 Lv${th.lv + 1}`, cta: '去練快精熟的字', act: 'practice' };
      }
    }
    const pk = packInfo();
    if (pk.avail > 0) return { text: `有 ${pk.avail} 包學習補給可領`, cta: '去領補給', act: 'packs' };
    if (nearMastered().length) return { text: '把快精熟的字補到精熟，城才長得高', cta: '去練', act: 'practice' };
    return { text: '答對 5 題就能換 1 包補給', cta: '去答題', act: 'practice' };
  }

  /* ── 雲端綁定（同步碼／唯讀參觀碼） ── */
  function setVisitCode(v) { g.visitCode = String(v || ''); save(); }
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
    cells, countOf, thLevel, resCap, popCap, profCount, idle, mastered, nearMastered,
    newMasteredToday, learnMult,
    canBuild, buildCost, build, demolish, move, upgradeReq, upgrade, tickUpgrades, rushUpgrade, rushDayInfo, quizRush, rushInfo,
    setName, setVisitCode,
    moveinInfo, tryMovein, assignJob, train,
    dailyOutput, harvestReady, harvest, streakInfo, nextBestAction,
    packInfo, claimPacks, coinPackInfo, coinToRes, battleLoot, lootDayInfo,
    tokenInfo, redeemTokens, tokenToRes, tokenResInfo,
    prestige, wonderInfo, donateWonder, smeltInfo, smeltOre, spendEmber,
    questInfo, fulfillQuest, npcLine,
    exportState, importState,
    buildings: () => data.buildings, jobs: () => data.jobs,
    trainWords: (job) => (data.trainWords[job] || []).slice()
  };
})();
window.VDTown = VDTown;
