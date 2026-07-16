/* 寫作坊：單字產出練習 — 造句（規則評分）／句子重組／例句填空打字，一輪 6 題
   全程純前端評分，不依賴任何後端；答題回寫 qtype:'write'（產出題不算可疑快答） */
const VDWrite = (() => {
  const ROUND = 6;
  let questions = [], idx = 0, score = 0, combo = 0, session = 0;
  let qStart = 0;

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* 例句挖空（同 quiz.js cloze 邏輯）：找出含變化形的目標字，挖成固定 5 格 */
  function cloze(w) {
    const stem = w.word.toLowerCase();
    const re = new RegExp('\\b(' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\w{0,3})\\b', 'gi');
    const hits = [...w.example.matchAll(re)].map(m => m[1]);
    if (!hits.length) return null;
    const hit = hits.find(h => h.length === stem.length) || hits.sort((a, b) => a.length - b.length)[0];
    return { text: w.example.replace(hit, '＿'.repeat(5)), hit };
  }

  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  /* 造句規則評分：全過才算對；回傳 {ok, why} 讓學生知道差在哪 */
  function gradeSentence(s, w) {
    s = s.trim();
    if (!/^[a-zA-Z0-9 ,.'?!-]+$/.test(s)) return { ok: false, why: '只能用英文字母、數字和常見標點' };
    const stem = w.word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hasTarget = new RegExp('\\b' + stem + '\\w{0,3}\\b', 'i').test(s) ||
      (w.variants || []).some(v => new RegExp('\\b' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\w{0,3}\\b', 'i').test(s));
    if (!hasTarget) return { ok: false, why: `句子裡要用到「${w.word}」（可以用變化形）` };
    const tokens = s.split(/\s+/);
    if (tokens.length < 5) return { ok: false, why: '至少要寫 5 個字的完整句子' };
    const counts = {};
    for (const t of tokens) { const k = norm(t); counts[k] = (counts[k] || 0) + 1; }
    if (Object.keys(counts).length < 4) return { ok: false, why: '句子要有至少 4 個不同的字' };
    if (Object.values(counts).some(n => n > 2)) return { ok: false, why: '同一個字最多出現 2 次' };
    if (!/^[A-Z]/.test(s)) return { ok: false, why: '句首要大寫' };
    if (!/[.?!]$/.test(s)) return { ok: false, why: '句尾要有 . ? 或 !' };
    if (norm(s) === norm(w.example)) return { ok: false, why: '不能照抄課本例句，自己想一句吧' };
    return { ok: true };
  }

  /* 搭配詞加分：句子含 enrich 的任一 collocation → 額外獎勵 */
  function colloBonus(s, word) {
    try {
      const e = window.VDEnrich && VDEnrich.get(word);
      if (!e || !Array.isArray(e.collo)) return null;
      const low = ' ' + s.toLowerCase() + ' ';
      return e.collo.find(c => c && low.includes(' ' + c.toLowerCase() + ' ')) || null;
    } catch { return null; }
  }

  /* 這個字能出哪些題型 */
  function typesFor(w) {
    const ts = ['sent'];
    const tokens = w.example.split(/\s+/);
    if (tokens.length >= 4 && tokens.length <= 10) ts.push('scramble');
    if (cloze(w)) ts.push('gaptype');
    return ts;
  }

  function makeQuestionFor(w, forced) {
    const ts = typesFor(w);
    const type = forced && ts.includes(forced) ? forced : ts[Math.floor(Math.random() * ts.length)];
    const q = { type, word: w.word, w, meaning: { zh: w.zh, pos: w.pos, example: w.example, example_zh: w.example_zh } };
    if (w.variants) q.variants = w.variants;
    if (type === 'gaptype') {
      const c = cloze(w);
      q.prompt = c.text;
      q.ans = c.hit; // 例句中的原形（可能是變化形）
    } else if (type === 'scramble') {
      q.tokens = w.example.split(/\s+/);
    }
    return q;
  }

  /* 出題對象：低盒優先＋假熟練優先（同 quiz.js），題型輪替讓一輪三種都吃到 */
  function buildQuestions(words) {
    const targets = shuffle(words.slice()).sort((a, b) => {
      const ba = VDStore.box(a.word), bb = VDStore.box(b.word);
      const pa = (ba === -1 ? 2.5 : ba) - (VDStore.isFakeMastery(a.word) ? 1.5 : 0);
      const pb = (bb === -1 ? 2.5 : bb) - (VDStore.isFakeMastery(b.word) ? 1.5 : 0);
      return pa - pb + (Math.random() - 0.5);
    }).slice(0, ROUND);
    const order = ['sent', 'scramble', 'gaptype'];
    return targets.map((w, i) => makeQuestionFor(w, order[i % 3]));
  }

  function start(words, el) {
    questions = buildQuestions(words);
    idx = 0; score = 0; combo = 0; session++;
    render(el);
  }

  function answer(q, correct) {
    VDStore.record(q.word, correct, undefined, { qtype: 'write' });
    VDGame.onAnswer(correct, 'write', combo);
    if (correct) score++;
  }

  function render(el) {
    if (idx >= questions.length) {
      el.innerHTML = `<div class="card-done"><div class="big">${score >= 5 ? '🏆' : score >= 3 ? '💪' : '📖'}</div>
        <p>寫作坊答對 ${score} / ${questions.length} 題！</p>
        ${VDGame.milestoneHtml()}
        <button class="btn" onclick="VDApp.go('write')">再寫一輪</button>
        <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button></div>`;
      return;
    }
    const q = questions[idx];
    qStart = performance.now();
    if (q.type === 'sent') renderSent(el, q);
    else if (q.type === 'scramble') renderScramble(el, q);
    else renderGaptype(el, q);
  }

  const head = () => `<div class="flash-progress">第 ${idx + 1} / ${questions.length} 題　得分 ${score}</div>`;

  /* 造句：只給字＋中文＋詞性（例句評分後才揭示，防照抄） */
  function renderSent(el, q) {
    const w = q.w;
    el.innerHTML = head() + `
      <div class="quiz-prompt">${w.word} ${VDSpeak.btn(w.word)} <span class="af-pos">${w.pos.join('・')}</span></div>
      <div class="quiz-sub">${w.zh}</div>
      <div class="quiz-sub">✍️ 用這個字造一個英文句子（至少 5 個字、句首大寫、句尾標點）</div>
      <textarea id="wrIn" class="spell-in" rows="2" style="width:100%" autocomplete="off"
        autocapitalize="sentences" spellcheck="false" placeholder="例：I ... ${w.word} ... ."></textarea>
      <div class="cloud-row" style="margin-top:8px">
        <button class="btn wr-go">送出</button>
        <button class="btn ghost wr-skip">🙈 我不會（看例句）</button>
      </div>
      <div id="wrFb" aria-live="polite"></div>`;
    const input = el.querySelector('#wrIn');
    input.focus();
    let locked = false, tries = 0;
    el.querySelector('.wr-go').onclick = () => {
      if (locked || !input.value.trim()) return;
      const r = gradeSentence(input.value, w);
      if (!r.ok) {
        tries++;
        // 前兩次不算錯，給提示讓學生修（產出練習重點是寫出來，不是懲罰格式）
        if (tries < 3) {
          el.querySelector('#wrFb').innerHTML = `<div class="pg-hint">🤔 ${r.why}（再修修看，還有 ${3 - tries} 次機會）</div>`;
          return;
        }
      }
      locked = true;
      combo = r.ok ? combo + 1 : 0;
      answer(q, r.ok);
      input.disabled = true;
      el.querySelector('.wr-go').disabled = true;
      el.querySelector('.wr-skip').disabled = true;
      let bonusHtml = '';
      if (r.ok) {
        const c = colloBonus(input.value, q.word);
        if (c) { VDGame.award(5, 0); bonusHtml = `<div class="pg-hint">✨ 用上了道地搭配「${c}」，加 5 XP！</div>`; }
      }
      showFeedback(el, q, r.ok, r.ok ? '' : r.why, bonusHtml);
    };
    el.querySelector('.wr-skip').onclick = () => {
      if (locked) return;
      locked = true;
      combo = 0;
      answer(q, false);
      showFeedback(el, q, false, '');
    };
  }

  /* 句子重組：例句斷詞打亂成拼字塊，點擊排回原句 */
  function renderScramble(el, q) {
    const w = q.w;
    let picked = [];
    const bank = shuffle(q.tokens.map((t, i) => ({ t, i })));
    // 洗出來剛好等於原句就再洗一次（最多重洗一次，夠了）
    if (bank.map(b => b.i).join(',') === q.tokens.map((_, i) => i).join(',')) shuffle(bank);
    el.innerHTML = head() + `
      <div class="quiz-sub">🧩 句子重組：把打亂的字排回正確順序（${w.zh}）</div>
      <div class="quiz-sub">（${w.example_zh}）</div>
      <div id="wrPicked" class="quiz-prompt" style="min-height:1.6em;font-size:1.1em"></div>
      <div id="wrBank" class="quiz-opts" style="flex-direction:row;flex-wrap:wrap"></div>
      <div class="cloud-row" style="margin-top:8px">
        <button class="btn wr-go" disabled>送出</button>
        <button class="btn ghost wr-reset">↩︎ 重來</button>
      </div>
      <div id="wrFb" aria-live="polite"></div>`;
    const bankEl = el.querySelector('#wrBank');
    const pickedEl = el.querySelector('#wrPicked');
    const goBtn = el.querySelector('.wr-go');
    let locked = false;
    function draw() {
      pickedEl.textContent = picked.map(p => p.t).join(' ') || '（點下面的字組句）';
      bankEl.innerHTML = bank.map((b, bi) => picked.includes(b) ? '' :
        `<button class="btn opt" style="flex:none;width:auto;padding:6px 12px" data-bi="${bi}">${b.t}</button>`).join('');
      bankEl.querySelectorAll('[data-bi]').forEach(btn => {
        btn.onclick = () => { if (!locked) { picked.push(bank[+btn.dataset.bi]); draw(); } };
      });
      goBtn.disabled = picked.length !== q.tokens.length;
    }
    draw();
    el.querySelector('.wr-reset').onclick = () => { if (!locked) { picked = []; draw(); } };
    goBtn.onclick = () => {
      if (locked) return;
      locked = true;
      const correct = picked.map(p => p.i).join(',') === q.tokens.map((_, i) => i).join(',');
      combo = correct ? combo + 1 : 0;
      answer(q, correct);
      goBtn.disabled = true;
      showFeedback(el, q, correct, correct ? '' : `正確順序：${w.example}`);
    };
  }

  /* 例句填空打字：挖掉目標字，學生打出來（接受例句原形／基底字／變體） */
  function renderGaptype(el, q) {
    const w = q.w;
    el.innerHTML = head() + `
      <div class="quiz-prompt">${q.prompt}</div>
      <div class="quiz-sub">（${w.example_zh}）</div>
      <div class="quiz-sub">⌨️ 打出被挖掉的英文字（提示：${w.zh}）</div>
      <div class="spell-row">
        <input id="wrIn" class="spell-in" type="text" autocomplete="off" autocapitalize="off"
          autocorrect="off" spellcheck="false" aria-label="填入被挖掉的英文字" placeholder="輸入英文…">
        <button class="btn wr-go">送出</button>
      </div>
      <button class="btn ghost wr-skip">🙈 我不會（看答案）</button>
      <div id="wrFb" aria-live="polite"></div>`;
    const input = el.querySelector('#wrIn');
    input.focus();
    let locked = false;
    const finish = correct => {
      locked = true;
      combo = correct ? combo + 1 : 0;
      answer(q, correct);
      input.disabled = true;
      input.classList.add(correct ? 'right' : 'wrong');
      el.querySelector('.wr-go').disabled = true;
      el.querySelector('.wr-skip').disabled = true;
      showFeedback(el, q, correct, correct ? '' : `正解是 ${q.ans}`);
    };
    const submit = () => {
      if (locked || !input.value.trim()) return;
      const val = input.value.trim().toLowerCase();
      finish([q.ans, q.word, ...(q.variants || [])].some(a => a.toLowerCase() === val));
    };
    el.querySelector('.wr-go').onclick = submit;
    el.querySelector('.wr-skip').onclick = () => { if (!locked) finish(false); };
    input.onkeydown = e => { if (e.key === 'Enter') submit(); };
  }

  /* 回饋：完整字義＋例句＋發音（同 quiz.js 揭示邏輯） */
  function showFeedback(el, q, correct, extra, bonusHtml) {
    const m = q.meaning;
    const fb = el.querySelector('#wrFb');
    fb.innerHTML = `
      <div class="ex-fb ${correct ? 'ok' : 'no'}">
        <div class="ex-verdict">${correct ? '✅ 寫得好！' : `❌ ${extra || '再接再厲'}`}</div>
        <div class="qz-word">${q.word} ${VDSpeak.btn(q.word)} <span class="af-pos">${m.pos.join('・')}</span> <button class="mini-star ${VDStore.isStar(q.word) ? 'on' : ''}" onclick="VDApp.starClick(this,'${q.word}')">${VDStore.isStar(q.word) ? '⭐' : '☆'}</button></div>
        <div class="qz-zh">${m.zh}</div>
        <div class="qz-ex">${m.example} ${VDSpeak.btn(m.example)}<br><span class="ex-zh">${m.example_zh}</span></div>
        ${VDEnrich.block(q.word)}
      </div>
      ${bonusHtml || ''}
      ${correct ? `<div class="pg-hint">${combo >= 2 ? `🔥 連對 ×${combo}！` : ''}即將自動下一題…</div>` : '<button class="btn wr-next">下一題 →</button>'}`;
    const mySession = session;
    let advanced = false;
    const next = () => {
      if (advanced || mySession !== session || !el.contains(fb)) return;
      advanced = true;
      idx++;
      render(el);
    };
    if (correct) setTimeout(next, 1600);
    else fb.querySelector('.wr-next').onclick = next;
  }

  return { start };
})();
window.VDWrite = VDWrite;
