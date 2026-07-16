/* 隨堂即時模式：老師在後台開場，全班同 seed 同題搶答；Upstash 輪詢同步。
   題目確定性：seed + 字表 → mulberry 可重現亂數，所有裝置各自出同一組題，伺服器零題目儲存。
   輪詢自清：每次 tick 檢查容器 isConnected，一切換路由就停表，不留殭屍請求。 */
const VDLive = (() => {
  const Q_SEC = 15, POLL_MS = 3000, LOBBY_MS = 5000;
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const api = (body) => VDCloud.api('/api/live', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);

  /* 可重現亂數（同 rtbattle）：同 seed → 全班同題同選項 */
  function mulberry(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* 從老師字表出 qn 題：只出 e2z/z2e（共時計時下打字題不公平）；誘答優先取字表內、不足補全字庫 */
  function buildQuestions(seed, wordStrs, qn) {
    const rng = mulberry(seed);
    const dict = new Map(VDApp.words().map(w => [w.word.toLowerCase(), w]));
    const targets = wordStrs.map(s => dict.get(s)).filter(Boolean);
    const all = VDApp.words().slice().sort((a, b) => a.word < b.word ? -1 : 1);
    const pool = targets.length >= 12 ? targets : all;
    const pick = [], used = new Set();
    while (pick.length < Math.min(qn, targets.length) && used.size < targets.length) {
      const i = Math.floor(rng() * targets.length);
      if (used.has(i)) continue;
      used.add(i); pick.push(targets[i]);
    }
    return pick.map(w => {
      const e2z = rng() < 0.5;
      const opts = [e2z ? w.zh : w.word];
      const seen = new Set([w.word]);
      let guard = 0;
      while (opts.length < 4 && guard++ < 200) {
        const src = guard > 100 ? all : pool; // 字表撞太多重複意思就退到全字庫
        const d = src[Math.floor(rng() * src.length)];
        const v = e2z ? d.zh : d.word;
        if (seen.has(d.word) || opts.includes(v)) continue;
        seen.add(d.word); opts.push(v);
      }
      for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
      }
      return { word: w.word, type: e2z ? 'e2z' : 'z2e', prompt: e2z ? w.word : w.zh, sub: e2z ? '選出正確意思' : '選出正確的英文', ans: e2z ? w.zh : w.word, options: opts };
    });
  }

  /* ── 學生端 ── */
  let el = null, st = null, pollTimer = 0, tickTimer = 0;
  function stopTimers() { clearInterval(pollTimer); clearInterval(tickTimer); pollTimer = tickTimer = 0; }
  const gone = () => !el || !el.isConnected; // 路由切走 → innerHTML 被換掉，容器離場

  function start(_scope, container) {
    el = container;
    stopTimers();
    const code = localStorage.getItem('vd_classcode') || '';
    const nick = localStorage.getItem('vd_classname') || '';
    if (!code || !nick) {
      el.innerHTML = `<div class="card-done"><div class="big">📡</div>
        <p>隨堂考要先加入班級（班級碼＋暱稱）才能參加。</p>
        <button class="btn" onclick="VDApp.go('cloud')">去雲端頁加入班級</button>
        <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button></div>`;
      return;
    }
    st = { code, nick, qs: null, answered: 0, myScore: 0, combo: 0, registered: false };
    el.innerHTML = '<div class="loading">連線中…</div>';
    poll();
    pollTimer = setInterval(poll, POLL_MS);
  }

  async function poll() {
    if (gone()) return stopTimers();
    const r = await api({ op: 'state', code: st.code });
    if (gone()) return stopTimers();
    if (!r || !r.ok) return;
    const live = r.live;
    if (!live || live.phase === 'end') {
      if (live && live.phase === 'end' && st.qs) return finishStudent();
      el.innerHTML = `<div class="card-done"><div class="big">🕰️</div>
        <p>現在沒有進行中的隨堂考——等老師開場後再進來。</p>
        <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button></div>`;
      return;
    }
    if (!st.qs) st.qs = buildQuestions(live.seed, live.words || [], live.qn);
    if (!st.registered) {
      st.registered = true;
      api({ op: 'answer', code: st.code, nick: st.nick, qNo: 0 }); // 報到入名冊
    }
    if (live.phase === 'lobby') {
      el.innerHTML = `<div class="card-done"><div class="big">📡</div>
        <p>已加入隨堂考（${st.qs.length} 題）——等老師出第一題…</p>
        <div class="pg-hint">你是：${esc(st.nick)}</div></div>`;
      return;
    }
    // phase === 'q'：出到新題才重繪（同題輪詢不打斷作答）
    if (live.qNo > st.answered && live.qNo <= st.qs.length && !st.showing) showQuestion(live.qNo);
  }

  function showQuestion(qNo) {
    st.showing = qNo;
    const q = st.qs[qNo - 1];
    let left = Q_SEC, locked = false;
    el.innerHTML = `
      <div class="rt-hud"><span id="lv-timer">${Q_SEC}s</span><span>第 ${qNo}/${st.qs.length} 題　我的得分 ${st.myScore}</span></div>
      <div class="quiz-prompt">${esc(q.prompt)}</div>
      <div class="quiz-sub">${q.sub}</div>
      <div class="quiz-opts">${q.options.map((o, i) => `<button class="btn opt" data-v="${encodeURIComponent(o)}"><span class="opt-key">${'ABCD'[i]}</span><span class="opt-text">${esc(o)}</span></button>`).join('')}</div>`;
    const submit = (v) => {
      if (locked) return;
      locked = true;
      clearInterval(tickTimer);
      const correct = v !== null && v === q.ans;
      st.combo = correct ? st.combo + 1 : 0;
      if (correct) st.myScore++;
      st.answered = qNo; st.showing = 0;
      // battle source：錯字進錯題本＋弱字佇列，但不降 Leitner 盒（課堂壓力不懲罰排程）
      VDStore.record(q.word, correct, 'battle', { qtype: q.type });
      VDGame.onAnswer(correct, 'battle', st.combo);
      api({ op: 'answer', code: st.code, nick: st.nick, qNo, correct });
      el.innerHTML = `<div class="card-done"><div class="big">${correct ? '✅' : v === null ? '⏰' : '❌'}</div>
        <p>${correct ? '答對了！' : v === null ? '時間到——這題沒搶到' : `答錯了，正解：${esc(q.ans)}`}</p>
        <div class="pg-hint">目前得分 ${st.myScore}/${qNo}——等老師出下一題…</div></div>`;
    };
    tickTimer = setInterval(() => {
      if (gone()) return stopTimers();
      left--;
      const t = el.querySelector('#lv-timer');
      if (t) { t.textContent = left + 's'; t.classList.toggle('danger', left <= 5); }
      if (left <= 0) submit(null);
    }, 1000);
    el.querySelectorAll('.opt').forEach(b => b.onclick = () => submit(decodeURIComponent(b.dataset.v)));
  }

  async function finishStudent() {
    stopTimers();
    const calm = window.VDCloud && VDCloud.calm && VDCloud.calm();
    const total = st.qs.length;
    if (calm) {
      el.innerHTML = `<div class="card-done"><div class="big">🕊️</div>
        <p>隨堂考結束！你答對 ${st.myScore}/${total} 題。</p>
        <div class="pg-hint">安心模式：只跟自己比，這次的每一題都算數。</div>
        <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button></div>`;
      return;
    }
    const r = await api({ op: 'roster', code: st.code });
    const rows = (r && r.ok && r.list) || [];
    el.innerHTML = `<div class="card-done"><div class="big">🏁</div>
      <p>隨堂考結束！你答對 ${st.myScore}/${total} 題。</p></div>
      ${rows.length ? `<table class="board-tbl">
        <thead><tr><th>#</th><th>同學</th><th>得分</th></tr></thead>
        <tbody>${rows.slice(0, 10).map((x, i) => `<tr class="${x.nick === st.nick ? 'me' : ''}"><td>${i + 1}</td><td>${esc(x.nick)}</td><td>${x.score}</td></tr>`).join('')}</tbody></table>` : ''}
      <button class="btn ghost wide" onclick="VDApp.go('menu')">回主選單</button>`;
  }

  /* ── 老師主持面板（嵌在 teach.js 的 #liveBox） ── */
  let tEl = null, tTimer = 0, tState = null;
  const tGone = () => !tEl || !tEl.isConnected;

  function teacherPanel(container, t) {
    tEl = container;
    clearInterval(tTimer);
    tEl.innerHTML = `
      <p class="cloud-tip">全班同步搶答：學生到「對戰 → 📡 隨堂考」等待。建議每週 ≤5 場（珍惜雲端額度）。</p>
      <textarea id="lvWords" class="cloud-input" rows="3" style="width:100%" placeholder="題目字表（一行一個英文字，至少 12 個）"></textarea>
      <div class="cloud-row">
        <button class="btn ghost sm" id="lvCopy">⬇️ 帶入上方指派建立器的字表</button>
        <select id="lvQn" class="cloud-input"><option value="5">5 題</option><option value="10" selected>10 題</option><option value="15">15 題</option></select>
        <button class="btn" id="lvStart">🚀 開場</button>
      </div>
      <div id="lvMsg" class="cloud-msg" aria-live="polite"></div>
      <div id="lvGame"></div>`;
    tEl.querySelector('#lvCopy').onclick = () => {
      const src = document.getElementById('aWords');
      if (src) tEl.querySelector('#lvWords').value = src.value;
    };
    tEl.querySelector('#lvStart').onclick = async () => {
      const dict = new Map(VDApp.words().map(w => [w.word.toLowerCase(), w.word]));
      const words = [...new Set(tEl.querySelector('#lvWords').value.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean))].filter(w => dict.has(w));
      const m = tEl.querySelector('#lvMsg');
      if (words.length < 12) { m.textContent = '字表至少要 12 個字庫內的字（誘答選項才夠用）'; m.className = 'cloud-msg err'; return; }
      m.textContent = '開場中…'; m.className = 'cloud-msg ok';
      const r = await api({ op: 'start', code: t.code, pin: t.pin, qn: +tEl.querySelector('#lvQn').value, words });
      if (!r || !r.ok) { m.textContent = (r && r.error) || '連不上伺服器'; m.className = 'cloud-msg err'; return; }
      m.textContent = '';
      tState = { live: r.live, qs: buildQuestions(r.live.seed, r.live.words, r.live.qn) };
      paintTeacher(t);
      tTimer = setInterval(() => pollTeacher(t), POLL_MS);
    };
  }

  async function pollTeacher(t) {
    if (tGone()) return clearInterval(tTimer);
    const r = await api({ op: 'roster', code: tState.live.code || t.code });
    if (tGone()) return clearInterval(tTimer);
    if (r && r.ok) { tState.rows = r.list || []; paintRoster(); }
  }

  function paintTeacher(t) {
    const box = tEl.querySelector('#lvGame');
    const live = tState.live;
    const cur = live.qNo >= 1 && live.qNo <= tState.qs.length ? tState.qs[live.qNo - 1] : null;
    box.innerHTML = `
      <div class="cloud-h">${live.phase === 'lobby' ? '🕰️ 等待學生加入…' : live.phase === 'end' ? '🏁 已結束' : `第 ${live.qNo}/${live.qn} 題`}</div>
      ${cur ? `<div class="pg-hint">目前題目：<b>${esc(cur.prompt)}</b> → ${esc(cur.ans)}</div>` : ''}
      <div class="cloud-row">
        ${live.phase !== 'end' ? `<button class="btn" id="lvNext">${live.phase === 'lobby' ? '▶️ 出第 1 題' : live.qNo >= live.qn ? '🏁 結束並結算' : '⏭️ 下一題'}</button>
        <button class="btn ghost sm" id="lvEnd">提前結束</button>` : ''}
      </div>
      <div id="lvRoster"></div>`;
    const next = box.querySelector('#lvNext');
    if (next) next.onclick = () => ctl(t, 'next');
    const end = box.querySelector('#lvEnd');
    if (end) end.onclick = () => ctl(t, 'end');
    paintRoster();
    if (live.phase === 'end') { clearInterval(tTimer); paintFinal(); }
  }

  async function ctl(t, op) {
    const r = await api({ op, code: t.code, pin: t.pin });
    if (r && r.ok) { tState.live = r.live; paintTeacher(t); }
  }

  function paintRoster() {
    const box = tEl && tEl.querySelector('#lvRoster');
    if (!box) return;
    const rows = tState.rows || [];
    const live = tState.live;
    if (!rows.length) { box.innerHTML = '<div class="cloud-msg">還沒有學生加入</div>'; return; }
    // 逐題答對長條：hist 第 i 碼 = 該生第 i+1 題對錯
    const bars = live.qNo >= 1 ? Array.from({ length: live.qNo }, (_, i) => {
      const got = rows.filter(x => x.hist[i] === '1').length;
      const did = rows.filter(x => x.hist.length > i).length;
      return `<span class="cloud-tag">Q${i + 1}：${got}/${did}</span>`;
    }).join(' ') : '';
    box.innerHTML = `<div class="pg-hint">已加入 ${rows.length} 人${live.phase === 'q' ? `・本題已答 ${rows.filter(x => x.qNo >= live.qNo).length} 人` : ''}</div>
      ${bars ? `<div class="pg-hint">${bars}</div>` : ''}`;
  }

  function paintFinal() {
    const box = tEl.querySelector('#lvRoster');
    const rows = (tState.rows || []).slice().sort((a, b) => b.score - a.score);
    if (!rows.length) { box.innerHTML = '<div class="cloud-msg">沒有作答資料</div>'; return; }
    // 答錯最多的 3 題
    const miss = tState.qs.map((q, i) => ({ q, n: rows.filter(x => x.hist.length > i && x.hist[i] === '0').length }))
      .sort((a, b) => b.n - a.n).slice(0, 3).filter(x => x.n > 0);
    box.innerHTML = `
      <table class="board-tbl"><thead><tr><th>#</th><th>同學</th><th>得分</th></tr></thead>
      <tbody>${rows.slice(0, 10).map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.nick)}</td><td>${x.score}/${tState.qs.length}</td></tr>`).join('')}</tbody></table>
      ${miss.length ? `<div class="cloud-h">😵 答錯最多的題</div>${miss.map(x => `<div class="pg-hint">${esc(x.q.word)}（${esc(x.q.ans)}）——${x.n} 人錯</div>`).join('')}` : ''}`;
  }

  return { start, teacherPanel };
})();
window.VDLive = VDLive;
