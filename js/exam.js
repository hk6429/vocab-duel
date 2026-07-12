/* 會考英文考古題：篩選（年份/題型）→ 作答 → 對答案＋解析 → 錯題關鍵字一鍵進閃卡 */
const VDExam = (() => {
  const TYPES = { vocab: '字彙', grammar: '文法', cloze: '克漏字', reading: '閱讀理解' };
  let bank = null;      // [{year, questions:[...]}]
  let wset = null;      // 存在於 words.json 的字（小寫）
  let el = null;
  let filtered = [], idx = 0, picked = null;
  let fYear = 'all', fType = 'all', fWrong = false;
  let daily = false, dailyScore = 0; // 今日一卷模式

  /* 錯題號存 localStorage：["115-3", ...]（year-no） */
  const WRONG_KEY = 'vd_exam_wrong';
  function wrongIds() {
    try { return JSON.parse(localStorage.getItem(WRONG_KEY)) || []; }
    catch { return []; }
  }
  function markWrong(q) {
    const id = q.year + '-' + q.no;
    const ids = wrongIds();
    if (!ids.includes(id)) { ids.push(id); localStorage.setItem(WRONG_KEY, JSON.stringify(ids)); }
  }
  function unmarkWrong(q) {
    const id = q.year + '-' + q.no;
    const ids = wrongIds().filter(x => x !== id);
    localStorage.setItem(WRONG_KEY, JSON.stringify(ids));
  }

  /* 以日期字串為 seed 的洗牌：全體玩家同一天抽到同一卷 */
  function seededShuffle(arr, seedStr) {
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
    const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  async function ensure() {
    if (bank) return;
    try { bank = await (await fetch('data/exams.json')).json(); }
    catch { bank = []; }
    wset = new Set(VDApp.words().map(w => w.word.toLowerCase()));
  }

  async function start(container) {
    el = container;
    el.innerHTML = '<div class="loading">載入題庫…</div>';
    await ensure();
    if (!bank.length) return renderEmpty();
    renderFilter();
  }

  function renderEmpty() {
    el.innerHTML = `<div class="ex-empty">
      <div class="big">📝</div>
      <p>會考英文考古題題庫建置中</p>
      <p class="ex-sub">歷屆題本正在逐年結構化，敬請期待。</p>
      <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button>
    </div>`;
  }

  function allQuestions() {
    const out = [];
    for (const y of bank) for (const q of y.questions) out.push({ ...q, year: y.year });
    return out;
  }

  function applyFilter() {
    const wset2 = fWrong ? new Set(wrongIds()) : null;
    filtered = allQuestions().filter(q =>
      (fYear === 'all' || q.year === +fYear) &&
      (fType === 'all' || q.type === fType) &&
      (!wset2 || wset2.has(q.year + '-' + q.no)));
    idx = 0; picked = null; daily = false;
  }

  /* 今日一卷：日期 hash 定序抽 10 題，全體玩家同卷 */
  function startDaily() {
    filtered = seededShuffle(allQuestions(), VDStore.today()).slice(0, 10);
    idx = 0; picked = null; daily = true; dailyScore = 0;
    renderQ();
  }

  function renderFilter() {
    const years = [...new Set(bank.map(y => y.year))].sort((a, b) => b - a);
    const typesPresent = [...new Set(allQuestions().map(q => q.type))];
    el.innerHTML = `
      <div class="ex-filter">
        <div class="ex-frow"><span>年份</span>
          <select id="fYear"><option value="all">全部</option>
            ${years.map(y => `<option value="${y}">${y} 年</option>`).join('')}</select></div>
        <div class="ex-frow"><span>題型</span>
          <select id="fType"><option value="all">全部</option>
            ${typesPresent.map(t => `<option value="${t}">${TYPES[t] || t}</option>`).join('')}</select></div>
        <div class="ex-frow"><label><input type="checkbox" id="fWrong" ${fWrong ? 'checked' : ''}> 只出錯題（${wrongIds().length} 題）</label></div>
        <button class="btn" id="exStart">開始練習</button>
        <button class="btn ghost" id="exDaily">📅 今日一卷（全台同卷 10 題）</button>
      </div>
      <div class="ex-hint">題庫範圍：<b>國中教育會考</b>歷屆英文題（非學測）。共 ${allQuestions().length} 題，選好範圍就開始</div>`;
    el.querySelector('#fYear').value = fYear;
    el.querySelector('#fType').value = fType;
    el.querySelector('#fYear').onchange = e => fYear = e.target.value;
    el.querySelector('#fType').onchange = e => fType = e.target.value;
    el.querySelector('#fWrong').onchange = e => fWrong = e.target.checked;
    el.querySelector('#exStart').onclick = () => {
      applyFilter();
      if (!filtered.length) { alert(fWrong ? '目前沒有錯題，讚！換個條件試試' : '這個範圍沒有題目，換個條件試試'); return; }
      renderQ();
    };
    el.querySelector('#exDaily').onclick = startDaily;
  }

  function renderQ() {
    if (idx >= filtered.length) {
      if (daily) {
        const brag = `📅 字鬥英雄・今日一卷 ${VDStore.today()}：${dailyScore}/${filtered.length}，敢來挑戰嗎？`;
        el.innerHTML = `<div class="card-done"><div class="big">${dailyScore >= 8 ? '🏆' : dailyScore >= 5 ? '💪' : '📖'}</div>
          <p>今日一卷完成：<b>${dailyScore} / ${filtered.length}</b></p>
          <button class="btn" id="exBrag">📋 複製今日戰帖</button>
          <button class="btn ghost" onclick="VDApp.go('exam')">回篩選</button>
          <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button></div>`;
        el.querySelector('#exBrag').onclick = () => {
          const done = () => VDGame.toast('戰帖已複製，貼給同學吧！');
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(brag).then(done, () => prompt('手動複製：', brag));
          else prompt('手動複製：', brag);
        };
        return;
      }
      el.innerHTML = `<div class="card-done"><div class="big">🎉</div>
        <p>這個範圍練完了！</p>
        <button class="btn" onclick="VDApp.go('exam')">回篩選</button>
        <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button></div>`;
      return;
    }
    const q = filtered[idx];
    el.innerHTML = `
      <div class="ex-top">
        <button class="btn ghost ex-back">← 篩選</button>
        <span class="ex-meta">${q.year} 年・${TYPES[q.type] || q.type}・${idx + 1}/${filtered.length}</span>
      </div>
      <div class="ex-qwrap ${q.passage ? 'has-passage' : ''}">
        ${q.passage ? `<div class="ex-passage"><div class="ex-passage-bar">📖 短文朗讀 ${VDSpeak.btn(q.passage)}</div>${q.passage}</div>` : ''}
        <div class="ex-qcol">
          ${q.image ? `<img loading="lazy" decoding="async" class="ex-img" src="${q.image}" alt="題目圖片">` : ''}
          <div class="ex-stem">${q.stem} ${VDSpeak.btn(q.stem)}</div>
          <div class="ex-opts">${['A', 'B', 'C', 'D'].filter(k => q.options[k] != null).map(k =>
            `<button class="btn opt ex-opt" data-k="${k}"><span class="opt-key">${k}</span><span class="opt-text">${q.options[k]}</span></button>`).join('')}</div>
          <div id="exFb" aria-live="polite"></div>
        </div>
      </div>`;
    el.querySelector('.ex-back').onclick = () => VDApp.go('exam');
    el.querySelectorAll('.ex-opt').forEach(b => b.onclick = () => choose(q, b.dataset.k));
  }

  function choose(q, k) {
    if (picked) return;
    picked = k;
    const correct = k === q.answer;
    VDGame.onAnswer(correct, 'exam');
    el.querySelectorAll('.ex-opt').forEach(b => {
      b.disabled = true;
      if (b.dataset.k === q.answer) b.classList.add('right');
      else if (b.dataset.k === k) b.classList.add('wrong');
    });
    const kws = keywords(q);
    // 錯題不再進循環：答錯自動把關鍵字排入閃卡＋記進錯題本；答對則從錯題本畢業
    let autoAdded = 0;
    if (!correct) {
      kws.forEach(w => { if (VDStore.enroll(w)) autoAdded++; });
      if (autoAdded) VDGame.toast(`🃏 已把 ${autoAdded} 個關鍵字排入閃卡`);
      markWrong(q);
    } else {
      unmarkWrong(q);
      if (daily) dailyScore++;
    }
    const fb = el.querySelector('#exFb');
    fb.innerHTML = `
      <div class="ex-fb ${correct ? 'ok' : 'no'}">
        <div class="ex-verdict">${correct ? '✅ 答對了！' : `❌ 答錯了，正解是 (${q.answer})`}</div>
        ${correct && window.VDTown ? (() => { const p = VDTown.packInfo(); return `<div class="pg-hint">🏰 已計入城鎮學習包：今日答對 ${p.correct} 題，可領 ${p.avail} 包（每 5 題 1 包）</div>`; })() : ''}
        ${q.explain ? `<div class="ex-explain">${q.explain}</div>` : ''}
        ${!correct && autoAdded ? `<div class="pg-hint">🃏 這題 ${autoAdded} 個關鍵字已自動排入閃卡，明天複習會遇到它們</div>` : ''}
        ${correct && kws.length ? `<button class="btn ghost ex-addkw">🃏 把這題 ${kws.length} 個關鍵字加入閃卡</button>` : ''}
      </div>
      <button class="btn ex-next">下一題 →</button>`;
    const addBtn = fb.querySelector('.ex-addkw');
    if (addBtn) addBtn.onclick = () => {
      let n = 0; kws.forEach(w => { if (VDStore.enroll(w)) n++; });
      alert(`已加入 ${n} 個新單字到閃卡！`);
    };
    fb.querySelector('.ex-next').onclick = () => { idx++; picked = null; renderQ(); };
  }

  /* 從題幹＋選項抽出存在於字庫的英文字，作為錯題複習關鍵字 */
  function keywords(q) {
    const text = [q.stem, q.passage || '', ...Object.values(q.options)].join(' ');
    const words = (text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || []);
    const seen = new Set(), out = [];
    for (const w of words) {
      if (w.length < 3 || seen.has(w) || !wset.has(w)) continue;
      seen.add(w); out.push(w);
      if (out.length >= 12) break;
    }
    return out;
  }

  return { start };
})();
