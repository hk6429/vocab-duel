/* 遊戲化引擎 VDGame：八角驅動力一次補滿
   CD1 使命/稱號階梯　CD2 XP等級/徽章　CD3 自訂英雄/選擇　CD4 字幣/收集/檔案
   CD5 分享戰績/挑戰碼/本機榜　CD6 每日任務/神秘字/解鎖/限時　CD7 寶箱隨機獎　CD8 護盾/斷線警告/衝刺倒數 */
const VDGame = (() => {
  const KEY = 'vd_game';
  const TITLES = ['字鬥學徒', '見習字使', '字鬥劍客', '字鬥遊俠', '字鬥豪傑', '字鬥宗師', '字鬥聖手', '字鬥賢者', '字鬥仙師', '字鬥神帝',
    '字鬥真君', '字鬥天尊', '字鬥劍仙', '字鬥文曲', '字鬥星主', '字鬥道尊', '字鬥聖尊', '字鬥帝尊', '字鬥天帝', '字鬥造化'];
  const AVATARS = ['🦸', '🥷', '🧙', '🦉', '🐉', '🦊', '🐯', '🦅', '🐺', '🦁', '👑', '⚔️'];
  const TIER_LV = { 入門: 1, 進階: 2, 高手: 4, 宗師: 6 };
  const SHIELD_COST = 100;

  const DEFAULT = () => ({
    xp: 0, coins: 0, nick: '', avatar: '🦸',
    badges: {}, quests: { date: '', prog: { correct: 0, battle: 0, flash: 0, listen: 0 }, claimed: [] },
    mystery: { date: '', opened: false }, shield: 0, unlocked: [],
    best: { sprint: 0, battleWins: 0 }, seenIntro: false, seed: 7,
    ss: { correct: 0, spell: 0, exam: 0, battleWon: 0, maxCombo: 0, listen: 0 },
    shop: { owned: [], frame: '' }, revive: 0,
    rank: { pts: 0, peak: 0 },
    week: { key: '', prog: 0, claimed: false }
  });

  let g = DEFAULT();

  function load() {
    try { g = Object.assign(DEFAULT(), JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch { g = DEFAULT(); }
    // 巢狀欄位補齊
    g.quests = Object.assign({ date: '', prog: { correct: 0, battle: 0, flash: 0, listen: 0 }, claimed: [] }, g.quests);
    g.quests.prog = Object.assign({ correct: 0, battle: 0, flash: 0, listen: 0 }, g.quests.prog);
    g.ss = Object.assign({ correct: 0, spell: 0, exam: 0, battleWon: 0, maxCombo: 0, listen: 0 }, g.ss);
    g.shop = Object.assign({ owned: [], frame: '' }, g.shop);
    g.rank = Object.assign({ pts: 0, peak: 0 }, g.rank);
    g.week = Object.assign({ key: '', prog: 0, claimed: false }, g.week);
    if (typeof g.revive !== 'number') g.revive = 0;
    rollDaily();
  }
  const save = () => localStorage.setItem(KEY, JSON.stringify(g));

  /* ── 等級 ── */
  const xpForLevel = L => 50 * L * (L - 1);
  function level() { let L = 1; while (g.xp >= xpForLevel(L + 1)) L++; return L; }
  const title = () => TITLES[Math.min(level() - 1, TITLES.length - 1)];
  function levelProgress() {
    const L = level(), base = xpForLevel(L), need = xpForLevel(L + 1) - base;
    return { L, title: title(), inLv: g.xp - base, need, pct: Math.round((g.xp - base) / need * 100) };
  }
  /* 距離某目標等級的總體進度（供鎖定卡進度條用）：已達標回 100 */
  function progressToLevel(target) {
    if (level() >= target) return 100;
    return Math.max(0, Math.min(100, Math.round(g.xp / xpForLevel(target) * 100)));
  }

  /* ── 每日重置 ── */
  function rollDaily() {
    const t = VDStore.today();
    if (g.quests.date !== t) {
      g.quests = { date: t, prog: { correct: 0, battle: 0, flash: 0, listen: 0 }, claimed: [] };
    }
    if (g.mystery.date !== t) g.mystery = { date: t, opened: false };
    rollWeekly();
  }

  /* ── 每週任務（週一起算）：目標池依週序輪選 → 傳說寶箱 ── */
  const WEEK_GOALS = [
    { key: 'correct',   label: '本週答對 100 題', n: 100 },
    { key: 'spell',     label: '本週拼寫答對 30 題', n: 30 },
    { key: 'newwords',  label: '本週點亮 40 個新字', n: 40 },
    { key: 'champion',  label: '本週擊敗擂主 3 次', n: 3 },
    { key: 'days',      label: '本週連續練習 7 天', n: 7 },
    { key: 'battlewin', label: '本週對戰勝利 10 場', n: 10 },
    { key: 'review',    label: '本週複習閃卡 60 張', n: 60 },
    { key: 'sprint',    label: '本週限時衝刺破紀錄 1 次', n: 1 }
  ];
  const CHAMPIONS = ['andersen', 'aesop', 'twain', 'austen', 'hemingway', 'dickens', 'shakespeare', 'tolstoy'];
  /* 限時主題週：沿用 weekIdxNum() 的 hash-mod 輪替手法，全端一致、免後端狀態 */
  const THEMES = [
    { key: 'mystery', label: '🎁 雙倍神秘字週', desc: '今日神秘字開出雙倍字幣與 XP' },
    { key: 'chest', label: '💰 任務豐收週', desc: '每日任務開箱獎勵 +50%' },
    { key: 'combo', label: '💥 連擊祭典週', desc: '連擊 ×3 起就有大場面特效' },
    { key: 'listen', label: '🎧 聽力雙倍週', desc: '聽力任務獎勵 +50%' }
  ];
  const weekTheme = () => THEMES[weekIdxNum() % THEMES.length];
  function weekKey() {
    const d = new Date(VDStore.today() + 'T00:00:00');
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // 回推到本週一
    return d.toLocaleDateString('sv-SE');
  }
  function weekIdxNum() {
    let h = 0;
    for (const c of weekKey()) h = (h * 31 + c.charCodeAt(0)) % 1000000007;
    return h;
  }
  const weekGoal = () => WEEK_GOALS[weekIdxNum() % WEEK_GOALS.length];
  function weekInfo() {
    const wi = weekIdxNum(), gl = weekGoal();
    return { weekIdx: wi, championId: CHAMPIONS[wi % CHAMPIONS.length], affixIdx: wi, goal: { key: gl.key, label: gl.label, n: gl.n }, theme: weekTheme() };
  }
  function rollWeekly() {
    const k = weekKey(), gl = weekGoal();
    if (g.week.key !== k) g.week = { key: k, prog: 0, claimed: false, gk: gl.key };
    else if (g.week.gk !== gl.key) { g.week.gk = gl.key; g.week.prog = 0; delete g.week.base; } // 舊存檔沒 gk：換制歸零重計
  }
  /* 週目標進度累計：各事件對號入座（champion 需打中本週擂主） */
  function weekTick(ev, oppId) {
    rollWeekly();
    const gk = g.week.gk;
    if ((gk === 'correct' && ev === 'correct')
      || (gk === 'spell' && ev === 'spell')
      || (gk === 'battlewin' && ev === 'battlewin')
      || (gk === 'champion' && ev === 'battlewin' && oppId === weekInfo().championId)
      || (gk === 'review' && ev === 'flash')
      || (gk === 'sprint' && ev === 'sprint')) g.week.prog++;
  }
  /* 本週活躍天數（days 目標用）：讀 vd_meta.daily 計本週一以來有練的天數 */
  function weekActiveDays() {
    try {
      const daily = (JSON.parse(localStorage.getItem('vd_meta') || '{}').daily) || {};
      const mon = weekKey(), t = VDStore.today();
      return Object.keys(daily).filter(d => d >= mon && d <= t && daily[d] > 0).length;
    } catch { return 0; }
  }
  /* 本週新點亮字數（newwords 目標用）：以週初 seen 數為基準線 */
  function newWordsThisWeek() {
    try {
      const seen = VDStore.stats(VDApp.words()).seen;
      if (typeof g.week.base !== 'number') { g.week.base = seen; save(); }
      return Math.max(0, seen - g.week.base);
    } catch { return g.week.prog; }
  }
  function weekQuest() {
    rollWeekly();
    const gl = weekGoal();
    let cur = g.week.prog;
    if (gl.key === 'days') cur = weekActiveDays();
    else if (gl.key === 'newwords') cur = newWordsThisWeek();
    cur = Math.min(cur, gl.n);
    return { cur, goal: gl.n, label: gl.label, done: cur >= gl.n, claimed: g.week.claimed };
  }
  function claimWeek() {
    const w = weekQuest();
    if (!w.done || w.claimed) return null;
    g.week.claimed = true;
    const chest = openChest(120, 'legendary'); // 週寶箱保底傳說
    save();
    return chest;
  }
  /* 週末寶庫：週任務領取後，本週可在詞靈競技開一次，必掉稀有以上裝備 */
  function weekVaultReady() { rollWeekly(); return !!g.week.claimed && !g.week.vault; }
  function openWeekVault() {
    if (!weekVaultReady()) return false;
    g.week.vault = true; save();
    return true;
  }

  /* ── 核心給獎 ── */
  function award(xp, coins, reason) {
    rollDaily();
    // 每日首勝加倍激勵
    let bonus = '';
    if (!g._firstToday || g._firstToday !== VDStore.today()) {
      g._firstToday = VDStore.today();
      xp += 30; bonus = '（每日首勝 +30）';
    }
    const before = level();
    g.xp += xp; g.coins += coins;
    save();
    const after = level();
    if (after > before) {
      celebrate(after);
      // Lv10 起每次升級送稀有保底箱：高等級升級慢，補上即時甜頭
      if (after >= 10) setTimeout(() => openChest(80, 'rare'), 800);
    }
    else if (xp >= 20 || coins >= 10) toast(`+${xp} XP　+${coins} 字幣 ${reason || ''}${bonus}`);
    return after > before;
  }

  /* ── 答題事件（各模式共用） ── */
  const WRONG_XP_CAP = 30; // 每日前 30 次答錯才有參與分
  const WRONG_MSGS = ['+2 XP，錯的字才是經驗值！', '+2 XP，錯題本已幫你記下這個字！', '+2 XP，再看一眼，下次就是你的分！'];
  function onAnswer(correct, kind, combo) {
    rollDaily();
    restCheck();
    if (!g.seenIntro) g.seenIntro = true; // 答過題 → 解鎖每日任務面板
    if (correct) {
      if (window.VDSound) (combo >= 2 ? VDSound.combo(combo) : VDSound.correct());
      g.ss.correct++;
      g.quests.prog.correct++;
      weekTick('correct');
      if (kind === 'spell') { g.ss.spell++; weekTick('spell'); }
      if (kind === 'exam') g.ss.exam++;
      if (kind === 'listen') g.ss.listen++;
      if (combo && combo > g.ss.maxCombo) g.ss.maxCombo = combo;
      let xp = kind === 'spell' ? 15 : kind === 'listen' ? 13 : kind === 'battle' ? 12 : 10;
      let coins = kind === 'spell' ? 4 : kind === 'listen' ? 3 : 2;
      // 新手祝福漸退：1-10 題 ×3、11-20 ×2、21-30 ×1.5，慢慢放手不斷崖
      if (g.ss.correct <= 10) { xp *= 3; coins *= 3; toast(`🌟 新手祝福 ×3！（第 ${g.ss.correct}/10 題）`); }
      else if (g.ss.correct <= 20) { xp *= 2; coins *= 2; toast(`🌟 新手祝福 ×2！（第 ${g.ss.correct}/20 題）`); }
      else if (g.ss.correct <= 30) { xp = Math.round(xp * 1.5); coins = Math.round(coins * 1.5); toast(`🌟 新手祝福 ×1.5！（第 ${g.ss.correct}/30 題）`); }
      award(xp, coins);
      // 連擊大場面：平常 ×5、×10、×15…；連擊祭典週降到 ×3、×6、×9…
      const comboStep = weekTheme().key === 'combo' ? 3 : 5;
      if (combo && combo >= comboStep && combo % comboStep === 0) comboSplash(combo);
    } else {
      if (window.VDSound) VDSound.wrong();
      const wn = (g.quests.wrongXp || 0) + 1;
      g.quests.wrongXp = wn;
      if (wn <= WRONG_XP_CAP) g.xp += 2; // 參與分（每日上限 30 次）
      save();
      // 每 3 次錯才吐一次鼓勵，避免洗版
      if (wn % 3 === 0) {
        toast(wn <= WRONG_XP_CAP ? WRONG_MSGS[Math.floor(wn / 3) % WRONG_MSGS.length]
          : '錯題本記下了，複習就是你的分！');
      }
    }
    checkBadges();
  }
  function onFlash() { rollDaily(); g.quests.prog.flash++; weekTick('flash'); save(); checkBadges(); }
  function onListen() { rollDaily(); g.quests.prog.listen++; save(); checkBadges(); }
  function onFlashDone(wrongReview) {
    const xp10 = window.VDPets && VDPets.hasPerk('xp10');
    // 錯題複習比一般閃卡耗神，基礎獎勵就比照加成，有 wrong2 天賦再疊一次
    const xp = wrongReview ? (xp10 ? 20 : 18) : (xp10 ? 17 : 15);
    const coins = wrongReview ? (window.VDPets && VDPets.hasPerk('wrong2') ? 15 : 10) : 5;
    award(xp, coins, wrongReview ? '錯題複習完成' : '閃卡回合完成');
  }
  function onQuizDone(score) { award(15 + score * 2, 5 + score, '自測完成'); }
  function onBattleStart() { rollDaily(); }
  // 每日對戰任務改在真正結算時計數（開戰就跑不再計數）
  function onBattleFinish() { rollDaily(); g.quests.prog.battle++; save(); checkBadges(); }
  function onBattleWin(oppId, comeback) {
    g.ss.battleWon++;
    weekTick('battlewin', oppId);
    if (!g.unlocked.includes('beat_' + oppId)) g.unlocked.push('beat_' + oppId);
    g.best.battleWins = Math.max(g.best.battleWins, g.ss.battleWon);
    if (comeback && !g.badges.comeback) earn('comeback');
    award(50, 20, '對戰勝利');
    checkBadges();
  }

  /* ── 徽章 ── */
  const BADGES = [
    { id: 'first', ico: '🌱', name: '初次出擊', desc: '答對第一題', chk: s => s.ss.correct >= 1 },
    { id: 'streak3', ico: '🔥', name: '三日不輟', desc: '連續 3 天', chk: () => VDStore.stats([]).streak >= 3 },
    { id: 'streak7', ico: '🔥', name: '七日不輟', desc: '連續 7 天', chk: () => VDStore.stats([]).streak >= 7 },
    { id: 'streak30', ico: '🌟', name: '卅日成習', desc: '連續 30 天', chk: () => VDStore.stats([]).streak >= 30 },
    { id: 'm50', ico: '📗', name: '小有所成', desc: '掌握 50 字', chk: () => masteredAll() >= 50 },
    { id: 'm200', ico: '📘', name: '學富五車', desc: '掌握 200 字', chk: () => masteredAll() >= 200 },
    { id: 'm500', ico: '📚', name: '博聞強記', desc: '掌握 500 字', chk: () => masteredAll() >= 500 },
    { id: 'bfirst', ico: '⚔️', name: '首場告捷', desc: '贏得第一場對戰', chk: s => s.ss.battleWon >= 1 },
    { id: 'ball8', ico: '👑', name: '八關全破', desc: '擊敗全部 8 位文學家', chk: s => 8 === new Set(s.unlocked.filter(u => u.startsWith('beat_'))).size },
    { id: 'combo5', ico: '💥', name: '五連擊', desc: '單場連擊 ×5', chk: s => s.ss.maxCombo >= 5 },
    { id: 'combo10', ico: '⚡', name: '十連爆發', desc: '單場連擊 ×10', chk: s => s.ss.maxCombo >= 10 },
    { id: 'spell10', ico: '✍️', name: '拼字達人', desc: '拼寫答對 10 題', chk: s => s.ss.spell >= 10 },
    { id: 'exam50', ico: '📝', name: '會考老手', desc: '會考答對 50 題', chk: s => s.ss.exam >= 50 },
    { id: 'listen10', ico: '🎧', name: '聽力達人', desc: '聽力答對 10 題', chk: s => s.ss.listen >= 10 },
    { id: 'listen50', ico: '🎧', name: '聽力大師', desc: '聽力答對 50 題', chk: s => s.ss.listen >= 50 },
    { id: 'lv5', ico: '🎖️', name: '登堂入室', desc: '達到 5 級', chk: () => level() >= 5 },
    { id: 'lv10', ico: '🏅', name: '登峰造極', desc: '達到 10 級', chk: () => level() >= 10 },
    { id: 'dailyall', ico: '✅', name: '每日全清', desc: '一天完成三項任務', chk: s => new Set(s.quests.claimed.map(c => String(c).split(':')[0])).size >= 3 },
    { id: 'dailyhard', ico: '🌋', name: '挑戰者之心', desc: '同一天三項任務都完成「難」', chk: s => [0, 1, 2].every(i => s.quests.claimed.includes(`${i}:2`)) },
    { id: 'rich', ico: '💰', name: '字幣富翁', desc: '存到 500 字幣', chk: s => s.coins >= 500 },
    { id: 'comeback', ico: '🩸', name: '背水逆轉', desc: '血量<30 時獲勝', chk: s => !!s.badges.comeback },
    { id: 'dexE', ico: '🖼️', name: '國小圖鑑', desc: '國小 1200 全點亮', chk: () => dexFull('E') },
    { id: 'dexJ', ico: '🖼️', name: '國中圖鑑', desc: '國中 2000 全點亮', chk: () => dexFull('J') },
    { id: 'rank_gold', ico: '🥇', name: '黃金詩人', desc: '段位達黃金', chk: s => s.rank.pts >= 250 },
    { id: 'rank_top', ico: '👑', name: '傳奇字聖', desc: '段位登頂 1000 分', chk: s => s.rank.pts >= 1000 }
  ];
  // 圖鑑滿區：該學段每個字都練過至少一次（box >= 0）
  function dexFull(lv) {
    try {
      const ws = VDApp.words().filter(w => w.level === lv);
      return ws.length > 0 && ws.every(w => VDStore.box(w.word) >= 0);
    } catch { return false; }
  }
  function masteredAll() { try { return VDStore.stats(VDApp.words()).mastered; } catch { return 0; } }
  function earn(id) {
    if (g.badges[id]) return false;
    g.badges[id] = VDStore.today(); save();
    const b = BADGES.find(x => x.id === id);
    if (b) toast(`🏆 解鎖成就「${b.name}」`);
    return true;
  }
  function checkBadges() {
    let any = false;
    for (const b of BADGES) if (!g.badges[b.id]) { try { if (b.chk(g)) { earn(b.id); any = true; } } catch {} }
    return any;
  }

  /* ── 每日任務：彈性習慣三檔（易/中/難）——挑越難、領越多，三檔可疊領 ── */
  const QTIERS = ['易', '中', '難'];
  const hasClaim = (i, t) => g.quests.claimed.includes(`${i}:${t}`) || (t === 0 && g.quests.claimed.includes(i));
  function quests() {
    rollDaily();
    const p = g.quests.prog;
    const mk = (i, ico, name, cur, unit, goals, rewards) => ({
      i, ico, name, unit, cur: Math.min(cur, goals[2]),
      tiers: goals.map((goal, t) => ({
        t, label: QTIERS[t], goal, reward: rewards[t],
        done: cur >= goal, claimed: hasClaim(i, t)
      }))
    });
    return [
      mk(0, '✍️', '每日答題', p.correct, '題', [10, 25, 50], [25, 60, 130]),
      mk(1, '🎭', '每日對戰', p.battle, '場', [1, 3, 6], [20, 50, 110]),
      mk(2, '🃏', '每日閃卡', p.flash, '張', [10, 25, 50], [20, 50, 110]),
      mk(3, '🎧', '每日聽力', p.listen, '題', [5, 15, 30], [25, 60, 130])
    ];
  }
  function claimQuest(i, t) {
    const q = quests().find(x => x.i === i);
    const tier = q && q.tiers[t];
    if (!tier || !tier.done || tier.claimed) return null;
    g.quests.claimed.push(`${i}:${t}`);
    let reward = tier.reward;
    if (weekTheme().key === 'chest') reward = Math.round(reward * 1.5); // 任務豐收週：所有任務開箱基礎值 +50%
    if (weekTheme().key === 'listen' && i === 3) reward = Math.round(reward * 1.5); // 聽力雙倍週：只加成聽力軌
    const chest = openChest(reward);
    // 全清 = 三軌各領過至少一檔（一天只發一次）
    const tracks = new Set(g.quests.claimed.map(c => String(c).split(':')[0]));
    if (tracks.size >= 3 && !g.quests.allBonus) {
      g.quests.allBonus = true;
      g.coins += 50; g.xp += 50;
      toast('🎁 三任務全清！額外 +50 XP +50 字幣');
    }
    checkBadges(); save();
    return chest;
  }

  /* ── 寶箱：稀有度隨機獎（CD7）——傳說5%/稀有25%/普通70%，開箱動畫；20 箱保底傳說 ── */
  const PITY_MAX = 20;
  function openChest(baseCoins, forceRarity) {
    if (typeof g.pity !== 'number') g.pity = 0; // 舊存檔補欄位
    g.pity++;
    const r = Math.floor(seededRand() * 100);
    let rarity = forceRarity || (r < 5 ? 'legendary' : r < 30 ? 'rare' : 'common');
    if (!forceRarity && g.pity >= PITY_MAX) rarity = 'legendary'; // 保底：連 20 箱沒傳說必出
    if (rarity === 'legendary') g.pity = 0;
    const mul = { legendary: 4, rare: 2, common: 1 }[rarity];
    let coins = baseCoins * mul, xp = baseCoins * mul, extra = '';
    if (rarity === 'legendary') { g.shield++; g.revive++; extra = '傳說寶箱！四倍獎勵＋護盾＋復活羽毛'; }
    else if (rarity === 'rare') { if (seededRand() < 0.5) { g.shield++; extra = '稀有寶箱！雙倍獎勵＋護盾'; } else extra = '稀有寶箱！雙倍獎勵'; }
    else extra = '普通寶箱';
    g.coins += coins; g.xp += xp; save();
    chestAnim(rarity, coins, xp, extra, PITY_MAX - g.pity);
    return { coins, xp, extra, rarity };
  }
  /* 開箱動畫：全螢幕水彩寶箱卡，稀有度分色 */
  function chestAnim(rarity, coins, xp, extra, pityLeft) {
    const ICO = { legendary: '👑', rare: '💎', common: '🎁' };
    const NAME = { legendary: '傳說', rare: '稀有', common: '普通' };
    if (window.VDSound) VDSound.coin();
    const ov = document.createElement('div'); ov.className = `vg-chest ${rarity}`;
    ov.innerHTML = `<div class="vg-chest-card">
      <div class="vg-chest-ico">${ICO[rarity]}</div>
      <div class="vg-chest-r">${NAME[rarity]}寶箱</div>
      <div class="vg-chest-loot">+${coins} 字幣　+${xp} XP</div>
      <div class="vg-chest-extra">${extra}</div>
      <div class="vg-lu-sub">機率：傳說 5%・稀有 25%・普通 70%</div>
      ${rarity === 'legendary' ? '<div class="vg-lu-sub">✨ 保底已重新計數</div>'
        : typeof pityLeft === 'number' ? `<div class="vg-lu-sub">距傳說保底還差 ${pityLeft} 箱</div>` : ''}
      <div class="vg-lu-sub">點一下繼續</div></div>`;
    ov.onclick = () => ov.remove();
    document.body.appendChild(ov);
    setTimeout(() => { if (ov.parentNode) ov.remove(); }, 3200);
  }

  /* ── 連擊大場面：全螢幕墨潑 ── */
  function comboSplash(n) {
    const ov = document.createElement('div'); ov.className = 'vg-combosplash';
    ov.innerHTML = `<div class="vg-cs-ink"></div><div class="vg-cs-text">連擊 ×${n}</div>`;
    document.body.appendChild(ov);
    setTimeout(() => ov.remove(), 1400);
  }
  // 每次呼叫變化的偽隨機（Date 不可用，改用累積 xp 擾動）；seed 存進存檔，重整不重置（杜絕開箱釣魚）
  function seededRand() {
    if (typeof g.seed !== 'number') g.seed = 7;
    g.seed = (g.seed * 9301 + 49297 + g.xp) % 233280;
    save();
    return g.seed / 233280;
  }

  /* ── 每日神秘字（CD6+CD7） ── */
  function mysteryWord() {
    rollDaily();
    const words = VDApp.scopeWords ? VDApp.scopeWords() : [];
    if (!words.length) return null;
    // 依日期字串雜湊挑一字，全日固定
    const t = VDStore.today(); let h = 0;
    for (const c of t) h = (h * 31 + c.charCodeAt(0)) % 1000000007;
    return words[h % words.length];
  }
  function openMystery() {
    rollDaily();
    if (g.mystery.opened) return null;
    g.mystery.opened = true;
    const base = weekTheme().key === 'mystery' ? 50 : 25; // 雙倍神秘字週：基礎值加倍
    const chest = openChest(base);
    save();
    return chest;
  }

  /* ── 護盾（CD8） ── */
  function buyShield() {
    if (g.coins < SHIELD_COST) return false;
    g.coins -= SHIELD_COST; g.shield++; save();
    toast('🛡️ 購得連續護盾一枚');
    return true;
  }

  /* ── 字幣商店：頭像框（永久）＋消耗品，給字幣一個出口。價格跟著裝備鍛造的難度一起漲，種類也加多，別讓人太快集滿 ── */
  const SHOP = [
    { id: 'frame_ink', kind: 'frame', ico: '⭕', name: '墨圈框', desc: '手繪墨線頭像框', price: 380 },
    { id: 'frame_gold', kind: 'frame', ico: '🟡', name: '金箔框', desc: '燙金雙環頭像框', price: 900 },
    { id: 'frame_laurel', kind: 'frame', ico: '🏛️', name: '桂冠框', desc: '文豪桂冠頭像框', price: 1600 },
    { id: 'frame_jade', kind: 'frame', ico: '🟢', name: '玉環框', desc: '溫潤翠玉雙環頭像框', price: 2600 },
    { id: 'frame_phoenix', kind: 'frame', ico: '🔥', name: '鳳羽框', desc: '烈焰鳳羽頭像框，字鬥高手的象徵', price: 4200 },
    { id: 'frame_cosmos', kind: 'frame', ico: '🌌', name: '星雲框', desc: '流轉星雲頭像框，至尊等級的門面', price: 6800 },
    { id: 'shield', kind: 'consume', ico: '🛡️', name: '連續護盾', desc: '斷練一天自動頂上，🔥 不歸零', price: 180 },
    { id: 'revive', kind: 'consume', ico: '🪶', name: '復活羽毛', desc: '對戰倒下時原地復活（回 40 血）', price: 220 }
  ];
  function buy(id) {
    const it = SHOP.find(x => x.id === id);
    if (!it) return { ok: false, msg: '沒有這件商品' };
    if (it.kind === 'frame' && g.shop.owned.includes(id)) return { ok: false, msg: '已擁有' };
    if (g.coins < it.price) return { ok: false, msg: `字幣不足，還差 ${it.price - g.coins} 枚` };
    g.coins -= it.price;
    if (it.kind === 'frame') { g.shop.owned.push(id); g.shop.frame = id; }
    else if (id === 'shield') g.shield++;
    else if (id === 'revive') g.revive++;
    save();
    if (window.VDSound) VDSound.coin();
    toast(`${it.ico} 購得「${it.name}」！`);
    return { ok: true };
  }
  function setFrame(id) { if (!id || g.shop.owned.includes(id)) { g.shop.frame = id || ''; save(); } }

  /* ── 對戰段位天梯：勝 +20、敗 -10（地板 0），段位是玩家的社交身份 ── */
  const RANKS = [
    { name: '青銅文士', ico: '🥉', at: 0 }, { name: '白銀墨客', ico: '🥈', at: 100 },
    { name: '黃金詩人', ico: '🥇', at: 250 }, { name: '鉑金大家', ico: '🎖️', at: 450 },
    { name: '鑽石文豪', ico: '💠', at: 700 }, { name: '傳奇字聖', ico: '👑', at: 1000 }
  ];
  function rankInfo() {
    const p = g.rank.pts;
    let i = 0; while (i + 1 < RANKS.length && p >= RANKS[i + 1].at) i++;
    const cur = RANKS[i], next = RANKS[i + 1] || null;
    return { ...cur, pts: p, peak: g.rank.peak, next, pct: next ? Math.round((p - cur.at) / (next.at - cur.at) * 100) : 100 };
  }
  function rankWin() {
    const before = rankInfo().name;
    g.rank.pts += 20; g.rank.peak = Math.max(g.rank.peak, g.rank.pts); save();
    const after = rankInfo();
    if (after.name !== before) { toast(`🏆 晉升「${after.ico} ${after.name}」！`); if (window.VDSound) VDSound.levelup(); }
    return { delta: +20, ...after };
  }
  function rankLose() {
    const wk = weekKey();
    if (g.rank.shieldWk !== wk) {   // 每週首敗保護：不扣分，輸一場不怕上不了線
      g.rank.shieldWk = wk; save();
      toast('🛡️ 本週首敗保護——段位分不扣！');
      return { delta: 0, shield: true, ...rankInfo() };
    }
    g.rank.pts = Math.max(0, g.rank.pts - 10); save();
    return { delta: -10, ...rankInfo() };
  }

  /* ── 復活羽毛（對戰用） ── */
  function useRevive() {
    if (g.revive <= 0) return false;
    g.revive--; save();
    toast('🪶 復活羽毛燃起——原地復活！');
    return true;
  }

  /* ── 下一個里程碑：peak-end 鉤子，結算畫面永遠留一個「就差一點」 ── */
  function nextMilestone() {
    const cands = [];
    const lp = levelProgress();
    cands.push({ dist: (lp.need - lp.inLv) / lp.need, ico: '⬆️', text: `再 ${lp.need - lp.inLv} XP 升上 Lv${lp.L + 1}`, pct: lp.pct });
    for (const q of quests()) {
      const ready = q.tiers.find(t => t.done && !t.claimed);
      const next = q.tiers.find(t => !t.done && !t.claimed);
      if (ready) cands.push({ dist: 0.01, ico: '🎁', text: `「${q.name}・${ready.label}」達標了，回主選單領寶箱！`, pct: 100 });
      else if (next) cands.push({ dist: (next.goal - q.cur) / next.goal, ico: q.ico, text: `「${q.name}・${next.label}」還差 ${next.goal - q.cur} ${q.unit}`, pct: Math.round(q.cur / next.goal * 100) });
    }
    const w = weekQuest();
    if (!w.claimed) {
      if (w.done) cands.push({ dist: 0.02, ico: '👑', text: '週任務達標！回主選單開傳說寶箱', pct: 100 });
      else if (w.cur / w.goal > 0.5) cands.push({ dist: (w.goal - w.cur) / w.goal, ico: '📅', text: `週任務還差 ${w.goal - w.cur} 題就開傳說寶箱`, pct: Math.round(w.cur / w.goal * 100) });
    }
    for (const [tier, lv] of Object.entries(TIER_LV)) {
      if (level() < lv && lv - level() === 1) {
        const need = xpForLevel(lv) - g.xp;
        cands.push({ dist: 0.5 + need / 1000, ico: '🎭', text: `再升 1 級解鎖「${tier}」文學家`, pct: lp.pct });
        break;
      }
    }
    const m = masteredAll();
    for (const goal of [50, 200, 500, 1000]) {
      if (m < goal) {
        if ((goal - m) / goal < 0.2) cands.push({ dist: (goal - m) / goal, ico: '📚', text: `再掌握 ${goal - m} 字達成「${goal} 字」成就`, pct: Math.round(m / goal * 100) });
        break;
      }
    }
    cands.sort((a, b) => a.dist - b.dist);
    return cands[0] || null;
  }
  function milestoneHtml() {
    const ms = nextMilestone();
    if (!ms) return '';
    return `<div class="vg-milestone">
      <span class="vg-ms-ico">${ms.ico}</span>
      <span class="vg-ms-body"><span class="vg-ms-text">${ms.text}</span>
        <span class="vg-q-bar"><span style="width:${ms.pct}%"></span></span></span>
    </div>`;
  }

  /* ── 解鎖式對手（CD6） ── */
  const tierUnlocked = tier => level() >= (TIER_LV[tier] || 1);
  const tierNeed = tier => TIER_LV[tier] || 1;

  /* ── 自訂英雄檔案（CD3/CD4） ── */
  /* 暱稱粗篩：擋掉常見髒話／羞辱字眼，班級榜／挑戰書全班可見，不能只靠自律（教育圈審查點名） */
const NICK_BLOCK = /笨蛋|白癡|白痴|智障|廢物|去死|王八蛋|三小|幹你|靠北|媽的|滾蛋|垃圾|腦殘|廢咖|死gay|fuck|shit|bitch|asshole|idiot|stupid|retard/i;
function setNick(v) {
  let s = (v || '').slice(0, 12);
  if (NICK_BLOCK.test(s)) s = s.replace(NICK_BLOCK, m => '＊'.repeat(m.length));
  g.nick = s;
  save();
}
  function setAvatar(a) { g.avatar = a; save(); }
  const heroName = () => g.nick || '無名字鬥者';

  /* ── 分享/挑戰（CD5，純前端） ── */
  function bragText() {
    const lp = levelProgress(), rk = rankInfo();
    return `【字鬥英雄】${g.avatar} ${heroName()}\n`
      + `稱號：Lv${lp.L} ${lp.title}｜段位：${rk.ico} ${rk.name}（${rk.pts} 分）｜掌握 ${masteredAll()} 字\n`
      + `對戰勝場 ${g.best.battleWins}｜限時最佳 ${g.best.sprint} 分｜連續 ${VDStore.stats([]).streak} 天\n`
      + `徽章 ${Object.keys(g.badges).length}/${BADGES.length}　你也來字鬥吧！`;
  }
  function challengeCode() {
    try { return btoa(unescape(encodeURIComponent(JSON.stringify({ n: heroName(), s: g.best.sprint })))); }
    catch { return ''; }
  }
  function decodeChallenge(code) {
    try {
      const d = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      if (!d || typeof d !== 'object') return null;
      return { n: String(d.n || '').slice(0, 12), s: +d.s || 0 }; // 對手名夾限 12 字，防灌 HTML
    } catch { return null; }
  }

  /* ── 限時衝刺最佳 ── */
  function setSprintBest(n) { if (n > g.best.sprint) { g.best.sprint = n; weekTick('sprint'); save(); return true; } return false; }

  /* ── HTML 轉義（城鎮/市場等模組共用） ── */
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* ── 使用時間提醒：每日累計答題時間持久化（跨重整不歸零），每滿 30 分鐘吐一次提示，不設每日次數上限（原本超過 2 次就完全不再提醒，等於形同虛設） ── */
  let _lastAct = Date.now();
  function restCheck() {
    const t = VDStore.today();
    if (!g.rest || g.rest.day !== t) g.rest = { day: t, mins: 0, shown: 0 }; // 舊存檔沒 rest 欄位：容錯補上
    const now = Date.now();
    const gap = (now - _lastAct) / 60000;
    _lastAct = now;
    if (gap > 0) g.rest.mins += Math.min(gap, 5); // 掛機發呆超過 5 分鐘不計入
    if (g.rest.mins < 30 * (g.rest.shown + 1)) return;
    g.rest.shown++;
    save();
    const mins = Math.round(g.rest.mins);
    const ov = document.createElement('div'); ov.className = 'vg-levelup';
    ov.innerHTML = `<div class="vg-lu-card"><div class="vg-lu-ico">🍵</div>
      <div class="vg-lu-t">今天累計練了 ${mins} 分鐘囉</div><div class="vg-lu-title">起來喝口水休息一下 🍵</div>
      <div class="vg-lu-sub" id="vg-rest-sub">休息一下……（5 秒後可關閉）</div></div>`;
    let closable = false;
    setTimeout(() => {
      closable = true;
      const sub = ov.querySelector('#vg-rest-sub');
      if (sub) sub.textContent = '點一下繼續';
    }, 5000);
    ov.onclick = () => { if (closable) ov.remove(); };
    document.body.appendChild(ov);
  }

  /* ── 提示 UI ── */
  function toast(html) {
    let box = document.getElementById('vg-toasts');
    if (!box) { box = document.createElement('div'); box.id = 'vg-toasts'; document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'vg-toast'; t.innerHTML = html;
    box.appendChild(t);
    setTimeout(() => t.classList.add('show'), 20);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 2600);
  }
  function celebrate(L) {
    if (window.VDSound) VDSound.levelup();
    const ov = document.createElement('div'); ov.className = 'vg-levelup';
    ov.innerHTML = `<div class="vg-lu-card"><div class="vg-lu-ico">🎉</div>
      <div class="vg-lu-t">升級！Lv ${L}</div><div class="vg-lu-title">${TITLES[Math.min(L - 1, TITLES.length - 1)]}</div>
      <div class="vg-lu-sub">點一下繼續</div></div>`;
    ov.onclick = () => ov.remove();
    document.body.appendChild(ov);
    setTimeout(() => { if (ov.parentNode) ov.remove(); }, 4000);
  }

  /* 頭像：預設 🦸 用水彩學生頭像圖；自選 emoji 化身走墨圈紙底 */
  function avHtml(cls) {
    const fr = g.shop.frame ? ` fr-${g.shop.frame}` : '';
    if (g.avatar === '🦸') {
      return `<img loading="lazy" decoding="async" class="vg-av-img ${cls || ''}${fr}" src="img/ui/h_avatar.webp" alt=""
        onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'🦸',className:'vg-av ${cls || ''}${fr}'}))">`;
    }
    return `<span class="vg-av paper ${cls || ''}${fr}">${g.avatar}</span>`;
  }

  /* ── 首頁英雄橫幅 ── */
  function heroStrip() {
    const lp = levelProgress();
    // 出戰詞靈小頭像（直接讀存檔，不等 VDPets init）
    let petAv = '';
    try {
      const pg = JSON.parse(localStorage.getItem('vd_pets') || '{}');
      if (pg.active && pg.owned && pg.owned[pg.active]) {
        const lv = pg.owned[pg.active].lv || 1;
        const st = lv >= 25 ? 3 : lv >= 10 ? 2 : 1;
        petAv = `<img loading="lazy" decoding="async" class="vg-petav" src="img/pets/${pg.active}_s${st}.webp" alt="" onerror="this.remove()">`;
      }
    } catch { /* 無詞靈 */ }
    return `<button class="vg-strip" onclick="VDApp.go('hero')">
      ${avHtml()}${petAv}
      <span class="vg-info">
        <span class="vg-line1">${heroName()}　<b>Lv${lp.L} ${lp.title}</b></span>
        <span class="vg-xpbar"><span style="width:${lp.pct}%"></span></span>
        <span class="vg-line2">${lp.inLv}/${lp.need} XP</span>
      </span>
      <span class="vg-coins">🪙 ${g.coins}</span>
    </button>`;
  }

  /* ── 首頁每日面板 ── */
  function dailyPanel() {
    // 新手首次進站：先摺疊，答過題後才展開（避免第一眼被任務牆嚇到）
    if (!g.seenIntro) {
      return `<div class="vg-daily wc-card"><div class="vg-daily-head">完成第一輪練習後解鎖每日任務 🎁</div></div>`;
    }
    const qs = quests();
    const mw = mysteryWord();
    const allClaimed = qs.every(q => q.tiers.some(t => t.claimed));
    const cal = VDStore.dailyCalendar(7);
    const streak = VDStore.stats([]).streak;
    const W = ['日', '一', '二', '三', '四', '五', '六'];
    const calHtml = cal.map(c => {
      const wd = W[new Date(c.d + 'T00:00:00').getDay()];
      const isToday = c.d === VDStore.today();
      return `<span class="vg-cal-day ${c.active ? 'on' : ''} ${isToday ? 'today' : ''}"><i>${wd}</i>${c.active ? '🔥' : '·'}</span>`;
    }).join('');
    shieldNotice(); // 護盾若剛頂過一天，進首頁就告訴玩家
    // 今日功課完成 = 三軌都達「易」檔：頂部收尾儀式卡，家長一眼看到「夠了，可以休息」
    const easyDone = qs.length > 0 && qs.every(q => q.tiers[0].done);
    // FOMO：連續 2 天以上且今天還沒練 → 首屏警示，別讓火斷在今天（達標日不催）
    const st = VDStore.stats([]);
    const fomo = (!easyDone && streak >= 2 && st.todayCount === 0)
      ? `<div class="vg-fomo">🔥 連續 <b>${streak}</b> 天——今天還沒練，別斷在這裡！</div>` : '';
    const doneCard = easyDone
      ? `<div class="vg-fomo" style="background:#e8f5e9;border-color:#66bb6a">✅ 今天的功課完成了，明天見！</div>` : '';
    const th = weekTheme();
    const themeHtml = `<div class="vg-theme">🎉 本週主題：<b>${th.label}</b>　<span class="vg-theme-desc">${th.desc}</span></div>`;
    const wq = weekQuest();
    const weekHtml = `
      ${themeHtml}
      <div class="vg-quest week ${wq.done ? 'done' : ''}">
        <span class="vg-q-ico">👑</span>
        <span class="vg-q-body"><span class="vg-q-name">本週挑戰：${wq.label}（保底傳說寶箱）</span>
          <span class="vg-q-bar"><span style="width:${wq.cur / wq.goal * 100}%"></span></span></span>
        ${wq.claimed ? '<span class="vg-q-claimed">已領</span>'
        : wq.done ? `<button class="vg-q-claim" onclick="VDGame.claimWeekUI()">開箱</button>`
          : `<span class="vg-q-prog">${wq.cur}/${wq.goal}</span>`}
      </div>`;
    // 城鎮待辦聚合：收成／補給包／委託一行看完，點了直達城鎮
    let townHtml = '';
    if (window.VDTown) {
      try {
        const todo = [];
        if (VDTown.harvestReady()) todo.push('🧺 收成');
        const pk = VDTown.packInfo();
        if (pk && pk.avail > 0) todo.push(`📦 補給包×${pk.avail}`);
        const tq = VDTown.questInfo();
        if (tq && !tq.done) todo.push('📜 委託');
        if (todo.length) townHtml = `<div class="vg-quest" style="cursor:pointer" onclick="VDApp.go('town')">
          <span class="vg-q-ico">🏘️</span>
          <span class="vg-q-body"><span class="vg-q-name">城鎮待辦：${todo.join('　')}</span></span>
          <span class="vg-q-prog">前往 ›</span></div>`;
      } catch { /* 城鎮模組異常不擋面板 */ }
    }
    // 達標日里程碑只留明日預告，不再往前催
    const msHtml = easyDone
      ? `<div class="vg-milestone"><span class="vg-ms-ico">🌅</span>
          <span class="vg-ms-body"><span class="vg-ms-text">明天回來：首勝+30・神秘字・城鎮收成・招募×2</span></span></div>`
      : milestoneHtml();
    return `<div class="vg-daily wc-card">
      <img loading="lazy" decoding="async" class="wc-card-img" src="img/ui/h_daily.webp" alt="" onerror="this.remove()">
      ${doneCard}${fomo}
      <div class="vg-cal">
        <div class="vg-cal-strip">${calHtml}</div>
        <div class="vg-cal-note">連續 <b>${streak}</b> 天　明天回來：首勝+30・神秘字・城鎮收成・招募×2</div>
      </div>
      <div class="vg-daily-head">每日任務 <i class="vg-daily-sub">挑難度・領積分：易→中→難可疊領</i> ${allClaimed ? '<b class="ok">✓ 全清</b>' : ''}</div>
      <div id="vg-questlist">${questRowsHtml(qs)}</div>
      ${weekHtml}
      ${townHtml}
      <button class="vg-mystery ${g.mystery.opened ? 'opened' : ''}" onclick="VDGame.openMysteryUI()">
        ${g.mystery.opened ? `🔓 今日神秘字：<b>${mw ? mw.word : ''}</b>（已開啟）` : '🎁 開啟今日神秘字'}
      </button>
      <div id="vg-ms-slot">${msHtml}</div>
    </div>`;
  }
  /* 三軌任務列（獨立函式：領獎後就地重繪用）；整列可點直達對應模式 */
  const QUEST_GO = ['quiz', 'battle', 'flash', 'listen'];
  function questRowsHtml(qs) {
    qs = qs || quests();
    return qs.map(q => {
      const hasReady = q.tiers.some(t => t.done && !t.claimed);
      return `
        <div class="vg-quest elastic ${hasReady ? 'done' : ''}" style="cursor:pointer" onclick="VDApp.go('${QUEST_GO[q.i] || 'menu'}')">
          <span class="vg-q-ico">${q.ico}</span>
          <span class="vg-q-body">
            <span class="vg-q-name">${q.name}<i class="vg-q-cur">${q.cur} ${q.unit}</i></span>
            <span class="vg-q-bar"><span style="width:${Math.min(100, q.cur / q.tiers[2].goal * 100)}%"></span></span>
            <span class="vg-q-tiers">${q.tiers.map(t =>
        t.claimed ? `<span class="vg-tier claimed">${t.label} ✓</span>`
          : t.done ? `<button class="vg-tier claim" onclick="event.stopPropagation();VDGame.claimAndRefresh(${q.i},${t.t})">${t.label}｜領 +${t.reward}</button>`
            : `<span class="vg-tier">${t.label} ${t.goal}${q.unit}・+${t.reward}</span>`).join('')}</span>
          </span>
        </div>`;
    }).join('');
  }
  // 供 onclick 呼叫：領獎後只就地重繪任務列（開箱動畫由 openChest 內建），不再整頁重載打斷心流
  function claimAndRefresh(i, t) {
    claimQuest(i, t);
    const box = document.getElementById('vg-questlist');
    if (box) {
      box.innerHTML = questRowsHtml();
      const slot = document.getElementById('vg-ms-slot');
      if (slot) slot.innerHTML = milestoneHtml();
    } else VDApp.go('menu'); // 容錯：找不到容器就退回整頁重繪
  }
  function claimWeekUI() { claimWeek(); VDApp.go('menu'); }
  function openMysteryUI() {
    const mw = mysteryWord();
    if (g.mystery.opened) { if (mw) toast(`今日神秘字是「${mw.word}」${mw.zh}`); return; }
    const c = openMystery();
    if (c && mw) {
      toast(`🎁 神秘字「${mw.word}」${mw.zh}｜${c.extra}：+${c.coins}幣 +${c.xp}XP`);
      VDStore.enroll(mw.word);
    }
    VDApp.go('menu');
  }

  /* ── 逃跑懲罰：上一場對戰沒結算就離開 → 判敗扣分 ── */
  function checkEscaped() {
    let pend = null;
    try { pend = JSON.parse(localStorage.getItem('vd_pendingBattle')); } catch { /* 壞資料照清 */ }
    if (!localStorage.getItem('vd_pendingBattle')) return;
    localStorage.removeItem('vd_pendingBattle');
    if (pend && pend.mode === 'pet') { if (window.VDPets) VDPets.petLose(); }
    else rankLose();
    toast('上一場中途離開，視同敗北');
  }

  /* ── 回歸補償：離開 ≥3 天回來 → 歡迎回城卡＋免費稀有寶箱，先給糖再談功課 ── */
  function welcomeBack() {
    try {
      const meta = JSON.parse(localStorage.getItem('vd_meta') || '{}');
      if (!meta.lastDay) return; // 全新玩家不觸發
      const t = VDStore.today();
      if (g.welcome === t) return; // 今天已發過
      const diff = Math.round((new Date(t + 'T00:00:00') - new Date(meta.lastDay + 'T00:00:00')) / 86400000);
      if (diff < 3) return;
      g.welcome = t; save();
      const ov = document.createElement('div'); ov.className = 'vg-levelup';
      ov.innerHTML = `<div class="vg-lu-card"><div class="vg-lu-ico">🏮</div>
        <div class="vg-lu-t">歡迎回城！</div>
        <div class="vg-lu-title">${diff} 天不見，送你一個稀有寶箱</div>
        <div class="vg-lu-sub">先從今天的 20 字開始就好</div>
        <div class="vg-lu-sub">點一下開箱</div></div>`;
      ov.onclick = () => { ov.remove(); openChest(40, 'rare'); };
      document.body.appendChild(ov);
    } catch { /* vd_meta 壞資料不擋主流程 */ }
  }

  /* ── 護盾生效通知：store.js 消耗護盾後在 vd_meta 記 shieldUsed=1，這裡吐 toast 並清 flag ── */
  function shieldNotice() {
    try {
      const live = (window.VDStore && VDStore.raw) ? VDStore.raw : null;
      const meta = live || JSON.parse(localStorage.getItem('vd_meta') || '{}');
      if (!meta || !meta.shieldUsed) return;
      delete meta.shieldUsed;
      if (live) VDStore.sub = VDStore.sub; // 觸發 store 內部 saveMeta 落盤
      else localStorage.setItem('vd_meta', JSON.stringify(meta));
      toast(`🛡️ 護盾頂住了！連續 ${meta.streak || 0} 天保住`);
    } catch { /* 壞資料略過 */ }
  }

  function init() { load(); checkEscaped(); welcomeBack(); shieldNotice(); }

  return {
    init, level, title, levelProgress, progressToLevel, get coins() { return g.coins; }, get avatar() { return g.avatar; },
    get shield() { return g.shield; }, get revive() { return g.revive; }, heroName, get raw() { return g; },
    onAnswer, onFlash, onFlashDone, onQuizDone, onBattleStart, onBattleFinish, onBattleWin, onListen, esc,
    quests, claimQuest, claimAndRefresh, openMystery, openMysteryUI, mysteryWord,
    weekQuest, claimWeek, claimWeekUI, weekVaultReady, openWeekVault, weekInfo, weekTheme,
    SHOP, buy, setFrame, get frame() { return g.shop.frame; }, get owned() { return g.shop.owned.slice(); },
    rankInfo, rankWin, rankLose, useRevive,
    nextMilestone, milestoneHtml,
    buyShield, tierUnlocked, tierNeed, setNick, setAvatar, AVATARS, avHtml,
    badges: () => BADGES.map(b => ({ ...b, got: !!g.badges[b.id], date: g.badges[b.id] })),
    badgeCount: () => ({ got: Object.keys(g.badges).length, total: BADGES.length }),
    bragText, challengeCode, decodeChallenge, setSprintBest, get sprintBest() { return g.best.sprint; },
    heroStrip, dailyPanel, toast, checkBadges, masteredAll,
    isBeaten: id => g.unlocked.includes('beat_' + id)
  };
})();
window.VDGame = VDGame;
