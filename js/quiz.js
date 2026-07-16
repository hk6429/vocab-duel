/* 自測模組：英選中 / 中選英 / 例句挖空，一輪 10 題，結果回寫熟悉度 */
const VDQuiz = (() => {
  const ROUND = 10;
  const SESSION_MAX = 20; // 畢業自測最多考一批閃卡的量
  let questions = [], idx = 0, score = 0, combo = 0;
  let wrongStreak = 0, rescue = false, curPool = []; // 連錯救援：連錯 3 題起後續誘答改隨機
  let session = 0; // 場次代號：自動下一題的計時器用來偵測「已離開這一輪」
  let qStart = 0; // 本題出現時間戳，答題時算耗時判斷是否可疑快答

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
    const re = new RegExp('\\b(' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\w{0,3})\\b', 'gi');
    const hits = [...w.example.matchAll(re)].map(m => m[1]);
    if (!hits.length) return null;
    // 優先等長（原形）的 match，否則取最短的變化形
    const hit = hits.find(h => h.length === stem.length) || hits.sort((a, b) => a.length - b.length)[0];
    return w.example.replace(hit, '＿'.repeat(5)); // 固定 5 格，不洩漏字長
  }

  /* 編輯距離（Levenshtein），量拼字相近程度 */
  function editDistance(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[m][n];
  }

  /* 誘答相似度：同詞性最關鍵（同類才構成有效干擾），英文選項再看拼字型近（首字母/字長/編輯距離） */
  function simScore(cand, word, formal) {
    let s = 0;
    const pw = word.pos || [], pc = cand.pos || [];
    if (pw.some(p => pc.includes(p))) s += 3;
    if (formal) {
      const a = word.word.toLowerCase(), b = cand.word.toLowerCase();
      if (a[0] === b[0]) s += 1;
      if (Math.abs(a.length - b.length) <= 1) s += 1;
      const ed = editDistance(a, b);
      if (ed <= 3) s += (4 - ed);
    }
    return s + Math.random() * 0.9; // 微擾：避免每次固定同幾個誘答
  }

  /* 挑 n 個誘答：依相似度排序取高分者（比隨機更能鑑別），去重同義／同字；easy=救援模式改純隨機 */
  function pickDistractors(word, pool, n, keyFn, formal, easy) {
    const cands = pool.filter(x => x.word !== word.word && keyFn(x) !== keyFn(word));
    const scored = easy
      ? shuffle(cands.slice()).map(x => ({ x }))
      : cands.map(x => ({ x, s: simScore(x, word, formal) })).sort((p, q) => q.s - p.s);
    const out = [], seen = new Set([keyFn(word)]);
    for (const { x } of scored) {
      const k = keyFn(x);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(x);
      if (out.length === n) break;
    }
    return out;
  }

  /* 為單一字建一題，pool 供同 level 誘答；allowSpell 開啟產出型拼寫題（僅自測用，對戰不出）；easy=救援模式；
     bias=true 時優先挑這個字「還沒答對過」的題型（逼題型多樣性，防止只靠同一種題型騙過系統），僅自測模式傳入 */
  function makeQuestionFor(w, pool, allowSpell, easy, bias) {
    const sameLevel = pool.filter(x => x.level === w.level);
    const fam = VDStore.box(w.word) >= 2; // 盒 ≥2 = 已穩固；未穩固不出形近誘答、不出拼寫
    const types = ['e2z', 'z2e'];
    const clz = cloze(w);
    if (clz) types.push('cloze');
    // 拼寫題只給已穩固（盒 ≥2）、單一純字母、長度 3–12 的字（新字／片語／連字號不出），並提高權重
    if (allowSpell && fam && /^[a-z]{3,12}$/i.test(w.word)) types.push('spell', 'spell');
    let type;
    if (bias && !easy) {
      const seen = VDStore.correctTypes(w.word);
      const untested = types.filter(t => !seen.has(t));
      type = untested.length ? untested[Math.floor(Math.random() * untested.length)] : types[Math.floor(Math.random() * types.length)];
    } else {
      type = types[Math.floor(Math.random() * types.length)];
    }
    let q;
    if (type === 'e2z') {
      /* 英英模式：選項改用英文定義（enrich 資料齊全才出，缺則回中文四選一） */
      const enMode = localStorage.getItem('vd_quizmode') === 'en' && window.VDEnrich;
      const defOf = x => { const e = enMode ? VDEnrich.get(x.word) : null; return (e && e.def_en) || ''; };
      if (enMode && defOf(w)) {
        const ds = pickDistractors(w, sameLevel.filter(x => defOf(x)), 3, x => defOf(x), false, easy);
        if (ds.length === 3) q = { type, prompt: w.word, sub: '哪個英文解釋符合？（英英模式）', options: shuffle([defOf(w), ...ds.map(defOf)]), ans: defOf(w) };
      }
      if (!q) {
        const ds = pickDistractors(w, sameLevel, 3, x => x.zh, false, easy);
        q = { type, prompt: w.word, sub: '這個字是什麼意思？', options: shuffle([w.zh, ...ds.map(d => d.zh)]), ans: w.zh };
      }
    } else if (type === 'z2e') {
      const ds = pickDistractors(w, sameLevel, 3, x => x.word, fam && !easy, easy);
      /* 英英模式：題幹改用英文定義（缺 def_en 則 fallback 原中文） */
      const enMode = localStorage.getItem('vd_quizmode') === 'en' && window.VDEnrich;
      const e = enMode ? VDEnrich.get(w.word) : null;
      q = (e && e.def_en)
        ? { type, prompt: e.def_en, sub: '哪個英文字符合這個定義？（英英模式）', options: shuffle([w.word, ...ds.map(d => d.word)]), ans: w.word }
        : { type, prompt: w.zh, sub: '哪個英文字對應這個意思？', options: shuffle([w.word, ...ds.map(d => d.word)]), ans: w.word };
    } else if (type === 'cloze') {
      const ds = pickDistractors(w, sameLevel, 3, x => x.word, fam && !easy, easy);
      q = { type, prompt: clz, sub: `（${w.example_zh}）`, options: shuffle([w.word, ...ds.map(d => d.word)]), ans: w.word };
    } else {
      q = { type: 'spell', prompt: w.zh, sub: `拼出這個英文字（${w.pos.join('・')}）`, hint: clz, ans: w.word, first: w.word[0] };
    }
    q.word = w.word;
    if (w.variants) q.variants = w.variants; // 拼寫判定接受英式等變體拼法
    q.meaning = { zh: w.zh, pos: w.pos, example: w.example, example_zh: w.example_zh };
    return q;
  }

  /* 從字表隨機抽一字出一題（供對戰模式連續出題） */
  function randomQuestion(words) {
    const pool = words.slice();
    const w = pool[Math.floor(Math.random() * pool.length)];
    return makeQuestionFor(w, pool);
  }

  function buildQuestions(words) {
    /* 出題對象：低盒優先（不熟的先考），混一些沒看過的；假熟練（盒夠高但信任度低）額外扣分提前重測 */
    const pool = words.slice();
    const targets = shuffle(pool.slice()).sort((a, b) => {
      const ba = VDStore.box(a.word), bb = VDStore.box(b.word);
      const pa = (ba === -1 ? 2.5 : ba) - (VDStore.isFakeMastery(a.word) ? 1.5 : 0);
      const pb = (bb === -1 ? 2.5 : bb) - (VDStore.isFakeMastery(b.word) ? 1.5 : 0);
      return pa - pb + (Math.random() - 0.5);
    }).slice(0, ROUND);
    return targets.map(w => makeQuestionFor(w, pool, true, false, true));
  }

  function start(words, el) {
    curPool = words.slice();
    questions = buildQuestions(words);
    idx = 0; score = 0; combo = 0; wrongStreak = 0; rescue = false; render._awarded = false;
    session++;
    render(el);
  }

  /* 指定字開一輪（閃卡「畢業自測」入口）：list＝要考的字，pool＝誘答來源（預設 list） */
  function startWith(list, el, pool) {
    curPool = (pool && pool.length ? pool : list).slice();
    questions = list.slice(0, SESSION_MAX).map(w => makeQuestionFor(w, curPool, true, false, true));
    idx = 0; score = 0; combo = 0; wrongStreak = 0; rescue = false; render._awarded = false;
    session++;
    render(el);
  }

  /* 連錯救援：連錯 3 題起，剩餘題目誘答改隨機（好排除），並安撫一句 */
  function trackStreak(correct) {
    if (correct) { wrongStreak = 0; return; }
    wrongStreak++;
    if (wrongStreak >= 3 && !rescue) {
      rescue = true;
      for (let i = idx + 1; i < questions.length; i++) {
        const w = curPool.find(x => x.word === questions[i].word);
        if (w) questions[i] = makeQuestionFor(w, curPool, true, true);
      }
      VDGame.toast('別急，換幾題暖身 💪');
    }
  }

  function render(el) {
    if (idx >= questions.length) {
      if (!render._awarded) { VDGame.onQuizDone(score); render._awarded = true; }
      el.innerHTML = `<div class="card-done"><div class="big">${score >= 8 ? '🏆' : score >= 5 ? '💪' : '📖'}</div>
        <p>答對 ${score} / ${questions.length} 題！</p>
        ${VDGame.milestoneHtml()}
        <button class="btn" onclick="VDApp.go('quiz')">再測一輪</button>
        <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button></div>`;
      return;
    }
    const q = questions[idx];
    qStart = performance.now(); // 本題開始計時，答對太快視為可疑快答（拼寫題不算，見 appendHist）
    // 拼寫產出題：不給選項，讓學生自己打出英文（產出型記憶，比辨識強）
    if (q.type === 'spell') return renderSpell(el, q);
    // 題幹是英文時（看英想中、例句挖空）給發音鈕；看中選英的題幹是中文不給
    const promptSpk = q.type !== 'z2e' ? VDSpeak.btn(q.word) : '';
    el.innerHTML = `
      <div class="flash-progress">第 ${idx + 1} / ${questions.length} 題　得分 ${score}</div>
      <div class="quiz-prompt">${q.prompt} ${promptSpk}</div>
      <div class="quiz-sub">${q.sub}</div>
      <div class="quiz-opts">${q.options.map((o, i) => `<button class="btn opt" data-v="${encodeURIComponent(o)}"><span class="opt-key">${'ABCD'[i]}</span><span class="opt-text">${o}</span></button>`).join('')}</div>
      <div id="quizFb" aria-live="polite"></div>`;
    let locked = false;
    el.querySelectorAll('.opt').forEach(btn => {
      btn.onclick = () => {
        if (locked) return;
        locked = true;
        const v = decodeURIComponent(btn.dataset.v);
        const correct = v === q.ans;
        combo = correct ? combo + 1 : 0;
        VDStore.record(q.word, correct, undefined, { qtype: q.type, ms: performance.now() - qStart });
        VDGame.onAnswer(correct, 'quiz', combo);
        trackStreak(correct);
        if (correct) score++;
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

  /* 拼寫產出題：只給中文＋例句提示，學生打出英文，比選項辨識更能測真實掌握 */
  function renderSpell(el, q) {
    el.innerHTML = `
      <div class="flash-progress">第 ${idx + 1} / ${questions.length} 題　得分 ${score}</div>
      <div class="quiz-prompt">${q.prompt}</div>
      <div class="quiz-sub">${q.sub}</div>
      ${q.hint ? `<div class="quiz-sub qz-hint">例句：${q.hint}</div>` : ''}
      <div class="spell-row">
        <input id="spellIn" class="spell-in" type="text" autocomplete="off" autocapitalize="off"
          autocorrect="off" spellcheck="false" aria-label="拼出這個英文單字"
          placeholder="輸入英文，首字母 ${q.first.toUpperCase()}…">
        <button class="btn spell-go">送出</button>
      </div>
      <button class="btn ghost spell-skip">🙈 我不會（看答案）</button>
      <div id="quizFb" aria-live="polite"></div>`;
    const input = el.querySelector('#spellIn');
    input.focus();
    let locked = false;
    const finish = correct => {
      locked = true;
      combo = correct ? combo + 1 : 0;
      VDStore.record(q.word, correct, undefined, { qtype: q.type, ms: performance.now() - qStart });
      VDGame.onAnswer(correct, 'spell', combo);
      trackStreak(correct);
      if (correct) score++;
      input.disabled = true;
      input.classList.add(correct ? 'right' : 'wrong');
      el.querySelector('.spell-go').disabled = true;
      el.querySelector('.spell-skip').disabled = true;
      showFeedback(el, q, correct);
    };
    const submit = () => {
      if (locked || !input.value.trim()) return;
      // 拼字判定：標準答案或任一變體拼法（如英式拼法）命中即對
      const val = input.value.trim().toLowerCase();
      finish([q.ans, ...(q.variants || [])].some(a => a.toLowerCase() === val));
    };
    el.querySelector('.spell-go').onclick = submit;
    // 我不會：視同答錯，但照常顯示完整解析讓學生學到
    el.querySelector('.spell-skip').onclick = () => { if (!locked) finish(false); };
    input.onkeydown = e => { if (e.key === 'Enter') submit(); };
  }

  /* 答完顯示這個字的完整字義＋例句＋發音，讓答錯也學得到，手動按下一題 */
  function showFeedback(el, q, correct) {
    const m = q.meaning;
    const fb = el.querySelector('#quizFb');
    fb.innerHTML = `
      <div class="ex-fb ${correct ? 'ok' : 'no'}">
        <div class="ex-verdict">${correct ? '✅ 答對了！' : `❌ 答錯了，正解是 ${q.ans}`}</div>
        <div class="qz-word">${q.word} ${VDSpeak.btn(q.word)} <span class="af-pos">${m.pos.join('・')}</span> <button class="mini-star ${VDStore.isStar(q.word) ? 'on' : ''}" onclick="VDApp.starClick(this,'${q.word}')">${VDStore.isStar(q.word) ? '⭐' : '☆'}</button></div>
        <div class="qz-zh">${m.zh}</div>
        <div class="qz-ex">${m.example} ${VDSpeak.btn(m.example)}<br><span class="ex-zh">${m.example_zh}</span></div>
        ${VDEnrich.block(q.word)}
      </div>
      ${correct ? `<div class="pg-hint">${combo >= 2 ? `🔥 連對 ×${combo}！` : ''}即將自動下一題…</div>` : '<button class="btn qz-next">下一題 →</button>'}`;
    const mySession = session;
    let advanced = false;
    const next = () => {
      if (advanced || mySession !== session || !el.contains(fb)) return; // 已離開這一輪／換頁就不動畫面
      advanced = true;
      idx++;
      render(el);
    };
    if (correct) setTimeout(next, 1200); // 答對 1.2 秒自動前進；答錯保留手動看解析
    else fb.querySelector('.qz-next').onclick = next;
  }

  return { start, startWith, randomQuestion };
})();
