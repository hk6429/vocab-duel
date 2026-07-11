/* 會考英文考古題：篩選（年份/題型）→ 作答 → 對答案＋解析 → 錯題關鍵字一鍵進閃卡 */
const VDExam = (() => {
  const TYPES = { vocab: '字彙', grammar: '文法', cloze: '克漏字', reading: '閱讀理解' };
  let bank = null;      // [{year, questions:[...]}]
  let wset = null;      // 存在於 words.json 的字（小寫）
  let el = null;
  let filtered = [], idx = 0, picked = null;
  let fYear = 'all', fType = 'all';

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
    filtered = allQuestions().filter(q =>
      (fYear === 'all' || q.year === +fYear) &&
      (fType === 'all' || q.type === fType));
    idx = 0; picked = null;
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
        <button class="btn" id="exStart">開始練習</button>
      </div>
      <div class="ex-hint">共 ${allQuestions().length} 題，選好範圍就開始</div>`;
    el.querySelector('#fYear').value = fYear;
    el.querySelector('#fType').value = fType;
    el.querySelector('#fYear').onchange = e => fYear = e.target.value;
    el.querySelector('#fType').onchange = e => fType = e.target.value;
    el.querySelector('#exStart').onclick = () => {
      applyFilter();
      if (!filtered.length) { alert('這個範圍沒有題目，換個條件試試'); return; }
      renderQ();
    };
  }

  function renderQ() {
    if (idx >= filtered.length) {
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
      ${q.passage ? `<div class="ex-passage">${q.passage}</div>` : ''}
      ${q.image ? `<img class="ex-img" src="${q.image}" alt="題目圖片">` : ''}
      <div class="ex-stem">${q.stem}</div>
      <div class="ex-opts">${['A', 'B', 'C', 'D'].filter(k => q.options[k] != null).map(k =>
        `<button class="btn opt ex-opt" data-k="${k}">(${k}) ${q.options[k]}</button>`).join('')}</div>
      <div id="exFb"></div>`;
    el.querySelector('.ex-back').onclick = () => VDApp.go('exam');
    el.querySelectorAll('.ex-opt').forEach(b => b.onclick = () => choose(q, b.dataset.k));
  }

  function choose(q, k) {
    if (picked) return;
    picked = k;
    const correct = k === q.answer;
    el.querySelectorAll('.ex-opt').forEach(b => {
      b.disabled = true;
      if (b.dataset.k === q.answer) b.classList.add('right');
      else if (b.dataset.k === k) b.classList.add('wrong');
    });
    const kws = keywords(q);
    const fb = el.querySelector('#exFb');
    fb.innerHTML = `
      <div class="ex-fb ${correct ? 'ok' : 'no'}">
        <div class="ex-verdict">${correct ? '✅ 答對了！' : `❌ 答錯了，正解是 (${q.answer})`}</div>
        ${q.explain ? `<div class="ex-explain">${q.explain}</div>` : ''}
        ${kws.length ? `<button class="btn ghost ex-addkw">🃏 把這題 ${kws.length} 個關鍵字加入閃卡</button>` : ''}
      </div>
      <button class="btn ex-next">下一題 →</button>`;
    if (kws.length) fb.querySelector('.ex-addkw').onclick = () => {
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
