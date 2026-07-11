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
        <img class="wc-card-img" src="img/ui/h_arena.png" alt="" onerror="this.remove()">
        <div class="wc-card-body">
          <p class="pg-hint">出戰：${p.ico} <b>${p.name}</b>　Lv.${p.lv}　⚔️${p.atk}　❤️${p.hp}　詞源之力 +${Math.round(p.power * 100)}%　<button class="btn small ghost" onclick="VDApp.go('pets')">換寵</button></p>
          <div class="pg-sub">🌿 野生試煉（過一層開一層，越深掉越好的裝備）</div>
          <div class="pb-floors">${wild.map((f, i) => {
            const n = i + 1, open = n <= floor;
            return `<button class="pb-floor ${open ? '' : 'locked'} t-${f.dropTier}" data-f="${i}" ${open ? '' : 'disabled'}>
              <span class="pb-fico">${open ? f.ico : '🔒'}</span>
              <b>第 ${n} 層</b><i>${f.name}・Lv.${f.lv}</i>
              <span class="pb-drop">${{ common: '🎁 普通', rare: '💠 稀有', legendary: '👑 傳說' }[f.dropTier]}</span>
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
    const vault = el.querySelector('#doVault');
    if (vault) vault.onclick = () => {
      if (!VDGame.openWeekVault()) return;
      const item = VDPets.rollDrop(Math.random() < 0.15 ? 'legendary' : 'rare');
      const r = VDPets.addToBag(item);
      VDGame.toast(r.ok ? `👑 週末寶庫：獲得 ${item.name}！已收進背包` : `👑 獲得 ${item.name}——但${r.msg}`);
      chooseMode();
    };
  }

  /* ── 開戰（wild 或 shadow 共用引擎） ── */
  function startFight(foe, mode) {
    VDGame.onBattleStart();   // 詞靈對戰同樣計入每日對戰任務
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
    state.q = VDQuiz.randomQuestion(words);
    locked = false;
    draw();
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
          <div class="pb-face">${f.img ? `<img src="${f.img}" alt="" class="${f.hue ? 'pb-hue' : ''}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${f.ico}',style:'font-size:44px'}))">` : `<span style="font-size:44px">${f.ico}</span>`}</div>
          <div class="bt-name">${f.name}<span class="bt-tier">Lv.${f.lv}</span></div>
          ${hpBar(state.oHp, state.oMax, 'foe')}
        </div>
        <div class="bt-log">${state.log}</div>
        <div class="bt-side me">
          ${hpBar(state.pHp, state.pMax, 'me')}
          <div class="pb-face me">${`<img src="img/pets/${m.id}_s${m.stage}.png" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${m.ico}',style:'font-size:44px'}))">`}</div>
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
    VDStore.record(state.q.word, correct);
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
    const { mode, foe, me } = state;
    let dropHtml = '', coins = 0;
    if (win && mode === 'wild') {
      VDPets.clearWild(foe.floorNo);
      coins = 15 + foe.floorNo * 5;
      VDGame.raw.coins += coins;
      localStorage.setItem('vd_game', JSON.stringify(VDGame.raw));
      const drop = VDPets.rollDrop(foe.dropTier);
      dropHtml = `
        <div class="pb-dropcard t-${drop.tier}">
          <div class="pb-dropico">${drop.ico}</div>
          <b>${drop.name}</b><i>${drop.atk ? '⚔️ +' + drop.atk : '❤️ +' + drop.hp}・${VDPets.SLOT_NAME[drop.slot]}${drop.perk ? `・${VDPets.PERKS[drop.perk].ico} ${VDPets.PERKS[drop.perk].name}` : ''}</i>
          <button class="btn small" id="doEquip">裝上 ${me.name}</button>
          <button class="btn ghost small" id="doBag">收進背包</button>
        </div>`;
      state.drop = drop;
    }
    let ratingHtml = '';
    if (mode === 'shadow') {
      const pts = win ? VDPets.petWin() : VDPets.petLose();
      ratingHtml = `<div class="bt-rankdelta ${win ? 'up' : 'down'}">⚔️ 競技積分 ${win ? '+20' : '−10'}（${pts}）</div>`;
      if (win) { VDGame.raw.coins += 25; coins = 25; localStorage.setItem('vd_game', JSON.stringify(VDGame.raw)); }
      submitSnapshot();
    }
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

  /* ── 野生 ── */
  function startWild(i) {
    const w = VDPets.wild()[i];
    // 敵人數值以層級推：atk/hp 用同公式（無詞源之力）
    startFight({
      name: w.name, ico: w.ico, lv: w.lv, acc: w.acc, dropTier: w.dropTier, floorNo: i + 1,
      atk: 10 + 2 * w.lv, hp: 80 + 6 * w.lv, hue: true
    }, 'wild');
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
    if (!opp) {
      // 幻影對手：以自己為藍本 ±20%
      const me = VDPets.list().find(x => x.id === VDPets.active());
      const k = 0.85 + Math.random() * 0.35;
      opp = { nick: '迷霧幻影', petId: me.id, petName: me.name, lv: me.lv, atk: Math.max(5, Math.round(me.atk * k)), hp: Math.round(me.hp * k), skills: [] };
      VDGame.toast('沒連上雲端，先跟幻影過招！');
    }
    startFight({
      name: `${opp.nick} 的 ${opp.petName}`, ico: '👤', lv: opp.lv,
      acc: Math.min(0.9, 0.5 + 0.35 * Math.min(1, opp.atk / Math.max(1, VDPets.atk(VDPets.active())))),
      atk: opp.atk, hp: opp.hp,
      img: `img/pets/${opp.petId}_s${VDPets.stageOf(opp.lv)}.png`, hue: true
    }, 'shadow');
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
