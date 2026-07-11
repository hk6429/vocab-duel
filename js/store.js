/* 進度儲存：localStorage 封裝，key 一律 vd_ 前綴 */
const VDStore = (() => {
  const PROG_KEY = 'vd_progress'; // { word: { b:盒0-4, d:'YYYY-MM-DD'到期日, s:看過次數 } }
  const META_KEY = 'vd_meta';     // { stage:'E'|'J', daily:{date:count}, lastDay, streak }
  const INTERVALS = [0, 1, 2, 4, 7]; // 各盒複習間隔（天）

  const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD 本地時區

  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch { return fallback; }
  }
  let prog = load(PROG_KEY, {});
  let meta = load(META_KEY, { stage: null, daily: {}, lastDay: null, streak: 0 });

  const saveProg = () => localStorage.setItem(PROG_KEY, JSON.stringify(prog));
  const saveMeta = () => localStorage.setItem(META_KEY, JSON.stringify(meta));

  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toLocaleDateString('sv-SE');
  }

  function bumpDaily() {
    const t = today();
    meta.daily[t] = (meta.daily[t] || 0) + 1;
    if (meta.lastDay !== t) {
      meta.streak = (meta.lastDay === addDays(t, -1)) ? meta.streak + 1 : 1;
      meta.lastDay = t;
    }
    saveMeta();
  }

  return {
    INTERVALS,
    today,
    get stage() { return meta.stage; },
    set stage(v) { meta.stage = v; saveMeta(); },
    getWord: w => prog[w] || null,
    /* 答題結果回寫：correct 升一盒，錯誤歸 0 */
    record(word, correct) {
      const rec = prog[word] || { b: 0, d: today(), s: 0 };
      rec.b = correct ? Math.min(rec.b + 1, 4) : 0;
      rec.d = addDays(today(), INTERVALS[rec.b]);
      rec.s += 1;
      prog[word] = rec;
      saveProg();
      bumpDaily();
    },
    /* 加入閃卡：把字放進待複習（box0、今天到期）；已有進度則不動，回傳是否為新加入 */
    enroll(word) {
      if (prog[word]) return false;
      prog[word] = { b: 0, d: today(), s: 0 };
      saveProg();
      return true;
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
    exportCode() {
      return btoa(unescape(encodeURIComponent(JSON.stringify({ p: prog, m: meta }))));
    },
    importCode(code) {
      const obj = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      if (!obj.p || !obj.m) throw new Error('bad code');
      prog = obj.p; meta = obj.m;
      saveProg(); saveMeta();
    },
    resetAll() {
      prog = {}; meta = { stage: meta.stage, daily: {}, lastDay: null, streak: 0 };
      saveProg(); saveMeta();
    }
  };
})();
