/* 自測模組：英選中 / 中選英 / 例句挖空，一輪 10 題，結果回寫熟悉度 */
const VDQuiz = (() => {
  const ROUND = 10;
  let questions = [], idx = 0, score = 0;

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* 在例句中找出該字（含變化形）並挖空；找不到回傳 null */
  function cloze(w) {
    const stem = w.word.toLowerCase();
    const re = new RegExp('\\b(' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\w{0,3})\\b', 'i');
    const m = w.example.match(re);
    if (!m) return null;
    return w.example.replace(m[1], '＿'.repeat(Math.max(3, Math.min(6, stem.length))));
  }

  function pickDistractors(word, pool, n, keyFn) {
    const cands = pool.filter(x => x.word !== word.word && keyFn(x) !== keyFn(word));
    shuffle(cands);
    const out = [], seen = new Set([keyFn(word)]);
    for (const c of cands) {
      const k = keyFn(c);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
      if (out.length === n) break;
    }
    return out;
  }

  /* 為單一字建一題（隨機題型），pool 供同 level 誘答 */
  function makeQuestionFor(w, pool) {
    const sameLevel = pool.filter(x => x.level === w.level);
    const types = ['e2z', 'z2e'];
    const clz = cloze(w);
    if (clz) types.push('cloze');
    const type = types[Math.floor(Math.random() * types.length)];
    let q;
    if (type === 'e2z') {
      const ds = pickDistractors(w, sameLevel, 3, x => x.zh);
      q = { prompt: w.word, sub: '這個字是什麼意思？', options: shuffle([w.zh, ...ds.map(d => d.zh)]), ans: w.zh };
    } else if (type === 'z2e') {
      const ds = pickDistractors(w, sameLevel, 3, x => x.word);
      q = { prompt: w.zh, sub: '哪個英文字對應這個意思？', options: shuffle([w.word, ...ds.map(d => d.word)]), ans: w.word };
    } else {
      const ds = pickDistractors(w, sameLevel, 3, x => x.word);
      q = { prompt: clz, sub: `（${w.example_zh}）`, options: shuffle([w.word, ...ds.map(d => d.word)]), ans: w.word };
    }
    q.word = w.word;
    return q;
  }

  /* 從字表隨機抽一字出一題（供對戰模式連續出題） */
  function randomQuestion(words) {
    const pool = words.slice();
    const w = pool[Math.floor(Math.random() * pool.length)];
    return makeQuestionFor(w, pool);
  }

  function buildQuestions(words) {
    /* 出題對象：低盒優先（不熟的先考），混一些沒看過的 */
    const pool = words.slice();
    const targets = shuffle(pool.slice()).sort((a, b) => {
      const ba = VDStore.box(a.word), bb = VDStore.box(b.word);
      return (ba === -1 ? 2.5 : ba) - (bb === -1 ? 2.5 : bb) + (Math.random() - 0.5);
    }).slice(0, ROUND);
    return targets.map(w => makeQuestionFor(w, pool));
  }

  function start(words, el) {
    questions = buildQuestions(words);
    idx = 0; score = 0;
    render(el);
  }

  function render(el) {
    if (idx >= questions.length) {
      el.innerHTML = `<div class="card-done"><div class="big">${score >= 8 ? '🏆' : score >= 5 ? '💪' : '📖'}</div>
        <p>答對 ${score} / ${questions.length} 題！</p>
        <button class="btn" onclick="VDApp.go('quiz')">再測一輪</button>
        <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button></div>`;
      return;
    }
    const q = questions[idx];
    el.innerHTML = `
      <div class="flash-progress">第 ${idx + 1} / ${questions.length} 題　得分 ${score}</div>
      <div class="quiz-prompt">${q.prompt}</div>
      <div class="quiz-sub">${q.sub}</div>
      <div class="quiz-opts">${q.options.map((o, i) => `<button class="btn opt" data-v="${encodeURIComponent(o)}"><span class="opt-key">${'ABCD'[i]}</span><span class="opt-text">${o}</span></button>`).join('')}</div>`;
    el.querySelectorAll('.opt').forEach(btn => {
      btn.onclick = () => {
        const v = decodeURIComponent(btn.dataset.v);
        const correct = v === q.ans;
        VDStore.record(q.word, correct);
        if (correct) score++;
        el.querySelectorAll('.opt').forEach(b => {
          b.disabled = true;
          const bv = decodeURIComponent(b.dataset.v);
          if (bv === q.ans) b.classList.add('right');
          else if (b === btn) b.classList.add('wrong');
        });
        setTimeout(() => { idx++; render(el); }, correct ? 600 : 1400);
      };
    });
  }

  return { start, randomQuestion };
})();
