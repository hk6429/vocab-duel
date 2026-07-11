/* 限時衝刺：60 秒搶答，衝高分（CD6 迫切＋CD8 倒數壓力）；可貼同學挑戰碼 PK（CD5） */
const VDSprint = (() => {
  const DUR = 60;
  let el = null, words = [], score = 0, left = DUR, timer = null, q = null, locked = false, target = null;

  function start(w, container) {
    el = container; words = w; target = null;
    intro();
  }

  function intro() {
    clearInterval(timer);
    el.innerHTML = `
      <div class="sp-intro">
        <div class="sp-big">⏱️ 60 秒</div>
        <p>時間內答對越多越好，答錯不扣分只耗時間。</p>
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
    score = 0; left = DUR; locked = false;
    tick(); timer = setInterval(() => { left--; if (left <= 0) finish(); else paint(); }, 1000);
    next();
  }

  function next() {
    q = VDQuiz.randomQuestion(words);
    locked = false;
    paint();
  }

  function paint() {
    const pct = left / DUR * 100;
    el.innerHTML = `
      <div class="sp-hud">
        <div class="sp-timer ${left <= 10 ? 'danger' : ''}"><div class="sp-timer-fill" style="width:${pct}%"></div><span>${left}s</span></div>
        <div class="sp-score">🎯 ${score}${target ? `　目標 ${target.s}` : ''}</div>
      </div>
      <div class="sp-q">
        <div class="quiz-prompt">${q.prompt}</div>
        <div class="quiz-sub">${q.sub}</div>
        <div class="quiz-opts">${q.options.map((o, i) =>
          `<button class="btn opt" data-v="${encodeURIComponent(o)}"><span class="opt-key">${'ABCD'[i]}</span><span class="opt-text">${o}</span></button>`).join('')}</div>
      </div>`;
    el.querySelectorAll('.opt').forEach(b => b.onclick = () => answer(decodeURIComponent(b.dataset.v)));
  }

  // 倒數不重繪整題，只更新 HUD
  function tick() {}

  function answer(v) {
    if (locked) return;
    locked = true;
    const correct = v === q.ans;
    VDStore.record(q.word, correct);
    VDGame.onAnswer(correct, 'quiz', 0);
    if (correct) score++;
    next();
  }

  function finish() {
    clearInterval(timer);
    const isBest = VDGame.setSprintBest(score);
    VDGame.onQuizDone(score); // 併發獎勵：XP＋字幣
    const beat = target && score > target.s;
    el.innerHTML = `<div class="card-done">
      <div class="big">${isBest ? '🏅' : '⏱️'}</div>
      <p>時間到！答對 <b>${score}</b> 題${isBest ? '　🎉 新紀錄！' : ''}</p>
      ${target ? `<div class="bt-quote">${beat ? `擊敗 ${target.n}（${target.s} 分）！` : `${target.n} 是 ${target.s} 分，再拚一次！`}</div>` : ''}
      <button class="btn" onclick="VDApp.go('sprint')">再衝一次</button>
      <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button>
    </div>`;
  }

  return { start };
})();
window.VDSprint = VDSprint;
