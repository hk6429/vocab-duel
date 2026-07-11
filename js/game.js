/* 遊戲化引擎 VDGame：八角驅動力一次補滿
   CD1 使命/稱號階梯　CD2 XP等級/徽章　CD3 自訂英雄/選擇　CD4 字幣/收集/檔案
   CD5 分享戰績/挑戰碼/本機榜　CD6 每日任務/神秘字/解鎖/限時　CD7 寶箱隨機獎　CD8 護盾/斷線警告/衝刺倒數 */
const VDGame = (() => {
  const KEY = 'vd_game';
  const TITLES = ['字鬥學徒', '見習字使', '字鬥劍客', '字鬥遊俠', '字鬥豪傑', '字鬥宗師', '字鬥聖手', '字鬥賢者', '字鬥仙師', '字鬥神帝'];
  const AVATARS = ['🦸', '🥷', '🧙', '🦉', '🐉', '🦊', '🐯', '🦅', '🐺', '🦁', '👑', '⚔️'];
  const TIER_LV = { 入門: 1, 進階: 2, 高手: 4, 宗師: 6 };
  const SHIELD_COST = 100;

  const DEFAULT = () => ({
    xp: 0, coins: 0, nick: '', avatar: '🦸',
    badges: {}, quests: { date: '', prog: { correct: 0, battle: 0, flash: 0 }, claimed: [] },
    mystery: { date: '', opened: false }, shield: 0, unlocked: [],
    best: { sprint: 0, battleWins: 0 }, seenIntro: false,
    ss: { correct: 0, spell: 0, exam: 0, battleWon: 0, maxCombo: 0 },
    shop: { owned: [], frame: '' }, revive: 0,
    rank: { pts: 0, peak: 0 },
    week: { key: '', prog: 0, claimed: false }
  });

  let g = DEFAULT();

  function load() {
    try { g = Object.assign(DEFAULT(), JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch { g = DEFAULT(); }
    // 巢狀欄位補齊
    g.quests = Object.assign({ date: '', prog: { correct: 0, battle: 0, flash: 0 }, claimed: [] }, g.quests);
    g.quests.prog = Object.assign({ correct: 0, battle: 0, flash: 0 }, g.quests.prog);
    g.ss = Object.assign({ correct: 0, spell: 0, exam: 0, battleWon: 0, maxCombo: 0 }, g.ss);
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

  /* ── 每日重置 ── */
  function rollDaily() {
    const t = VDStore.today();
    if (g.quests.date !== t) {
      g.quests = { date: t, prog: { correct: 0, battle: 0, flash: 0 }, claimed: [] };
    }
    if (g.mystery.date !== t) g.mystery = { date: t, opened: false };
    rollWeekly();
  }

  /* ── 每週任務（週一起算）：本週累計答對 100 題 → 傳說寶箱 ── */
  const WEEK_GOAL = 100;
  function weekKey() {
    const d = new Date(VDStore.today() + 'T00:00:00');
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // 回推到本週一
    return d.toLocaleDateString('sv-SE');
  }
  function rollWeekly() {
    const k = weekKey();
    if (g.week.key !== k) g.week = { key: k, prog: 0, claimed: false };
  }
  function weekQuest() {
    rollWeekly();
    return { cur: Math.min(g.week.prog, WEEK_GOAL), goal: WEEK_GOAL, done: g.week.prog >= WEEK_GOAL, claimed: g.week.claimed };
  }
  function claimWeek() {
    const w = weekQuest();
    if (!w.done || w.claimed) return null;
    g.week.claimed = true;
    const chest = openChest(120, 'legendary'); // 週寶箱保底傳說
    save();
    return chest;
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
    if (after > before) celebrate(after);
    else if (xp >= 20 || coins >= 10) toast(`+${xp} XP　+${coins} 字幣 ${reason || ''}${bonus}`);
    return after > before;
  }

  /* ── 答題事件（各模式共用） ── */
  function onAnswer(correct, kind, combo) {
    rollDaily();
    if (correct) {
      if (window.VDSound) (combo >= 2 ? VDSound.combo(combo) : VDSound.correct());
      g.ss.correct++;
      g.quests.prog.correct++;
      g.week.prog++;
      if (kind === 'spell') g.ss.spell++;
      if (kind === 'exam') g.ss.exam++;
      if (combo && combo > g.ss.maxCombo) g.ss.maxCombo = combo;
      let xp = kind === 'spell' ? 15 : kind === 'battle' ? 12 : 10;
      let coins = kind === 'spell' ? 4 : 2;
      // 新手祝福：前 10 題答對獎勵 ×3，先建立多巴胺迴路
      if (g.ss.correct <= 10) { xp *= 3; coins *= 3; toast(`🌟 新手祝福 ×3！（第 ${g.ss.correct}/10 題）`); }
      award(xp, coins);
      // 連擊大場面：×5、×10、×15… 全螢幕墨潑
      if (combo && combo >= 5 && combo % 5 === 0) comboSplash(combo);
    } else {
      if (window.VDSound) VDSound.wrong();
      g.xp += 2; save(); // 參與分，不吐 toast
    }
    checkBadges();
  }
  function onFlash() { rollDaily(); g.quests.prog.flash++; save(); checkBadges(); }
  function onFlashDone() { award(15, 5, '閃卡回合完成'); }
  function onQuizDone(score) { award(15 + score * 2, 5 + score, '自測完成'); }
  function onBattleStart() { rollDaily(); g.quests.prog.battle++; save(); }
  function onBattleWin(oppId, comeback) {
    g.ss.battleWon++;
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
    { id: 'lv5', ico: '🎖️', name: '登堂入室', desc: '達到 5 級', chk: () => level() >= 5 },
    { id: 'lv10', ico: '🏅', name: '登峰造極', desc: '達到 10 級', chk: () => level() >= 10 },
    { id: 'dailyall', ico: '✅', name: '每日全清', desc: '一天完成三項任務', chk: s => s.quests.claimed.length >= 3 },
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

  /* ── 每日任務 ── */
  function quests() {
    rollDaily();
    const p = g.quests.prog;
    return [
      { i: 0, ico: '✍️', name: '答對 15 題', cur: Math.min(p.correct, 15), goal: 15, reward: 40 },
      { i: 1, ico: '🎭', name: '打 1 場對戰', cur: Math.min(p.battle, 1), goal: 1, reward: 30 },
      { i: 2, ico: '🃏', name: '練 10 張閃卡', cur: Math.min(p.flash, 10), goal: 10, reward: 30 }
    ].map(q => ({ ...q, done: q.cur >= q.goal, claimed: g.quests.claimed.includes(q.i) }));
  }
  function claimQuest(i) {
    const q = quests().find(x => x.i === i);
    if (!q || !q.done || q.claimed) return null;
    g.quests.claimed.push(i);
    const chest = openChest(q.reward);
    if (g.quests.claimed.length === 3) { g.coins += 50; g.xp += 50; toast('🎁 三任務全清！額外 +50 XP +50 字幣'); }
    checkBadges(); save();
    return chest;
  }

  /* ── 寶箱：稀有度隨機獎（CD7）——傳說5%/稀有25%/普通70%，開箱動畫 ── */
  function openChest(baseCoins, forceRarity) {
    const r = Math.floor(seededRand() * 100);
    const rarity = forceRarity || (r < 5 ? 'legendary' : r < 30 ? 'rare' : 'common');
    const mul = { legendary: 4, rare: 2, common: 1 }[rarity];
    let coins = baseCoins * mul, xp = baseCoins * mul, extra = '';
    if (rarity === 'legendary') { g.shield++; g.revive++; extra = '傳說寶箱！四倍獎勵＋護盾＋復活羽毛'; }
    else if (rarity === 'rare') { if (seededRand() < 0.5) { g.shield++; extra = '稀有寶箱！雙倍獎勵＋護盾'; } else extra = '稀有寶箱！雙倍獎勵'; }
    else extra = '普通寶箱';
    g.coins += coins; g.xp += xp; save();
    chestAnim(rarity, coins, xp, extra);
    return { coins, xp, extra, rarity };
  }
  /* 開箱動畫：全螢幕水彩寶箱卡，稀有度分色 */
  function chestAnim(rarity, coins, xp, extra) {
    const ICO = { legendary: '👑', rare: '💎', common: '🎁' };
    const NAME = { legendary: '傳說', rare: '稀有', common: '普通' };
    if (window.VDSound) VDSound.coin();
    const ov = document.createElement('div'); ov.className = `vg-chest ${rarity}`;
    ov.innerHTML = `<div class="vg-chest-card">
      <div class="vg-chest-ico">${ICO[rarity]}</div>
      <div class="vg-chest-r">${NAME[rarity]}寶箱</div>
      <div class="vg-chest-loot">+${coins} 字幣　+${xp} XP</div>
      <div class="vg-chest-extra">${extra}</div>
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
  // 每次呼叫變化的偽隨機（Date 不可用，改用累積 xp 擾動）
  let _seed = 7;
  function seededRand() { _seed = (_seed * 9301 + 49297 + g.xp) % 233280; return _seed / 233280; }

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
    const chest = openChest(25);
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

  /* ── 字幣商店：頭像框（永久）＋消耗品，給字幣一個出口 ── */
  const SHOP = [
    { id: 'frame_ink', kind: 'frame', ico: '⭕', name: '墨圈框', desc: '手繪墨線頭像框', price: 200 },
    { id: 'frame_gold', kind: 'frame', ico: '🟡', name: '金箔框', desc: '燙金雙環頭像框', price: 500 },
    { id: 'frame_laurel', kind: 'frame', ico: '🏛️', name: '桂冠框', desc: '文豪桂冠頭像框', price: 900 },
    { id: 'shield', kind: 'consume', ico: '🛡️', name: '連續護盾', desc: '斷練一天自動頂上，🔥 不歸零', price: 100 },
    { id: 'revive', kind: 'consume', ico: '🪶', name: '復活羽毛', desc: '對戰倒下時原地復活（回 40 血）', price: 120 }
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
      if (q.claimed) continue;
      if (q.done) cands.push({ dist: 0.01, ico: '🎁', text: `「${q.name}」完成了，回主選單領寶箱！`, pct: 100 });
      else cands.push({ dist: (q.goal - q.cur) / q.goal, ico: q.ico, text: `每日任務「${q.name}」還差 ${q.goal - q.cur}`, pct: Math.round(q.cur / q.goal * 100) });
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
  function setNick(v) { g.nick = (v || '').slice(0, 12); save(); }
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
    try { return JSON.parse(decodeURIComponent(escape(atob(code.trim())))); } catch { return null; }
  }

  /* ── 限時衝刺最佳 ── */
  function setSprintBest(n) { if (n > g.best.sprint) { g.best.sprint = n; save(); return true; } return false; }

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
      return `<img class="vg-av-img ${cls || ''}${fr}" src="img/ui/h_avatar.png" alt=""
        onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'🦸',className:'vg-av ${cls || ''}${fr}'}))">`;
    }
    return `<span class="vg-av paper ${cls || ''}${fr}">${g.avatar}</span>`;
  }

  /* ── 首頁英雄橫幅 ── */
  function heroStrip() {
    const lp = levelProgress();
    return `<button class="vg-strip" onclick="VDApp.go('hero')">
      ${avHtml()}
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
    const qs = quests();
    const mw = mysteryWord();
    const allClaimed = qs.every(q => q.claimed);
    const cal = VDStore.dailyCalendar(7);
    const streak = VDStore.stats([]).streak;
    const W = ['日', '一', '二', '三', '四', '五', '六'];
    const calHtml = cal.map(c => {
      const wd = W[new Date(c.d + 'T00:00:00').getDay()];
      const isToday = c.d === VDStore.today();
      return `<span class="vg-cal-day ${c.active ? 'on' : ''} ${isToday ? 'today' : ''}"><i>${wd}</i>${c.active ? '🔥' : '·'}</span>`;
    }).join('');
    // FOMO：連續 2 天以上且今天還沒練 → 首屏警示，別讓火斷在今天
    const st = VDStore.stats([]);
    const fomo = (streak >= 2 && st.todayCount === 0)
      ? `<div class="vg-fomo">🔥 連續 <b>${streak}</b> 天——今天還沒練，別斷在這裡！</div>` : '';
    const wq = weekQuest();
    const weekHtml = `
      <div class="vg-quest week ${wq.done ? 'done' : ''}">
        <span class="vg-q-ico">👑</span>
        <span class="vg-q-body"><span class="vg-q-name">週任務：本週答對 ${wq.goal} 題（保底傳說寶箱）</span>
          <span class="vg-q-bar"><span style="width:${wq.cur / wq.goal * 100}%"></span></span></span>
        ${wq.claimed ? '<span class="vg-q-claimed">已領</span>'
        : wq.done ? `<button class="vg-q-claim" onclick="VDGame.claimWeekUI()">開箱</button>`
          : `<span class="vg-q-prog">${wq.cur}/${wq.goal}</span>`}
      </div>`;
    return `<div class="vg-daily wc-card">
      <img class="wc-card-img" src="img/ui/h_daily.png" alt="" onerror="this.remove()">
      ${fomo}
      <div class="vg-cal">
        <div class="vg-cal-strip">${calHtml}</div>
        <div class="vg-cal-note">連續 <b>${streak}</b> 天　明天再來 +30 XP 首勝獎</div>
      </div>
      <div class="vg-daily-head">每日任務 ${allClaimed ? '<b class="ok">✓ 全清</b>' : ''}</div>
      ${qs.map(q => `
        <div class="vg-quest ${q.done ? 'done' : ''}">
          <span class="vg-q-ico">${q.ico}</span>
          <span class="vg-q-body"><span class="vg-q-name">${q.name}</span>
            <span class="vg-q-bar"><span style="width:${q.cur / q.goal * 100}%"></span></span></span>
          ${q.claimed ? '<span class="vg-q-claimed">已領</span>'
        : q.done ? `<button class="vg-q-claim" onclick="VDGame.claimAndRefresh(${q.i})">領 +${q.reward}</button>`
          : `<span class="vg-q-prog">${q.cur}/${q.goal}</span>`}
        </div>`).join('')}
      ${weekHtml}
      <button class="vg-mystery ${g.mystery.opened ? 'opened' : ''}" onclick="VDGame.openMysteryUI()">
        ${g.mystery.opened ? `🔓 今日神秘字：<b>${mw ? mw.word : ''}</b>（已開啟）` : '🎁 開啟今日神秘字'}
      </button>
      ${milestoneHtml()}
    </div>`;
  }
  // 供 onclick 呼叫並重繪選單（開箱動畫由 openChest 內建，不再另吐 toast）
  function claimAndRefresh(i) {
    claimQuest(i);
    VDApp.go('menu');
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

  function init() { load(); }

  return {
    init, level, title, levelProgress, get coins() { return g.coins; }, get avatar() { return g.avatar; },
    get shield() { return g.shield; }, get revive() { return g.revive; }, heroName, get raw() { return g; },
    onAnswer, onFlash, onFlashDone, onQuizDone, onBattleStart, onBattleWin,
    quests, claimQuest, claimAndRefresh, openMystery, openMysteryUI, mysteryWord,
    weekQuest, claimWeek, claimWeekUI,
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
