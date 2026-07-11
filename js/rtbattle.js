/* 即時對戰 VDRT：4 位數房號、雙方同 seed 出同 20 題、Upstash 輪詢同步。
   傷害權威在攻擊方：各自上報累計輸出 dmg，對方血量 = 對方最大血 − 我的 dmg。
   速度加成：剩越多秒傷害越高。對方 20 秒無心跳判勝。 */
const VDRT = (() => {
  const ROUNDS = 20, ROUND_SEC = 15, POLL_MS = 1500, DEAD_MS = 20000;
  let el = null, room = null, my = null, oppSnap = null, qs = [], st = null;
  let pollTimer = 0, tickTimer = 0;

  /* 可重現亂數：雙方同 seed → 同題同選項 */
  function mulberry(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function buildQuestions(seed, scope) {
    const rng = mulberry(seed);
    const pool = VDApp.words().filter(w => w.level === scope);
    const words = (pool.length >= 40 ? pool : VDApp.words()).slice()
      .sort((a, b) => a.word < b.word ? -1 : 1);
    const pick = [];
    const used = new Set();
    while (pick.length < ROUNDS && used.size < words.length) {
      const i = Math.floor(rng() * words.length);
      if (used.has(i)) continue;
      used.add(i); pick.push(words[i]);
    }
    return pick.map(w => {
      const opts = [w.zh];
      const seen = new Set([w.word]);
      while (opts.length < 4) {
        const d = words[Math.floor(rng() * words.length)];
        if (seen.has(d.word) || opts.includes(d.zh)) continue;
        seen.add(d.word); opts.push(d.zh);
      }
      // seeded shuffle
      for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
      }
      return { word: w.word, ans: w.zh, options: opts };
    });
  }

  async function api(body) {
    try {
      const r = await fetch('api/room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return await r.json();
    } catch { return null; }
  }

  function mySnap() {
    const id = VDPets.active();
    const p = VDPets.list().find(x => x.id === id);
    return {
      nick: VDGame.heroName(), petId: id, petName: p.name,
      lv: p.lv, atk: p.atk, hp: p.hp, scope: VDStore.stage || 'E'
    };
  }

  /* ── 入口：開房／加入 ── */
  async function create(container) {
    el = container;
    my = mySnap();
    el.innerHTML = '<div class="loading">開設對戰房間…</div>';
    const r = await api({ op: 'create', snap: my });
    if (!r || !r.ok) return offline();
    room = { code: r.code, role: 'p1', seed: r.seed, scope: my.scope };
    lobby();
  }
  async function join(container, code) {
    el = container;
    my = mySnap();
    el.innerHTML = '<div class="loading">加入房間…</div>';
    const r = await api({ op: 'join', code, snap: my });
    if (!r) return offline();
    if (!r.ok) {
      el.innerHTML = `<div class="card-done"><div class="big">🚪</div><p>${r.error || '加不進去'}</p>
        <button class="btn ghost" onclick="VDApp.go('petbattle')">← 回競技場</button></div>`;
      return;
    }
    room = { code, role: 'p2', seed: r.seed, scope: r.scope };
    oppSnap = r.opp;
    start();
  }
  function offline() {
    el.innerHTML = `<div class="card-done"><div class="big">📡</div><p>連不上對戰伺服器（本機模式沒有後端）。</p>
      <button class="btn ghost" onclick="VDApp.go('petbattle')">← 回競技場</button></div>`;
  }

  /* 房主等待對手 */
  function lobby() {
    let dots = 0;
    el.innerHTML = `<div class="card-done">
      <div class="big">⚡</div>
      <p>房間開好了——請同學在「即時對戰」輸入房號：</p>
      <div class="rt-code">${room.code}</div>
      <p class="pg-hint" id="rt-wait">等待對手加入…</p>
      <button class="btn ghost" id="rtCancel">取消</button>
    </div>`;
    el.querySelector('#rtCancel').onclick = () => { stopTimers(); VDApp.go('petbattle'); };
    pollTimer = setInterval(async () => {
      const r = await api({ op: 'poll', code: room.code, role: 'p1' });
      const w = el.querySelector('#rt-wait');
      if (w) w.textContent = '等待對手加入' + '.'.repeat((dots = (dots + 1) % 4));
      if (r && r.ok && r.opp && r.opp.snap) {
        oppSnap = r.opp.snap;
        stopTimers();
        start();
      }
    }, POLL_MS);
  }

  /* ── 開打 ── */
  function start() {
    qs = buildQuestions(room.seed, room.scope);
    st = {
      round: 0, combo: 0, correct: 0, dmg: 0, done: false,
      oppDmg: 0, oppRound: 0, oppCombo: 0, oppDone: false, oppHb: Date.now(),
      deadline: 0, locked: false, finished: false
    };
    VDGame.onBattleStart();
    push();
    pollTimer = setInterval(poll, POLL_MS);
    nextRound();
  }
  function stopTimers() { clearInterval(pollTimer); clearInterval(tickTimer); pollTimer = tickTimer = 0; }

  function myHp() { return Math.max(0, my.hp - st.oppDmg); }
  function oppHp() { return oppSnap ? Math.max(0, oppSnap.hp - st.dmg) : 0; }

  async function push() {
    await api({
      op: 'push', code: room.code, role: room.role,
      state: { dmg: st.dmg, round: st.round, combo: st.combo, correct: st.correct, done: st.done }
    });
  }
  async function poll() {
    if (st.finished) return;
    const r = await api({ op: 'poll', code: room.code, role: room.role });
    if (!r || !r.ok) return;
    if (r.opp && r.opp.state) {
      st.oppDmg = r.opp.state.dmg;
      st.oppRound = r.opp.state.round;
      st.oppCombo = r.opp.state.combo;
      st.oppDone = !!r.opp.state.done;
      st.oppHb = r.opp.hb;
      paintHud();
    }
    // 勝負判定
    if (myHp() <= 0) return finish(false, '');
    if (oppHp() <= 0) return finish(true, '');
    if (st.done && st.oppDone) return finish(myHp() > oppHp() ? true : myHp() < oppHp() ? false : null, '雙方答完，比剩餘血量');
    if (r.now && r.opp && r.now - st.oppHb > DEAD_MS) return finish(true, '對手斷線');
    if (st.done && !st.oppDone) {
      const w = el.querySelector('#rt-log');
      if (w) w.textContent = '你已答完 20 題——等待對手…';
    }
  }

  function nextRound() {
    if (st.finished) return;
    if (st.round >= ROUNDS) {
      st.done = true; push();
      paint(null);
      return;
    }
    st.q = qs[st.round];
    st.locked = false;
    st.deadline = Date.now() + ROUND_SEC * 1000;
    clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      if (st.finished) return clearInterval(tickTimer);
      const left = Math.max(0, Math.ceil((st.deadline - Date.now()) / 1000));
      const t = el.querySelector('#rt-timer');
      if (t) { t.textContent = left + 's'; t.classList.toggle('danger', left <= 5); }
      if (left <= 0 && !st.locked) answer(null); // 逾時算答錯
    }, 250);
    paint(st.q);
  }

  function answer(v) {
    if (st.locked || st.finished) return;
    st.locked = true;
    const correct = v !== null && v === st.q.ans;
    VDStore.record(st.q.word, correct);
    VDGame.onAnswer(correct, 'battle', st.combo + (correct ? 1 : 0));
    let log;
    if (correct) {
      const left = Math.max(0, Math.ceil((st.deadline - Date.now()) / 1000));
      const dmg = Math.round(my.atk * 0.6 * (1 + st.combo * 0.1)) + left; // 剩秒＝速度加成
      st.dmg += dmg; st.combo++; st.correct++;
      log = `⚔️ 命中 +${dmg}（速度加成 +${left}）${st.combo >= 2 ? `・連擊 ×${st.combo}` : ''}`;
    } else {
      st.combo = 0;
      log = v === null ? '⏰ 時間到——這題沒拿到傷害' : '❌ 答錯——沒造成傷害';
    }
    st.round++;
    push();
    const lg = el.querySelector('#rt-log');
    if (lg) lg.textContent = log;
    setTimeout(nextRound, 900);
  }

  function hpBar(hp, max, cls) {
    const pct = Math.max(0, Math.round(hp / max * 100));
    return `<div class="bt-hp ${pct <= 30 ? 'low' : ''} ${cls}"><div class="bt-hp-fill" style="width:${pct}%"></div><span>${hp}</span></div>`;
  }
  function paintHud() {
    const foe = el.querySelector('#rt-foehp'), me = el.querySelector('#rt-myhp'), pr = el.querySelector('#rt-opprog');
    if (foe && oppSnap) foe.innerHTML = hpBar(oppHp(), oppSnap.hp, 'foe');
    if (me) me.innerHTML = hpBar(myHp(), my.hp, 'me');
    if (pr && oppSnap) pr.textContent = `${oppSnap.nick} 進度 ${Math.min(ROUNDS, st.oppRound)}/${ROUNDS}${st.oppCombo >= 2 ? `・🔥×${st.oppCombo}` : ''}`;
  }

  function paint(q) {
    el.innerHTML = `
      <div class="bt-arena">
        <div class="bt-side foe">
          <div class="bt-name">${oppSnap.nick} 的 ${oppSnap.petName}（Lv.${oppSnap.lv}）</div>
          <div id="rt-foehp">${hpBar(oppHp(), oppSnap.hp, 'foe')}</div>
          <div class="bt-assist" id="rt-opprog">${oppSnap.nick} 進度 ${Math.min(ROUNDS, st.oppRound)}/${ROUNDS}</div>
        </div>
        <div class="bt-log" id="rt-log">第 ${Math.min(ROUNDS, st.round + 1)}/${ROUNDS} 題</div>
        <div class="bt-side me">
          <div id="rt-myhp">${hpBar(myHp(), my.hp, 'me')}</div>
          <div class="bt-name">${my.nick} 的 ${my.petName} ${st.combo >= 2 ? `🔥×${st.combo}` : ''}</div>
        </div>
      </div>
      ${q ? `
      <div class="bt-q">
        <div class="rt-hud"><span id="rt-timer">${ROUND_SEC}s</span><span>第 ${st.round + 1}/${ROUNDS} 題</span></div>
        <div class="quiz-prompt">${q.word}</div>
        <div class="quiz-sub">選出正確意思</div>
        <div class="quiz-opts">${q.options.map((o, i) =>
          `<button class="btn opt" data-v="${encodeURIComponent(o)}"><span class="opt-key">${'ABCD'[i]}</span><span class="opt-text">${o}</span></button>`).join('')}</div>
      </div>` : `
      <div class="card-done"><div class="big">⌛</div><p>你已答完 ${ROUNDS} 題（答對 ${st.correct}）——等待對手收尾…</p></div>`}`;
    el.querySelectorAll('.opt').forEach(b => b.onclick = () => answer(decodeURIComponent(b.dataset.v)));
  }

  function finish(win, note) {
    if (st.finished) return;
    st.finished = true; st.done = true;
    stopTimers();
    push();
    let ratingHtml = '';
    if (win === true) { const pts = VDPets.petWin(); VDGame.raw.coins += 25; localStorage.setItem('vd_game', JSON.stringify(VDGame.raw)); ratingHtml = `<div class="bt-rankdelta up">⚔️ 競技積分 +20（${pts}）・💰 +25 字幣</div>`; }
    else if (win === false) { const pts = VDPets.petLose(); ratingHtml = `<div class="bt-rankdelta down">⚔️ 競技積分 −10（${pts}）</div>`; }
    el.innerHTML = `<div class="card-done">
      <div class="big">${win === true ? '🏆' : win === false ? '💀' : '🤝'}</div>
      <p>${win === true ? `擊敗 ${oppSnap ? oppSnap.nick : '對手'}！` : win === false ? `不敵 ${oppSnap ? oppSnap.nick : '對手'}……` : '平手！'}</p>
      ${note ? `<div class="pg-hint">${note}</div>` : ''}
      <div class="pg-hint">你答對 ${st.correct}/${ROUNDS}・總輸出 ${st.dmg}</div>
      ${ratingHtml}
      ${VDGame.milestoneHtml()}
      <button class="btn" onclick="VDApp.go('petbattle')">回競技場</button>
      <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button>
    </div>`;
  }

  return { create, join, _build: buildQuestions };
})();
window.VDRT = VDRT;
