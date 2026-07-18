/* 限時衝刺：可調 60/90/120 秒或無限時搶答，衝高分（CD6 迫切＋CD8 倒數壓力）；可貼同學挑戰碼 PK（CD5） */
const VDSprint = (() => {
  let DUR = 60; // 學習詞條 sprint5 生效時 +5 秒；INFINITE=無限時（只計答對數）
  const INFINITE = Infinity;
  let el = null, words = [], score = 0, left = DUR, timer = null, q = null, locked = false, target = null;
  let wrongs = [], paused = false; // 本輪答錯題；閃現正解時暫停倒數 0.8s

  let perkBonus = 0; // 詞靈加時 perk 實際加了幾秒（僅供 UI 標示，非計時偏好本身）
  // 計時偏好：讀 VDMode（IEP／個人設定可調 60/90/120 秒或無限時）；無 VDMode 時退回 60 秒
  function computeDur() {
    if (window.VDMode && VDMode.noTimer()) { perkBonus = 0; return INFINITE; }
    let d = (window.VDMode ? VDMode.timerDur() : 60) || 60;
    // IEP 個別化調節：處理速度慢的學生延長作答時間 ×1.5／×2（老師端設定，隨班級下發）
    const ext = (window.VDMode && VDMode.acc('extraTime')) || 1;
    if (ext > 1) d = Math.round(d * ext);
    perkBonus = (window.VDPets && VDPets.hasPerk('sprint5')) ? 5 : 0;
    return d + perkBonus;
  }

  function start(w, container) {
    el = container; words = w; target = null;
    intro();
  }

  function intro() {
    clearInterval(timer);
    DUR = computeDur();
    const durLabel = DUR === INFINITE ? '∞ 無限時（只計答對數）' : `${DUR} 秒${perkBonus ? '<span class="sp-perk">⏱️ 詞條加時 +5s</span>' : ''}`;
    el.innerHTML = `
      <div class="sp-intro">
        <div class="sp-big">⏱️ ${durLabel}</div>
        <p>${DUR === INFINITE ? '沒有時間壓力，答完想結束時按「結束衝刺」即可。' : '時間內答對越多越好，答錯不扣分只耗時間。'}</p>
        <div class="sp-best">🏅 你的最佳：<b>${VDGame.sprintBest}</b> 分</div>
        <input class="sp-chal" id="chal" placeholder="（選填）貼上同學的挑戰碼來 PK">
        <button class="btn" id="go">開始衝刺</button>
        <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button>
      </div>`;
    el.querySelector('#go').onclick = () => {
      const code = el.querySelector('#chal').value.trim().replace(/^CHALLENGE:/, '');
      if (code) { const d = VDGame.decodeChallenge(code); if (d) target = d; }
      run();
    };
  }

  function run() {
    score = 0; left = DUR; locked = false; wrongs = []; paused = false;
    if (DUR !== INFINITE) {
      timer = setInterval(() => { if (paused) return; left--; if (left <= 0) finish(); else paint(); }, 1000);
    }
    next();
  }

  function next() {
    q = VDQuiz.randomQuestion(words);
    locked = false;
    paint();
  }

  function paint() {
    const infinite = DUR === INFINITE;
    const pct = infinite ? 100 : left / DUR * 100;
    const timerHtml = infinite
      ? `<div class="sp-timer"><div class="sp-timer-fill" style="width:100%"></div><span>∞</span></div>
         <button class="btn ghost sm" id="spStop">結束衝刺</button>`
      : `<div class="sp-timer ${left <= 10 ? 'danger' : ''}"><div class="sp-timer-fill" style="width:${pct}%"></div><span>${left}s</span></div>`;
    el.innerHTML = `
      <div class="sp-hud">
        ${timerHtml}
        <div class="sp-score">🎯 ${score}${target ? `　目標 ${target.s}` : ''}</div>
      </div>
      <div class="sp-q">
        <div class="quiz-prompt">${q.prompt}</div>
        <div class="quiz-sub">${q.sub}</div>
        <div class="quiz-opts">${q.options.map((o, i) =>
          `<button class="btn opt" data-v="${encodeURIComponent(o)}"><span class="opt-key">${'ABCD'[i]}</span><span class="opt-text">${o}</span></button>`).join('')}</div>
      </div>`;
    el.querySelectorAll('.opt').forEach(b => b.onclick = () => answer(decodeURIComponent(b.dataset.v)));
    const stopBtn = el.querySelector('#spStop');
    if (stopBtn) stopBtn.onclick = () => finish();
  }

  // 倒數不重繪整題，只更新 HUD
  function tick() {}

  function answer(v) {
    if (locked) return;
    locked = true;
    const correct = v === q.ans;
    VDStore.record(q.word, correct, 'battle');
    VDGame.onAnswer(correct, 'quiz', 0);
    if (correct) { score++; next(); return; }
    // 答錯：紅字閃現正解 0.8 秒（暫停倒數），再進下一題
    wrongs.push(q);
    paused = true;
    const box = el.querySelector('.sp-q');
    if (box) box.innerHTML = `
      <div class="quiz-prompt" style="color:#c0392b">✗ ${q.prompt}</div>
      <div class="quiz-sub" style="color:#c0392b;font-weight:bold">正解：${q.ans}</div>`;
    setTimeout(() => { paused = false; next(); }, 800);
  }

  function finish() {
    clearInterval(timer);
    const isBest = VDGame.setSprintBest(score);
    VDGame.onQuizDone(score); // 併發獎勵：XP＋字幣
    const beat = target && score > target.s;
    el.innerHTML = `<div class="card-done">
      <div class="big">${isBest ? '🏅' : '⏱️'}</div>
      <p>時間到！答對 <b>${score}</b> 題${isBest ? '　🎉 新紀錄！' : ''}</p>
      ${target ? `<div class="bt-quote">${beat ? `擊敗 ${VDGame.esc(target.n)}（${target.s} 分）！` : `${VDGame.esc(target.n)} 是 ${target.s} 分，再拚一次！`}</div>` : ''}
      ${wrongs.length ? `<div class="pg-sub">本輪答錯 ${wrongs.length} 題</div>
        ${wrongs.map(w => `<div class="pg-hint">✗ ${w.word}｜正解：${w.ans}</div>`).join('')}` : ''}
      ${VDGame.milestoneHtml()}
      <button class="btn" onclick="VDApp.go('sprint')">再衝一次</button>
      <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button>
    </div>`;
  }

  return { start };
})();
window.VDSprint = VDSprint;
