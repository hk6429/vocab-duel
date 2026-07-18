/* 分頻適性定位前測（P1）：20–30 題階梯升降頻，測完估計掌握字數＋落點頻段，
   明顯已會的字直接墊高盒位（走既有 VDStore API，只加不減）。
   自足模組：不依賴 index.html/app.js 佈局，自建全螢幕 modal，唯讀呼叫 VDStore / VDQuiz / VDApp.words。 */
const VDPlacement = (() => {
  const LADDER = ['E', 'J', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
  // 約當學段說明（僅供估計參考，非官方分級名稱）
  const STAGE_LABEL = {
    E: '國小常用字', J: '國中常用字', S1: '高中入門', S2: '高中基礎',
    S3: '高中核心', S4: '高中進階', S5: '學測／指考常見', S6: '學測／指考高階'
  };
  const TOTAL = 24; // 20–30 題之間取中間值
  const START_IDX = 1; // 從「國中常用字」開局，符合本站主要受眾

  let allWords = [], bandIdx = START_IDX, seen = new Set(), hist = [], qi = 0, cur = null, locked = false;

  let host = null; // start() 傳入的容器：overlay 掛它底下，離開頁面（#app 重繪）一併移除，不殘留攔點擊
  function ensureOverlay() {
    let ov = document.getElementById('vd-placement-ov');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'vd-placement-ov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);' +
      'display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto';
    (host || document.body).appendChild(ov);
    return ov;
  }
  function panel() {
    const ov = ensureOverlay();
    ov.innerHTML = '<div class="card" style="max-width:480px;width:100%;background:var(--card-bg,#fff);' +
      'border-radius:14px;padding:20px;max-height:90vh;overflow:auto"></div>';
    return ov.firstElementChild;
  }
  function close() {
    const ov = document.getElementById('vd-placement-ov');
    if (ov) ov.remove();
    if (window.VDApp && typeof VDApp.go === 'function') VDApp.go('menu');
  }

  async function loadWords() {
    if (window.VDApp && typeof VDApp.words === 'function') {
      const w = VDApp.words();
      if (w && w.length) return w;
    }
    try {
      const res = await fetch('data/words.json');
      return await res.json();
    } catch { return []; }
  }

  function levelWords(level) {
    return allWords.filter(w => w.level === level && !seen.has(w.word));
  }

  /* 該頻段字太少湊不出四選一誘答時，就近往鄰近頻段取備援 */
  function pickPool(band) {
    let pool = levelWords(band);
    if (pool.length >= 4) return pool;
    const i = LADDER.indexOf(band);
    for (const j of [i - 1, i + 1, i - 2, i + 2]) {
      if (j < 0 || j >= LADDER.length) continue;
      pool = levelWords(LADDER[j]);
      if (pool.length >= 4) return pool;
    }
    return pool; // 仍不足就照樣回傳（quiz 端會自然湊不出誘答而略過）
  }

  async function start(el) {
    host = el || null;
    allWords = await loadWords();
    bandIdx = START_IDX; seen = new Set(); hist = []; qi = 0;
    if (!allWords.length) { alert('題庫尚未載入，稍後再試一次'); return; }
    intro();
  }

  function intro() {
    const box = panel();
    box.innerHTML = `
      <h2>📊 分頻適性定位前測</h2>
      <p>約 ${TOTAL} 題。答對難度往上、答錯難度往下，測完幫你估計目前大概會多少字、落在哪個程度。</p>
      <button class="btn" id="go">開始測驗</button>
      <button class="btn ghost" id="x">先不測</button>`;
    box.querySelector('#go').onclick = next;
    box.querySelector('#x').onclick = close;
  }

  function next() {
    if (qi >= TOTAL) return finish(false);
    const band = LADDER[bandIdx];
    const pool = pickPool(band);
    if (pool.length < 2) return finish(false); // 字庫耗盡保險
    cur = VDQuiz.randomQuestion(pool);
    if (!cur || !cur.options) return finish(false);
    seen.add(cur.word);
    locked = false;
    render(band);
  }

  function render(band) {
    const box = panel();
    box.innerHTML = `
      <div class="quiz-sub">第 ${qi + 1}／${TOTAL} 題　頻段：${band}（${STAGE_LABEL[band]}）</div>
      <div class="quiz-prompt">${cur.prompt}</div>
      <div class="quiz-sub">${cur.sub || ''}</div>
      <div class="quiz-opts">${cur.options.map((o, i) =>
        `<button class="btn opt" data-v="${encodeURIComponent(o)}"><span class="opt-key">${'ABCD'[i]}</span><span class="opt-text">${o}</span></button>`).join('')}</div>
      <button class="btn ghost" id="x">中止測驗</button>`;
    box.querySelectorAll('.opt').forEach(b => b.onclick = () => answer(decodeURIComponent(b.dataset.v), band));
    box.querySelector('#x').onclick = () => finish(true);
  }

  function answer(v, band) {
    if (locked) return;
    locked = true;
    const correct = v === cur.ans;
    hist.push({ word: cur.word, band, correct });
    bandIdx = correct ? Math.min(bandIdx + 1, LADDER.length - 1) : Math.max(bandIdx - 1, 0);
    qi++;
    setTimeout(next, 150);
  }

  /* 明顯已會的字：這次測驗答對過的字，直接墊高盒位省得從盒 0 重刷（只加不減，走既有 VDStore.record/enroll API） */
  function applyResults() {
    const correctWords = new Set(hist.filter(h => h.correct).map(h => h.word));
    correctWords.forEach(w => {
      VDStore.enroll(w);
      VDStore.record(w, true, 'quiz');
      VDStore.record(w, true, 'quiz'); // 再推一次墊高盒位
    });
  }

  /* 依各頻段答對率抓落點：最高「答對率 ≥0.5」的頻段，再用該頻段以下的字庫總量粗估掌握字數 */
  function estimate() {
    const byBand = {};
    hist.forEach(h => { (byBand[h.band] = byBand[h.band] || []).push(h.correct); });
    let reachedIdx = 0;
    LADDER.forEach((b, i) => {
      const arr = byBand[b];
      if (!arr || !arr.length) return;
      const acc = arr.filter(Boolean).length / arr.length;
      if (acc >= 0.5) reachedIdx = i;
    });
    const reached = LADDER[reachedIdx];
    const below = new Set(LADDER.slice(0, reachedIdx + 1));
    const estCount = allWords.filter(w => below.has(w.level)).length;
    return { reached, estCount, label: STAGE_LABEL[reached] };
  }

  function saveHist(rec) {
    let h = [];
    try { h = JSON.parse(localStorage.getItem('vd_placement')) || []; } catch { h = []; }
    h.push(rec);
    if (h.length > 20) h = h.slice(-20);
    localStorage.setItem('vd_placement', JSON.stringify(h));
  }

  function finish(aborted) {
    if (hist.length) applyResults();
    const r = hist.length ? estimate() : { reached: LADDER[START_IDX], estCount: 0, label: STAGE_LABEL[LADDER[START_IDX]] };
    const correctN = hist.filter(h => h.correct).length;
    saveHist({
      date: VDStore.today(), band: r.reached, est: r.estCount,
      correct: correctN, total: hist.length
    });
    const box = panel();
    box.innerHTML = `
      <h2>${aborted ? '測驗已中止' : '🎉 測驗完成'}</h2>
      <p>本次共答 ${hist.length} 題，答對 ${correctN} 題。</p>
      <p>估計你目前大約已經會 <b>${r.estCount}</b> 個字，落在「<b>${r.reached}</b>」頻段（約當 ${r.label}）。</p>
      <p class="quiz-sub">此為粗估，供分班／複習起點參考，非正式測驗成績。</p>
      <button class="btn" id="ok">完成</button>`;
    box.querySelector('#ok').onclick = close;
  }

  /* 歷史紀錄（供日後 sparkline 使用） */
  function history() {
    try { return JSON.parse(localStorage.getItem('vd_placement')) || []; } catch { return []; }
  }

  return { start, history };
})();
if (typeof window !== 'undefined') window.VDPlacement = VDPlacement;
