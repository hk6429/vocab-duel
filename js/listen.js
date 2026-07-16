/* 聽力理解模組：聽詞辨義／聽句選義／聽力拼寫，一輪 8 題，全程序化出題（不需另外編寫對話內容）
   句子長度一律走離線 Web Speech（speak.js 已寫死避開有道整句 500），沒有流量/額度風險 */
const VDListen = (() => {
  const ROUND = 8;
  const REPLAY_MAX = 3;
  let questions = [], idx = 0, score = 0, combo = 0, session = 0;
  let qStart = 0, replays = 0;

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* 挑 n 個誘答：同詞性優先＋隨機微擾；候選不足時（同 level 太少）退而用全 pool */
  function pickFrom(word, pool, n, keyFn) {
    const cands = pool.filter(x => x.word !== word.word && keyFn(x) !== keyFn(word));
    const scored = cands.map(x => ({
      x, s: (word.pos && x.pos && word.pos.some(p => x.pos.includes(p)) ? 3 : 0) + Math.random()
    })).sort((a, b) => b.s - a.s);
    const out = [], seen = new Set([keyFn(word)]);
    for (const { x } of scored) {
      const k = keyFn(x);
      if (seen.has(k)) continue;
      seen.add(k); out.push(x);
      if (out.length === n) break;
    }
    return out;
  }
  function pickDistractors(word, sameLevel, pool, n, keyFn) {
    let ds = pickFrom(word, sameLevel, n, keyFn);
    if (ds.length < n) ds = pickFrom(word, pool, n, keyFn);
    return ds;
  }

  /* 為單一字建一題（隨機三種題型之一）：聽詞辨義／聽句選義／聽力拼寫（僅穩固拼法的純字母字才出拼寫） */
  function makeQuestionFor(w, pool) {
    const sameLevel = pool.filter(x => x.level === w.level);
    const canSpell = /^[a-z]{3,12}$/i.test(w.word);
    const types = canSpell ? ['word', 'sentence', 'spell'] : ['word', 'sentence'];
    const type = types[Math.floor(Math.random() * types.length)];
    let q;
    if (type === 'word') {
      const ds = pickDistractors(w, sameLevel, pool, 3, x => x.zh);
      q = { type, audio: w.word, sub: '聽音辨義：這個字是什麼意思？', options: shuffle([w.zh, ...ds.map(d => d.zh)]), ans: w.zh };
    } else if (type === 'sentence') {
      const ds = pickDistractors(w, sameLevel, pool, 3, x => x.example_zh);
      q = { type, audio: w.example, sub: '聽句選義：這句話是什麼意思？', options: shuffle([w.example_zh, ...ds.map(d => d.example_zh)]), ans: w.example_zh };
    } else {
      q = { type: 'spell', audio: w.word, sub: `聽音拼寫：拼出你聽到的英文字（提示：${w.zh}）`, ans: w.word };
    }
    q.word = w.word;
    if (w.variants) q.variants = w.variants; // 拼寫判定接受英式等變體拼法
    q.meaning = { zh: w.zh, pos: w.pos, example: w.example, example_zh: w.example_zh };
    return q;
  }

  /* 出題對象：低盒優先＋假熟練優先重測（同 quiz.js buildQuestions 邏輯），每題較耗時故題數比自測少 */
  function buildQuestions(words) {
    const pool = words.slice();
    const targets = shuffle(pool.slice()).sort((a, b) => {
      const ba = VDStore.box(a.word), bb = VDStore.box(b.word);
      const pa = (ba === -1 ? 2.5 : ba) - (VDStore.isFakeMastery(a.word) ? 1.5 : 0);
      const pb = (bb === -1 ? 2.5 : bb) - (VDStore.isFakeMastery(b.word) ? 1.5 : 0);
      return pa - pb + (Math.random() - 0.5);
    }).slice(0, ROUND);
    return targets.map(w => makeQuestionFor(w, pool));
  }

  function start(words, el) {
    questions = buildQuestions(words);
    idx = 0; score = 0; combo = 0; session++;
    render(el);
  }

  function answer(q, correct) {
    VDStore.record(q.word, correct, undefined, { qtype: 'listen', ms: performance.now() - qStart });
    VDGame.onAnswer(correct, 'listen', combo);
    VDGame.onListen();
    if (correct) score++;
  }

  function wireReplay(el, q) {
    const btn = el.querySelector('#lstReplay');
    if (!btn) return;
    btn.onclick = () => {
      if (replays >= REPLAY_MAX) return;
      replays++;
      VDSpeak.say(q.audio);
      const left = REPLAY_MAX - replays;
      btn.textContent = left > 0 ? `🔁 重播（剩 ${left} 次）` : '🔁 重播次數用完';
      if (left <= 0) btn.disabled = true;
    };
  }

  /* 偵測不到英語語音時提示安裝：句子題完全靠 TTS；單字題平常走有道，但校網擋有道時也會退回 TTS */
  function ttsBanner() {
    const st = VDSpeak.ttsStatus ? VDSpeak.ttsStatus() : 'ok';
    if (st === 'ok' || st === 'unknown') return '';
    if (st === 'unsupported')
      return `<div class="tts-warn">🔇 這個瀏覽器不支援語音朗讀，建議改用 Chrome 或 Safari。</div>`;
    return `<div class="tts-warn">🔇 偵測不到英語語音，<b>「聽句選義」題可能沒聲音</b>（單字題不受影響）。
      <details><summary>👉 教我安裝英語語音（一次就好）</summary>
      <b>iPhone／iPad：</b>設定 → 輔助使用 → 朗讀內容 → 語音 → 英文 → 下載一個（例如 Samantha）。<br>
      <b>Android：</b>設定 → 系統 → 語言與輸入 → 文字轉語音輸出 → ⚙️ → 安裝語音資料 → English。</details></div>`;
  }

  function render(el) {
    if (idx >= questions.length) {
      el.innerHTML = `<div class="card-done"><div class="big">${score >= 6 ? '🏆' : score >= 4 ? '💪' : '📖'}</div>
        <p>聽力答對 ${score} / ${questions.length} 題！</p>
        ${VDGame.milestoneHtml()}
        <button class="btn" onclick="VDApp.go('listen')">再聽一輪</button>
        <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button></div>`;
      return;
    }
    const q = questions[idx];
    qStart = performance.now();
    replays = 0;
    VDSpeak.say(q.audio); // 進題自動播一次；無 onEnd 回呼可偵測，只能靠使用者點擊重播
    const head = `
      ${ttsBanner()}
      <div class="flash-progress">第 ${idx + 1} / ${questions.length} 題　得分 ${score}</div>
      <div class="lst-play"><div class="lst-icon">🎧</div><button class="btn ghost" id="lstReplay">🔁 重播（剩 ${REPLAY_MAX} 次）</button></div>
      <div class="quiz-sub">${q.sub}</div>`;
    if (q.type === 'spell') {
      el.innerHTML = head + `
        <div class="spell-row">
          <input id="lstIn" class="spell-in" type="text" autocomplete="off" autocapitalize="off"
            autocorrect="off" spellcheck="false" aria-label="拼出聽到的英文單字" placeholder="輸入你聽到的英文字…">
          <button class="btn lst-go">送出</button>
        </div>
        <button class="btn ghost lst-skip">🙈 我不會（看答案）</button>
        <div id="lstFb" aria-live="polite"></div>`;
      wireReplay(el, q);
      const input = el.querySelector('#lstIn');
      input.focus();
      let locked = false;
      const finish = correct => {
        locked = true;
        combo = correct ? combo + 1 : 0;
        answer(q, correct);
        input.disabled = true;
        input.classList.add(correct ? 'right' : 'wrong');
        el.querySelector('.lst-go').disabled = true;
        el.querySelector('.lst-skip').disabled = true;
        showFeedback(el, q, correct);
      };
      const submit = () => {
        if (locked || !input.value.trim()) return;
        const val = input.value.trim().toLowerCase();
        finish([q.ans, ...(q.variants || [])].some(a => a.toLowerCase() === val));
      };
      el.querySelector('.lst-go').onclick = submit;
      el.querySelector('.lst-skip').onclick = () => { if (!locked) finish(false); };
      input.onkeydown = e => { if (e.key === 'Enter') submit(); };
    } else {
      el.innerHTML = head + `
        <div class="quiz-opts">${q.options.map((o, i) => `<button class="btn opt" data-v="${encodeURIComponent(o)}"><span class="opt-key">${'ABCD'[i]}</span><span class="opt-text">${o}</span></button>`).join('')}</div>
        <div id="lstFb" aria-live="polite"></div>`;
      wireReplay(el, q);
      let locked = false;
      el.querySelectorAll('.opt').forEach(btn => {
        btn.onclick = () => {
          if (locked) return;
          locked = true;
          const v = decodeURIComponent(btn.dataset.v);
          const correct = v === q.ans;
          combo = correct ? combo + 1 : 0;
          answer(q, correct);
          el.querySelectorAll('.opt').forEach(b => {
            b.disabled = true;
            const bv = decodeURIComponent(b.dataset.v);
            if (bv === q.ans) b.classList.add('right');
            else if (b === btn) b.classList.add('wrong');
          });
          showFeedback(el, q, correct);
        };
      });
    }
  }

  /* 答完顯示這個字的完整字義＋例句＋發音，讓答錯也學得到，手動按下一題（同 quiz.js 揭示邏輯） */
  function showFeedback(el, q, correct) {
    const m = q.meaning;
    const fb = el.querySelector('#lstFb');
    fb.innerHTML = `
      <div class="ex-fb ${correct ? 'ok' : 'no'}">
        <div class="ex-verdict">${correct ? '✅ 答對了！' : `❌ 答錯了，正解是 ${q.ans}`}</div>
        <div class="qz-word">${q.word} ${VDSpeak.btn(q.word)} <span class="af-pos">${m.pos.join('・')}</span> <button class="mini-star ${VDStore.isStar(q.word) ? 'on' : ''}" onclick="VDApp.starClick(this,'${q.word}')">${VDStore.isStar(q.word) ? '⭐' : '☆'}</button></div>
        <div class="qz-zh">${m.zh}</div>
        <div class="qz-ex">${m.example} ${VDSpeak.btn(m.example)}<br><span class="ex-zh">${m.example_zh}</span></div>
        ${VDEnrich.block(q.word)}
      </div>
      ${correct ? `<div class="pg-hint">${combo >= 2 ? `🔥 連對 ×${combo}！` : ''}即將自動下一題…</div>` : '<button class="btn lst-next">下一題 →</button>'}`;
    const mySession = session;
    let advanced = false;
    const next = () => {
      if (advanced || mySession !== session || !el.contains(fb)) return;
      advanced = true;
      idx++;
      render(el);
    };
    if (correct) setTimeout(next, 1200);
    else fb.querySelector('.lst-next').onclick = next;
  }

  return { start };
})();
window.VDListen = VDListen;
