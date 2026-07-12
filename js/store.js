/* 進度儲存：localStorage 封裝，key 一律 vd_ 前綴 */
const VDStore = (() => {
  const PROG_KEY = 'vd_progress'; // { word: { b:盒0-5, d:'YYYY-MM-DD'到期日, s:看過次數 } }
  const META_KEY = 'vd_meta';     // { stage:'E'|'J', daily:{date:count}, lastDay, streak }
  const INTERVALS = [0, 1, 3, 8, 21, 60]; // 各盒複習間隔（天）；擴張式間隔提升長期保留

  const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD 本地時區

  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch { return fallback; }
  }
  let prog = load(PROG_KEY, {});
  let meta = load(META_KEY, { stage: null, daily: {}, lastDay: null, streak: 0 });
  /* 舊存檔容錯：補齊後來新增的欄位 */
  function normalize(m) {
    if (!m.daily) m.daily = {};
    if (!m.wrong) m.wrong = {};        // 錯題本：word → 最後答錯日期
    if (!m.sub) m.sub = 'all';         // 高中分級篩選：'all' 或 'S1'..'S6'
    if (!m.star) m.star = {};          // 我的收藏：word → 加星日期
    if (!m.hist) m.hist = {};          // 每日精熟快照：'YYYY-MM-DD' → masteredCount
    if (!m.recent) m.recent = [];      // 近期答題滑動窗（1=對 0=錯，上限 30 筆）
    if (m.unitIdx == null) m.unitIdx = 0; // 20 字包進度：目前第幾包（0 起算）
    if (!m.assignments) m.assignments = {}; // 老師字表指派：code → {name, words, ts}
    return m;
  }
  meta = normalize(meta);

  const saveProg = () => localStorage.setItem(PROG_KEY, JSON.stringify(prog));
  const saveMeta = () => localStorage.setItem(META_KEY, JSON.stringify(meta));

  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toLocaleDateString('sv-SE');
  }

  /* vd_game 讀寫（護盾契約：只碰 shield / coins 欄位，並同步 VDGame 記憶體中的 g） */
  function readGame() {
    try { return JSON.parse(localStorage.getItem('vd_game')) || null; }
    catch { return null; }
  }
  function writeGame(g, field) {
    localStorage.setItem('vd_game', JSON.stringify(g));
    if (window.VDGame && VDGame.raw) VDGame.raw[field] = g[field]; // 同步記憶體，避免 game.js 之後存檔蓋回舊值
  }

  function countMastered() {
    let n = 0;
    for (const w in prog) if (prog[w].b >= 3) n++;
    return n;
  }

  /* 每日精熟快照：當天首次記一筆，保留 90 天滾動 */
  function snapshotHist(t) {
    if (meta.hist[t] != null) return;
    meta.hist[t] = countMastered();
    const cutoff = addDays(t, -90);
    for (const d in meta.hist) if (d < cutoff) delete meta.hist[d];
  }

  function bumpDaily() {
    const t = today();
    meta.daily[t] = (meta.daily[t] || 0) + 1;
    if (meta.lastDay !== t) {
      // 修復窗口逾期（斷檔日的隔天結束仍沒修）：徹底作廢
      if (meta.streakBroken && t > addDays(meta.streakBroken.date, 1)) delete meta.streakBroken;
      if (meta.lastDay === addDays(t, -1)) {
        meta.streak += 1;
      } else if (meta.lastDay === addDays(t, -2)) {
        // 只斷 1 天：先吃護盾；沒護盾則開修復窗口（當天或隔天可用字幣修）
        const g = readGame();
        if (g && g.shield > 0) {
          g.shield -= 1;
          writeGame(g, 'shield');
          meta.shieldUsed = 1; // game.js 撿去 toast
          meta.streak += 1;    // 護盾擋住：連續視為延續
        } else {
          meta.streakBroken = { was: meta.streak, date: t };
          meta.streak = 1;
        }
      } else {
        meta.streak = 1;
      }
      snapshotHist(t);
      meta.lastDay = t;
    }
    saveMeta();
  }

  /* 近期答題滑動窗：record() 時維護，上限 30 筆 */
  function pushRecent(correct) {
    meta.recent.push(correct ? 1 : 0);
    if (meta.recent.length > 30) meta.recent.splice(0, meta.recent.length - 30);
  }

  /* 本週一的日期字串 */
  function mondayOf(t) {
    const d = new Date(t + 'T00:00:00');
    d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    return d.toLocaleDateString('sv-SE');
  }

  /* 20 字包：level → 字母排序後切固定 20 字一包 */
  function packsOf(words) {
    const sorted = words.slice().sort((a, b) =>
      a.level === b.level ? (a.word < b.word ? -1 : 1) : (a.level < b.level ? -1 : 1));
    const packs = [];
    for (let i = 0; i < sorted.length; i += 20) packs.push(sorted.slice(i, i + 20));
    return packs;
  }
  function scopeFallback() {
    // VDApp 是頂層 const，不在 window 上，要用 typeof 偵測
    return (typeof VDApp !== 'undefined' && VDApp.scopeWords) ? VDApp.scopeWords() : null;
  }

  return {
    INTERVALS,
    today,
    get stage() { return meta.stage; },
    set stage(v) { meta.stage = v; saveMeta(); },
    getWord: w => prog[w] || null,
    /* 答題結果回寫：source 選填 — undefined/'quiz' 完整效果、'flash' 閃卡自評、'battle' 限時競技 */
    record(word, correct, source) {
      snapshotHist(today()); // 快照要在今天第一題「改動進度前」拍，週增量才不會少算
      const rec = prog[word] || { b: 0, d: today(), s: 0 };
      pushRecent(correct);
      if (source === 'battle' && !correct) {
        // 競技答錯：只記錯題本，不降盒、不改到期日（限時手滑不懲罰學習進度）
        rec.s += 1;
        prog[word] = rec;
        meta.wrong[word] = today();
        saveProg();
        bumpDaily();
        return;
      }
      if (correct) {
        // 閃卡自評升盒上限 2（已在盒 2 以上則不動不降）；其餘上限 5
        rec.b = source === 'flash' ? (rec.b >= 2 ? rec.b : rec.b + 1) : Math.min(rec.b + 1, 5);
      } else {
        // 答錯降兩盒（不再歸零），盒 1 以下才回 0
        rec.b = rec.b >= 2 ? rec.b - 2 : 0;
      }
      rec.d = addDays(today(), INTERVALS[rec.b]);
      rec.s += 1;
      prog[word] = rec;
      // 錯題本：答錯記入；答對且已達熟練（盒 ≥3）才畢業移除
      if (!correct) meta.wrong[word] = today();
      else if (rec.b >= 3 && meta.wrong[word]) delete meta.wrong[word];
      saveProg();
      bumpDaily();
    },
    isWrong: w => !!meta.wrong[w],
    /* 錯題清單：回傳仍在錯題本裡的字物件（限定 scope 範圍） */
    wrongWords(words) { return words.filter(w => meta.wrong[w.word]); },
    get sub() { return meta.sub; },
    set sub(v) { meta.sub = v; saveMeta(); },
    /* 我的收藏（加星）：任意字主動收藏，考前只刷圈起來的 */
    toggleStar(word) { if (meta.star[word]) delete meta.star[word]; else meta.star[word] = today(); saveMeta(); return !!meta.star[word]; },
    isStar: w => !!meta.star[w],
    starWords(words) { return words.filter(w => meta.star[w.word]); },
    /* 最近 n 天登入日曆：回傳 [{d, active}]（active＝當天有複習紀錄） */
    dailyCalendar(n) {
      const out = [];
      for (let i = n - 1; i >= 0; i--) { const d = addDays(today(), -i); out.push({ d, active: (meta.daily[d] || 0) > 0 }); }
      return out;
    },
    /* 加入閃卡：把字放進待複習（box0、今天到期）；已有進度則不動，回傳是否為新加入 */
    enroll(word) {
      if (prog[word]) return false;
      prog[word] = { b: 0, d: today(), s: 0 };
      saveProg();
      return true;
    },
    /* 近 n 題正確率 0~1；還沒有答題紀錄回傳 null */
    recentAcc(n = 20) {
      const arr = meta.recent.slice(-n);
      if (!arr.length) return null;
      return arr.reduce((a, b) => a + b, 0) / arr.length;
    },
    /* 本週（週一起）新增精熟數：目前精熟 − 週初快照 */
    weekMastered() {
      const cur = countMastered();
      const mon = mondayOf(today());
      const dates = Object.keys(meta.hist).sort();
      // 基準＝週一「以前」最後一筆快照（上週結束時的量）；沒有就取最早那筆（舊檔升級容錯）；再沒有＝0
      let base = null;
      for (const d of dates) { if (d < mon) base = meta.hist[d]; else break; }
      if (base == null) base = dates.length ? meta.hist[dates[0]] : 0;
      return Math.max(0, cur - base);
    },
    /* 目前 20 字包資訊：{packNo(1 起算), done(box≥1 數), total} 或 null */
    unitInfo(words) {
      words = words || scopeFallback();
      if (!words || !words.length) return null;
      const packs = packsOf(words);
      const i = Math.min(meta.unitIdx, packs.length - 1);
      const pack = packs[i];
      const done = pack.filter(w => (prog[w.word] ? prog[w.word].b : -1) >= 1).length;
      return { packNo: i + 1, done, total: pack.length, words: pack };
    },
    /* 本包全數 box≥1 就進下一包；回傳剛完成的包號（沒完成回傳 0） */
    advanceUnit(words) {
      const info = this.unitInfo(words);
      if (!info || info.done < info.total) return 0;
      words = words || scopeFallback();
      if (meta.unitIdx >= packsOf(words).length - 1) return 0; // 已是最後一包
      meta.unitIdx += 1;
      saveMeta();
      return info.packNo;
    },
    /* streak 修復窗口：可修回傳 {was, cost, date}，否則 null */
    streakRepairInfo() {
      const b = meta.streakBroken;
      if (!b) return null;
      if (today() > addDays(b.date, 1)) { delete meta.streakBroken; saveMeta(); return null; } // 逾期真歸 1
      return { was: b.was, cost: Math.min(b.was * 5, 100), date: b.date };
    },
    /* 用字幣修復 streak：成功回傳新 streak，失敗回傳 false */
    repairStreak() {
      const info = this.streakRepairInfo();
      if (!info) return false;
      const g = readGame();
      if (!g || (g.coins || 0) < info.cost) return false;
      g.coins -= info.cost;
      writeGame(g, 'coins');
      meta.streak = info.was + meta.streak; // 斷檔前 + 斷檔後累計，接回一條
      delete meta.streakBroken;
      saveMeta();
      return meta.streak;
    },
    /* 老師字表指派：存一份 {name, words, ts}，供戰績頁追進度 */
    addAssignment(code, name, words) {
      meta.assignments[code] = { name, words, ts: Date.now() };
      saveMeta();
    },
    assignments() { return meta.assignments; },
    /* 目前作用中字表指派（最近一次新增）完成進度：{code,name,done,total} 或 null 無指派時
       done 定義與 stats.js assignmentCard() 一致＝box≥1（不是精熟，避免剛派下去全班顯示 0 太打擊士氣） */
    activeAssignmentProgress() {
      const codes = Object.keys(meta.assignments);
      if (!codes.length) return null;
      const code = codes.sort((a, b) => meta.assignments[b].ts - meta.assignments[a].ts)[0];
      const a = meta.assignments[code];
      const done = a.words.filter(w => (prog[w] ? prog[w].b : -1) >= 1).length;
      return { code, name: a.name, done, total: a.words.length };
    },
    isDue: w => prog[w] && prog[w].d <= today(),
    isSeen: w => !!prog[w],
    box: w => (prog[w] ? prog[w].b : -1), // -1 = 未學
    stats(words) { // words = 目前學段範圍的字陣列
      const t = today();
      let mastered = 0, seen = 0, due = 0;
      for (const w of words) {
        const r = prog[w.word];
        if (!r) continue;
        seen++;
        if (r.b >= 3) mastered++;
        if (r.d <= t) due++;
      }
      return { mastered, seen, due, todayCount: meta.daily[t] || 0, streak: meta.streak };
    },
    /* Leitner 六盒分佈：回傳各盒字數＋未學數，供首頁迷你進度條 */
    boxDist(words) {
      const d = [0, 0, 0, 0, 0, 0];
      let unseen = 0;
      for (const w of words) {
        const r = prog[w.word];
        if (!r) { unseen++; continue; }
        d[Math.max(0, Math.min(5, r.b))]++;
      }
      return { d, unseen, total: words.length, streak: meta.streak };
    },
    exportCode() {
      return btoa(unescape(encodeURIComponent(JSON.stringify({ p: prog, m: meta }))));
    },
    importCode(code) {
      const obj = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      if (!obj.p || !obj.m) throw new Error('bad code');
      prog = obj.p; meta = normalize(obj.m);
      saveProg(); saveMeta();
    },
    resetAll() {
      prog = {}; meta = normalize({ stage: meta.stage, daily: {}, lastDay: null, streak: 0 });
      saveProg(); saveMeta();
    }
  };
})();

window.VDStore = VDStore;
