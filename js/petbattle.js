/* 詞靈競技 VDPetBattle：野生試煉 10 層＋影子對戰。答題驅動：答對寵物出招、答錯敵方反擊。 */
const VDPetBattle = (() => {
  let el = null, words = [], state = null, locked = false;

  async function render(container) {
    el = container;
    el.innerHTML = '<div class="loading">整備競技場…</div>';
    await VDPets.init();
    words = VDApp.scopeWords();
    chooseMode();
  }

  /* ── 模式選擇 ── */
  function chooseMode() {
    const active = VDPets.active();
    if (!active) {
      el.innerHTML = `<div class="card-done"><div class="big">🐾</div>
        <p>還沒有出戰詞靈——先去結緣一隻吧！（首隻免費）</p>
        <button class="btn" onclick="VDApp.go('pets')">🐾 去詞靈夥伴</button>
        <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button></div>`;
      return;
    }
    const p = VDPets.list().find(x => x.id === active);
    const wild = VDPets.wild();
    const floor = VDPets.wildFloor;
    el.innerHTML = `
      <div class="wc-card">
        <img loading="lazy" decoding="async" class="wc-card-img" src="img/ui/h_arena.webp" alt="" onerror="this.remove()">
        <div class="wc-card-body">
          <p class="pg-hint">出戰：${p.ico} <b>${p.name}</b>　Lv.${p.lv}　⚔️${p.atk}　❤️${p.hp}　詞源之力 +${Math.round(p.power * 100)}%　<button class="btn small ghost" onclick="VDApp.go('pets')">換寵</button></p>
          <div class="pg-sub">🌿 野生試煉（過一層開一層，10 層後無限輪迴，越深掉越好的裝備）・重打已通關層今日全額獎勵剩 ${wildFullLeft()} 次</div>
          <div class="pb-floors">${Array.from({ length: Math.max(wild.length, floor) }, (_, i) => {
            const n = i + 1, open = n <= floor, f = floorDef(n);
            return `<button class="pb-floor ${open ? '' : 'locked'} t-${f.dropTier}" data-f="${n}" ${open ? '' : 'disabled'}>
              <span class="pb-fico">${open ? f.ico : '🔒'}</span>
              <b>第 ${n} 層</b><i>${f.name}・Lv.${f.lv}</i>
              <span class="pb-drop">${{ common: '🎁 普通', rare: '💠 稀有', legendary: '👑 傳說' }[f.dropTier]}${f.legBonus ? '↑' : ''}</span>
            </button>`;
          }).join('')}</div>
          <div class="pg-sub">👤 影子對戰（挑戰其他玩家的詞靈快照）</div>
          <div class="pb-shadowrow">
            <button class="btn" id="doShadow">👤 尋找影子對手（勝 +20／敗 −10）</button>
            <button class="btn ghost" id="doBoard">🏆 詞靈排行榜</button>
            <button class="btn ghost" id="doMarket">🏪 裝備市場</button>
            <span class="pg-hint">目前積分：<b>${VDPets.rating}</b></span>
          </div>
          <div class="pg-sub">⚡ 即時對戰（同教室兩台手機，同題對打）</div>
          <div class="pb-shadowrow">
            <button class="btn" id="rtCreate">⚡ 開房（拿 4 位數房號）</button>
            <input class="rt-join-in" id="rtCode" maxlength="4" inputmode="numeric" placeholder="輸入房號">
            <button class="btn ghost" id="rtJoin">加入</button>
          </div>
          <div class="pg-sub">📮 挑戰書（收到同學的 6 碼挑戰碼？打同一組題，比比誰的輸出高）</div>
          <div class="pb-shadowrow">
            <input class="rt-join-in" id="chCode" maxlength="6" placeholder="輸入挑戰碼">
            <button class="btn ghost" id="chAccept">應戰</button>
          </div>
          ${VDGame.weekVaultReady() ? `
          <div class="pb-vault">
            <span>👑 週末寶庫開啟——週任務達成的犒賞，必掉稀有以上裝備！</span>
            <button class="btn small" id="doVault">開寶庫</button>
          </div>` : ''}
        </div>
      </div>
      ${VDGame.milestoneHtml()}
      <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button>`;
    el.querySelectorAll('.pb-floor:not(.locked)').forEach(b => {
      b.onclick = () => startWild(+b.dataset.f);
    });
    el.querySelector('#doShadow').onclick = startShadow;
    el.querySelector('#doBoard').onclick = showBoard;
    el.querySelector('#doMarket').onclick = () => VDMarket.render(el);
    el.querySelector('#rtCreate').onclick = () => VDRT.create(el);
    el.querySelector('#rtJoin').onclick = () => {
      const code = el.querySelector('#rtCode').value.trim();
      if (!/^\d{4}$/.test(code)) return VDGame.toast('房號是 4 位數字');
      VDRT.join(el, code);
    };
    el.querySelector('#chAccept').onclick = () => {
      const code = el.querySelector('#chCode').value.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) return VDGame.toast('挑戰碼是 6 碼英數字');
      VDRT.accept(el, code);
    };
    const vault = el.querySelector('#doVault');
    if (vault) vault.onclick = () => {
      if (!VDGame.openWeekVault()) return;
      const item = VDPets.rollDrop(Math.random() < 0.15 ? 'legendary' : 'rare');
      const r = VDPets.addToBag(item);
      VDGame.toast(r.ok ? `👑 週末寶庫：獲得 ${item.name}！已收進背包` : `👑 獲得 ${item.name}——但${r.msg}`);
      chooseMode();
    };
  }

  /* ── 重打已通關層：每日前 3 次全額獎勵，之後字幣/裝備降為 10%（建材照舊），跨日重置 ── */
  const WILD_FULL_MAX = 3;
  function wildFullLeft() {
    const gg = VDGame.raw;
    if (gg.wildDay !== VDStore.today()) return WILD_FULL_MAX;
    return Math.max(0, WILD_FULL_MAX - (gg.wildFull || 0));
  }
  function useWildFull() { // 記一次重打，回傳這次是否仍屬全額
    const gg = VDGame.raw, t = VDStore.today();
    if (gg.wildDay !== t) { gg.wildDay = t; gg.wildFull = 0; }
    gg.wildFull = (gg.wildFull || 0) + 1;
    localStorage.setItem('vd_game', JSON.stringify(gg));
    return gg.wildFull <= WILD_FULL_MAX;
  }

  /* ── 開戰（wild／shadow／practice 共用引擎） ── */
  function startFight(foe, mode) {
    VDGame.onBattleStart();
    // 逃跑懲罰標記：結算時清除；殘留＝中途離開，下次載入判敗（練習賽不記）
    if (mode !== 'practice') localStorage.setItem('vd_pendingBattle', JSON.stringify({ mode: 'pet', ts: Date.now() }));
    const id = VDPets.active();
    const me = VDPets.list().find(x => x.id === id);
    const skills = VDPets.skillsOf(id).filter(s => s.unlocked).map(s => s.id);
    state = {
      mode, foe, me, skills,
      pHp: me.hp, pMax: me.hp,
      oHp: foe.hp, oMax: foe.hp,
      combo: 0, log: `${foe.name} 現身了！`
    };
    // 先聲奪人：開場先出一擊（半傷）
    if (skills.includes('first')) {
      const d = Math.round(dmgOf() / 2);
      state.oHp = Math.max(0, state.oHp - d);
      state.log = `⚡ 先聲奪人！開場先攻 −${d}`;
    }
    locked = false;
    nextRound();
  }

  function dmgOf() {
    let d = state.me.atk * (0.55 + Math.random() * 0.2);
    if (state.skills.includes('combo')) d *= 1 + state.combo * 0.15;
    else d *= 1 + state.combo * 0.06;
    if (state.skills.includes('lastres') && state.pHp < state.pMax * 0.3) d *= 1.5;
    if (state.skills.includes('resonate') && state.me.power > 0.6) d *= 1.25;
    return Math.max(1, Math.round(d));
  }

  function nextRound() {
    if (state.oHp <= 0) return finish(true);
    if (state.pHp <= 0) return finish(false);
    state.q = pickQuestion();
    locked = false;
    draw();
  }

  /* 第 11 層起出題強制混入錯題本字與 box≤1 低盒字各佔 30%（抓不到就 fallback 隨機）
     ——讓「打不過」的解法回到「去學字」 */
  function pickQuestion() {
    if (state.mode === 'wild' && state.foe.floorNo > 10) {
      const r = Math.random();
      let cand = null;
      if (r < 0.3) {
        const ws = VDStore.wrongWords(words);
        if (ws.length) cand = ws[Math.floor(Math.random() * ws.length)];
      } else if (r < 0.6) {
        const low = words.filter(w => { const b = VDStore.box(w.word); return b >= 0 && b <= 1; });
        if (low.length) cand = low[Math.floor(Math.random() * low.length)];
      }
      // 加權池：目標字灌 9 倍權重確保被抽中，誘答仍取自完整字表（重複字會被誘答挑選去重）
      if (cand) return VDQuiz.randomQuestion(new Array(words.length * 9).fill(cand).concat(words));
    }
    return VDQuiz.randomQuestion(words);
  }

  const hpBar = (hp, max, cls) => `<div class="bt-hp ${hp <= max * 0.3 ? 'low' : ''} ${cls}">
    <div class="bt-hp-fill" style="width:${Math.round(hp / max * 100)}%"></div><span>${hp}</span></div>`;

  function draw(midTurn) {
    const q = state.q, f = state.foe, m = state.me;
    const opts = q.options.map((o, i) =>
      `<button class="btn opt ${midTurn && o === q.ans ? 'right' : ''}" ${midTurn ? 'disabled' : `data-v="${encodeURIComponent(o)}"`}>
        <span class="opt-key">${'ABCD'[i]}</span><span class="opt-text">${o}</span></button>`).join('');
    el.innerHTML = `
      <div class="bt-arena">
        <div class="bt-side foe">
          <div class="pb-face">${f.img ? `<img loading="lazy" decoding="async" src="${f.img}" alt="" class="${f.hue ? 'pb-hue' : ''}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${f.ico}',style:'font-size:44px'}))">` : `<span style="font-size:44px">${f.ico}</span>`}</div>
          <div class="bt-name">${f.name}<span class="bt-tier">Lv.${f.lv}</span></div>
          ${hpBar(state.oHp, state.oMax, 'foe')}
        </div>
        <div class="bt-log">${state.log}</div>
        <div class="bt-side me">
          ${hpBar(state.pHp, state.pMax, 'me')}
          <div class="pb-face me">${`<img loading="lazy" decoding="async" src="img/pets/${m.id}_s${m.stage}.webp" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${m.ico}',style:'font-size:44px'}))">`}</div>
          <div class="bt-name">${m.deco || ''}${m.name} ${state.combo >= 2 ? `🔥×${state.combo}` : ''}</div>
        </div>
      </div>
      <div class="bt-q">
        <div class="quiz-prompt">${q.prompt}</div>
        <div class="quiz-sub">${q.sub}</div>
        <div class="quiz-opts">${opts}</div>
      </div>`;
    if (!midTurn) el.querySelectorAll('.opt').forEach(b => {
      b.onclick = () => onAnswer(decodeURIComponent(b.dataset.v));
    });
  }

  function onAnswer(v) {
    if (locked) return;
    locked = true;
    const correct = v === state.q.ans;
    VDStore.record(state.q.word, correct, 'battle');
    VDGame.onAnswer(correct, 'battle', state.combo);
    if (correct) {
      const d = dmgOf();
      state.oHp = Math.max(0, state.oHp - d);
      state.combo++;
      let extra = '';
      if (state.skills.includes('leech')) {
        const heal = Math.max(1, Math.round(d * 0.1));
        state.pHp = Math.min(state.pMax, state.pHp + heal);
        extra = `　🌿回血 +${heal}`;
      }
      state.log = `${state.me.ico} 命中！${state.foe.name} −${d}${extra}`;
    } else {
      state.combo = 0;
      if (Math.random() < state.foe.acc) {
        let d = Math.round(state.foe.atk * (0.5 + Math.random() * 0.25));
        if (state.skills.includes('guard')) d = Math.max(1, Math.round(d * 0.8));
        state.pHp = Math.max(0, state.pHp - d);
        state.log = `💢 答錯！${state.foe.name} 反擊 −${d}${state.skills.includes('guard') ? '（🛡️已減傷）' : ''}`;
      } else {
        state.log = `😮‍💨 答錯……但 ${state.foe.name} 撲空了！`;
      }
    }
    draw(true);
    setTimeout(nextRound, correct ? 850 : 1250);
  }

  /* ── 結算 ── */
  function finish(win) {
    localStorage.removeItem('vd_pendingBattle'); // 已結算，清逃跑標記
    VDGame.onBattleFinish();  // 每日對戰任務：結算才計數
    const { mode, foe, me } = state;
    let dropHtml = '', coins = 0;
    if (win && mode === 'wild') {
      VDPets.clearWild(foe.floorNo);
      const full = foe.replay ? useWildFull() : true; // 重打已通關層：每日前 3 次全額
      coins = 15 + foe.floorNo * 5;
      if (!full) coins = Math.max(1, Math.round(coins * 0.1));
      VDGame.raw.coins += coins;
      localStorage.setItem('vd_game', JSON.stringify(VDGame.raw));
      // 城鎮補給：徵戰勝利掉建材（層數越深越多）——降獎勵時建材照舊
      if (window.VDTown && VDTown.raw) {
        const loot = VDTown.battleLoot(foe.floorNo);
        VDGame.toast('🏰 城鎮補給：' + Object.entries(loot).map(([k, v]) => `${VDTown.RES_META[k].ico}+${v}`).join(' '));
      }
      // 高層輪迴：legBonus 機率把掉落升為傳說
      const tier = foe.legBonus && Math.random() < foe.legBonus ? 'legendary' : foe.dropTier;
      const drop = (full || Math.random() < 0.1) ? VDPets.rollDrop(tier) : null;
      if (drop) {
        dropHtml = `
        <div class="pb-dropcard t-${drop.tier}">
          <div class="pb-dropico">${drop.ico}</div>
          <b>${drop.name}</b><i>${drop.atk ? '⚔️ +' + drop.atk : '❤️ +' + drop.hp}・${VDPets.SLOT_NAME[drop.slot]}${drop.perk ? `・${VDPets.PERKS[drop.perk].ico} ${VDPets.PERKS[drop.perk].name}` : ''}</i>
          <button class="btn small" id="doEquip">裝上 ${me.name}</button>
          <button class="btn ghost small" id="doBag">收進背包</button>
        </div>`;
        state.drop = drop;
      }
      if (!full) dropHtml = `<div class="pg-hint">📉 今日全額獎勵已用完——重打已通關層字幣/裝備降為 10%（建材照舊），明天重置</div>` + dropHtml;
    }
    let ratingHtml = '';
    if (mode === 'shadow') {
      const pts = win ? VDPets.petWin() : VDPets.petLose();
      ratingHtml = `<div class="bt-rankdelta ${win ? 'up' : 'down'}">⚔️ 競技積分 ${win ? '+20' : '−10'}（${pts}）${win ? `・🏛️ lifetime 累計 +20（總 ${VDPets.lifetime()}，城鎮兌換基準）` : ''}</div>`;
      if (win) { VDGame.raw.coins += 25; coins = 25; localStorage.setItem('vd_game', JSON.stringify(VDGame.raw)); }
      submitSnapshot();
    }
    if (mode === 'practice') ratingHtml = `<div class="pg-hint">🎈 練習賽無獎勵——連上雲端再打影子對戰拿積分！</div>`;
    el.innerHTML = `<div class="card-done">
      <div class="big">${win ? '🏆' : '💀'}</div>
      <p>${win ? `${me.name} 擊敗了 ${foe.name}！` : `${me.name} 不敵 ${foe.name}……多學幾個家族字再來！`}</p>
      ${coins ? `<div class="pg-hint">💰 +${coins} 字幣</div>` : ''}
      ${dropHtml}${ratingHtml}
      ${VDGame.milestoneHtml()}
      <button class="btn" id="doAgain">再戰</button>
      <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button>
    </div>`;
    const eq = el.querySelector('#doEquip'), bagBtn = el.querySelector('#doBag');
    const claimDrop = (label) => {
      if (eq) eq.remove();
      if (bagBtn) bagBtn.replaceWith(Object.assign(document.createElement('span'), { textContent: label, className: 'pg-hint' }));
    };
    if (eq) eq.onclick = () => {
      VDPets.equip(me.id, state.drop);
      VDGame.toast(`已裝上：${state.drop.name}`);
      claimDrop('✅ 已裝備');
    };
    if (bagBtn) bagBtn.onclick = () => {
      const r = VDPets.addToBag(state.drop);
      VDGame.toast(r.ok ? '已收進背包' : r.msg);
      if (r.ok) claimDrop('🎒 已入包');
    };
    el.querySelector('#doAgain').onclick = chooseMode;
  }

  /* ── 野生：無限爬塔敵人公式生成 ──
     1–10 層照 pets.json；第 11 層起以 10 層一循環（名字加「・輪迴 N」），
     血/攻按 1 + 0.15*(floor-10) 放大；高層 legendary 掉落權重隨層數提升 */
  function floorDef(n) {
    const wild = VDPets.wild();
    const base = wild[(n - 1) % wild.length];
    if (n <= wild.length)
      return { name: base.name, ico: base.ico, lv: base.lv, acc: base.acc, dropTier: base.dropTier, floorNo: n, atk: 10 + 2 * base.lv, hp: 80 + 6 * base.lv };
    const k = 1 + 0.15 * (n - 10);
    const cycle = Math.ceil((n - wild.length) / wild.length);
    return {
      name: `${base.name}・輪迴 ${cycle}`, ico: base.ico,
      lv: Math.round(base.lv * k),
      acc: Math.min(0.92, base.acc + 0.02 * cycle),
      dropTier: base.dropTier === 'common' ? 'rare' : base.dropTier,
      legBonus: Math.min(0.5, 0.05 * (n - 10)),   // 掉落時有機會升為傳說
      floorNo: n,
      atk: Math.round((10 + 2 * base.lv) * k),
      hp: Math.round((80 + 6 * base.lv) * k)
    };
  }
  function startWild(n) {
    const w = floorDef(n);
    startFight({ ...w, replay: n < VDPets.wildFloor, hue: true }, 'wild'); // replay＝已通關層重打
  }

  /* ── 影子對戰（Task 6 接雲端；離線退本機幻影） ── */
  async function startShadow() {
    el.innerHTML = '<div class="loading">連線中……尋找影子對手</div>';
    let opp = null;
    try {
      const r = await fetch('api/pets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'opponent', rating: VDPets.rating })
      });
      if (r.ok) opp = (await r.json()).opponent;
    } catch { /* 離線 */ }
    let practice = false;
    if (!opp) {
      // 幻影對手：以自己為藍本 ±20%——離線打的是練習賽，不發積分與字幣
      practice = true;
      const me = VDPets.list().find(x => x.id === VDPets.active());
      const k = 0.85 + Math.random() * 0.35;
      opp = { nick: '迷霧幻影', petId: me.id, petName: me.name, lv: me.lv, atk: Math.max(5, Math.round(me.atk * k)), hp: Math.round(me.hp * k), skills: [] };
      VDGame.toast('沒連上雲端，先跟幻影打場練習賽（無獎勵）！');
    }
    startFight({
      name: `${VDGame.esc(opp.nick)} 的 ${VDGame.esc(opp.petName)}${practice ? '（練習賽）' : ''}`, ico: '👤', lv: opp.lv,
      acc: Math.min(0.9, 0.5 + 0.35 * Math.min(1, opp.atk / Math.max(1, VDPets.atk(VDPets.active())))),
      atk: opp.atk, hp: opp.hp,
      img: `img/pets/${opp.petId}_s${VDPets.stageOf(opp.lv)}.webp`, hue: true
    }, practice ? 'practice' : 'shadow');
  }
  async function submitSnapshot() {
    const snap = VDPets.snapshot();
    if (!snap) return;
    try {
      await fetch('api/pets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'submit', snap })
      });
    } catch { /* 離線不阻斷 */ }
  }

  /* ── 排行榜 ── */
  async function showBoard() {
    el.innerHTML = '<div class="loading">讀取排行榜…</div>';
    let rows = [];
    try {
      const r = await fetch('api/pets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'board' })
      });
      if (r.ok) rows = (await r.json()).board || [];
    } catch { /* 離線 */ }
    el.innerHTML = `
      <div class="wc-card"><div class="wc-card-body">
        <h2>🏆 詞靈排行榜</h2>
        ${rows.length ? `<div class="pb-board">${rows.map((b, i) => `
          <div class="pb-brow ${b.nick === VDGame.heroName() ? 'me' : ''}">
            <span class="pb-rank">${['🥇', '🥈', '🥉'][i] || i + 1}</span>
            <span class="pb-bnick">${b.nick}</span>
            <span class="pb-bpet">${b.petName} Lv.${b.lv}</span>
            <b>${b.rating}</b>
          </div>`).join('')}</div>` : '<p class="pg-hint">還沒有人上榜——去打一場影子對戰，你就是第一名！</p>'}
        <button class="btn ghost" id="backMode">← 回競技場</button>
      </div></div>`;
    el.querySelector('#backMode').onclick = chooseMode;
  }

  return { render };
})();
window.VDPetBattle = VDPetBattle;
