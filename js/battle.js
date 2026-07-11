/* 文學家對戰：回合制答題對戰。移植文人鬥法手感（血量／連擊／背水一戰），複用 VDQuiz 出題器 */
const VDBattle = (() => {
  /* 8 位古典作家對手：四難度梯度，各配字級範圍與電腦答對率 */
  const OPPONENTS = [
    { id: 'andersen',    name: '安徒生',   tier: '入門', emoji: '🦢', acc: 0.55, levels: ['E'],
      taunt: '孩子，說個故事給你聽——先過我這關吧。', win: '你的字彙像未完成的童話，再多讀幾頁吧。', lose: '了不起！你替這個故事寫了美好結局。' },
    { id: 'aesop',       name: '伊索',     tier: '入門', emoji: '🦊', acc: 0.55, levels: ['E'],
      taunt: '每則寓言都有教訓，這場也是。', win: '慢工出細活，龜兔賽跑你當了兔子。', lose: '智慧勝過蠻力，這寓言你懂了。' },
    { id: 'twain',       name: '馬克吐溫', tier: '進階', emoji: '🚂', acc: 0.68, levels: ['E', 'J'],
      taunt: '真相比小說離奇，你的實力呢？', win: '戒菸容易，戒掉輸給我很難吧？', lose: '幽默地認輸——你贏得漂亮。' },
    { id: 'austen',      name: '珍奧斯汀', tier: '進階', emoji: '🎩', acc: 0.68, levels: ['E', 'J'],
      taunt: '傲慢與偏見，你缺的是實力。', win: '這門親事……我是說這場對決，你還不夠格。', lose: '真是理性與感性兼備的對手。' },
    { id: 'hemingway',   name: '海明威',   tier: '高手', emoji: '🎣', acc: 0.80, levels: ['S1', 'S2', 'S3'],
      taunt: '簡潔就是力量。廢話少說，接招。', win: '老人與海，你是那條沒釣上的魚。', lose: '人可以被毀滅，但不能被打敗——你證明了。' },
    { id: 'dickens',     name: '狄更斯',   tier: '高手', emoji: '🕯️', acc: 0.80, levels: ['S1', 'S2', 'S3'],
      taunt: '這是最好的時代，也是你最壞的對手。', win: '遠大前程？你的字彙還在孤雛時期。', lose: '雙城記裡最好的結局，屬於你。' },
    { id: 'shakespeare', name: '莎士比亞', tier: '宗師', emoji: '🎭', acc: 0.90, levels: ['S4', 'S5', 'S6'],
      taunt: 'To quiz, or not to quiz——你已無退路。', win: '結束了，這場戲你只是配角。', lose: 'All\'s well that ends well——你是主角。' },
    { id: 'tolstoy',     name: '托爾斯泰', tier: '宗師', emoji: '📚', acc: 0.90, levels: ['S4', 'S5', 'S6'],
      taunt: '幸福的答題者都相似，你是哪一種？', win: '戰爭與和平，你輸在戰爭。', lose: '安娜卡列尼娜也會為你這場勝利落淚。' }
  ];

  const MAX_HP = 100;
  let mode = 'cpu';           // 'cpu' | 'pvp'
  let opp = null;             // 當前對手
  let words = [];             // 對手字級範圍內的字表
  let el = null;
  let state = null;           // 對戰狀態
  let locked = false;

  function scopedWords(levels) {
    const set = new Set(levels);
    return VDApp.words().filter(w => set.has(w.level));
  }

  /* 作家頭像：3D Pixel Q版圖，載入失敗自動退回 emoji */
  function face(o, big) {
    const cls = 'bt-portrait' + (big ? ' big' : '');
    return `<img src="img/authors/${o.id}.png" alt="${o.name}" class="${cls}"
      onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${o.emoji}',className:'bt-face-emoji${big ? ' big' : ''}'}))">`;
  }

  /* ── 選單：模式 → 對手 ── */
  function chooseMode(container) {
    el = container;
    el.innerHTML = `
      <div class="bt-pick">
        <button class="btn main" id="mCpu">🤖 挑戰文學家<br><span>單人闖八關</span></button>
        <button class="btn main" id="mPvp">👥 同機雙人<br><span>兩人輪流搶答</span></button>
      </div>`;
    el.querySelector('#mCpu').onclick = () => { mode = 'cpu'; chooseOpponent(); };
    el.querySelector('#mPvp').onclick = () => { mode = 'pvp'; startPvp(); };
  }

  function chooseOpponent() {
    el.innerHTML = `<div class="bt-oppgrid">${OPPONENTS.map(o => {
      const open = VDGame.tierUnlocked(o.tier);
      return `<button class="bt-oppcard ${open ? '' : 'locked'}" data-id="${o.id}" data-open="${open ? 1 : 0}">
        <div class="bt-face">${open ? face(o) : '<span class="bt-face-emoji">🔒</span>'}</div>
        <div class="bt-name">${o.name}</div>
        <div class="bt-tier t-${o.tier}">${o.tier}</div>
        ${open ? '' : `<div class="bt-locknote">Lv${VDGame.tierNeed(o.tier)} 解鎖</div>`}
      </button>`;
    }).join('')}</div>
    <div class="bt-lockhint">升等（練習／對戰賺 XP）就能解鎖更強的文學家。</div>`;
    el.querySelectorAll('.bt-oppcard').forEach(b => {
      b.onclick = () => {
        if (b.dataset.open === '0') { VDGame.toast(`這位文學家要 Lv${VDGame.tierNeed(OPPONENTS.find(o => o.id === b.dataset.id).tier)} 才能挑戰`); return; }
        startCpu(OPPONENTS.find(o => o.id === b.dataset.id));
      };
    });
  }

  /* ── 單人對戰 ── */
  function startCpu(o) {
    opp = o;
    words = scopedWords(o.levels);
    state = { pHp: MAX_HP, oHp: MAX_HP, combo: 0, round: 0, log: opp.taunt, comeback: false };
    locked = false;
    VDGame.onBattleStart();
    nextRound();
  }

  function nextRound() {
    if (state.oHp <= 0) return finish(true);
    if (state.pHp <= 0) return finish(false);
    state.round++;
    state.q = VDQuiz.randomQuestion(words);
    locked = false;
    renderCpu();
  }

  /* 傷害計算：底 12＋連擊聚氣，血量<30 背水一戰 1.5 倍 */
  function playerDamage() {
    let dmg = 12 + state.combo * 3;
    if (state.pHp < 30) dmg = Math.round(dmg * 1.5);
    return dmg;
  }

  function onPlayerAnswer(v) {
    if (locked) return;
    locked = true;
    const correct = v === state.q.ans;
    VDStore.record(state.q.word, correct);
    VDGame.onAnswer(correct, 'battle', state.combo + (correct ? 1 : 0));
    if (state.pHp < 30) state.comeback = true;
    if (correct) {
      const dmg = playerDamage();
      state.oHp = Math.max(0, state.oHp - dmg);
      state.combo++;
      state.log = `命中！對 ${opp.name} 造成 ${dmg} 點傷害${state.combo >= 2 ? `（連擊 ×${state.combo}）` : ''}`;
    } else {
      state.combo = 0;
      state.pHp = Math.max(0, state.pHp - 8);
      state.log = `答錯！${opp.name} 趁隙反擊，你 -8`;
    }
    renderCpu(true);
    // 電腦回合
    setTimeout(() => {
      if (state.oHp <= 0) return finish(true);
      if (state.pHp <= 0) return finish(false);
      const hit = Math.random() < opp.acc;
      if (hit) {
        const dmg = 8 + Math.round(opp.acc * 8);
        state.pHp = Math.max(0, state.pHp - dmg);
        state.log = `${opp.name} 出招——你受到 ${dmg} 點傷害`;
      } else {
        state.oHp = Math.max(0, state.oHp - 4);
        state.log = `${opp.name} 一時語塞，自損 4`;
      }
      renderCpu(true);
      setTimeout(nextRound, 1100);
    }, correct ? 800 : 1300);
  }

  /* 選項按鈕：字母徽章＋內文，與自測／會考統一 */
  function optBtn(o, i, extra, disabled) {
    const attr = disabled ? 'disabled' : `data-v="${encodeURIComponent(o)}"`;
    return `<button class="btn opt ${extra}" ${attr}><span class="opt-key">${'ABCD'[i]}</span><span class="opt-text">${o}</span></button>`;
  }

  function hpBar(hp, cls) {
    return `<div class="bt-hp ${hp <= 30 ? 'low' : ''} ${cls}">
      <div class="bt-hp-fill" style="width:${hp}%"></div><span>${hp}</span></div>`;
  }

  function renderCpu(midTurn) {
    const q = state.q;
    const opts = q.options.map((o, i) => optBtn(o, i, midTurn && o === q.ans ? 'right' : '', midTurn)).join('');
    el.innerHTML = `
      <div class="bt-arena">
        <div class="bt-side foe">
          <div class="bt-face big">${face(opp, true)}</div>
          <div class="bt-name">${opp.name}<span class="bt-tier t-${opp.tier}">${opp.tier}</span></div>
          ${hpBar(state.oHp, 'foe')}
        </div>
        <div class="bt-log">${state.log}</div>
        <div class="bt-side me">
          ${hpBar(state.pHp, 'me')}
          <div class="bt-name">你 ${state.pHp < 30 ? '💢背水一戰' : state.combo >= 2 ? `🔥聚氣 ×${state.combo}` : ''}</div>
        </div>
      </div>
      <div class="bt-q">
        <div class="quiz-prompt">${q.prompt}</div>
        <div class="quiz-sub">${q.sub}</div>
        <div class="quiz-opts">${opts}</div>
      </div>`;
    if (!midTurn) {
      el.querySelectorAll('.opt').forEach(b => {
        b.onclick = () => onPlayerAnswer(decodeURIComponent(b.dataset.v));
      });
    }
  }

  function finish(win) {
    if (win) VDGame.onBattleWin(opp.id, state.comeback);
    el.innerHTML = `<div class="card-done">
      <div class="big">${win ? '🏆' : '💀'}</div>
      <p>${win ? `擊敗 ${opp.name}！` : `不敵 ${opp.name}……`}</p>
      <div class="bt-quote">「${win ? opp.lose : opp.win}」</div>
      <button class="btn" onclick="VDApp.go('battle')">再戰</button>
      <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button>
    </div>`;
  }

  /* ── 同機雙人：兩人各持血，輪流答不同題，答對扣對方血 ── */
  function startPvp() {
    words = VDApp.scopeWords();
    state = { hp: [MAX_HP, MAX_HP], turn: 0, combo: [0, 0], round: 0, log: '玩家 1 先攻！' };
    locked = false;
    pvpRound();
  }

  function pvpRound() {
    if (state.hp[0] <= 0) return pvpFinish(2);
    if (state.hp[1] <= 0) return pvpFinish(1);
    state.round++;
    state.q = VDQuiz.randomQuestion(words);
    locked = false;
    renderPvp();
  }

  function onPvpAnswer(v) {
    if (locked) return;
    locked = true;
    const me = state.turn, foe = 1 - me;
    const correct = v === state.q.ans;
    VDStore.record(state.q.word, correct);
    VDGame.onAnswer(correct, 'battle', 0);
    if (correct) {
      let dmg = 12 + state.combo[me] * 3;
      if (state.hp[me] < 30) dmg = Math.round(dmg * 1.5);
      state.hp[foe] = Math.max(0, state.hp[foe] - dmg);
      state.combo[me]++;
      state.log = `玩家 ${me + 1} 命中！玩家 ${foe + 1} -${dmg}`;
    } else {
      state.combo[me] = 0;
      state.hp[me] = Math.max(0, state.hp[me] - 6);
      state.log = `玩家 ${me + 1} 答錯，自損 6`;
    }
    renderPvp(true);
    setTimeout(() => {
      state.turn = foe;
      pvpRound();
    }, correct ? 900 : 1300);
  }

  function renderPvp(midTurn) {
    const q = state.q, t = state.turn;
    const opts = q.options.map((o, i) => optBtn(o, i, midTurn && o === q.ans ? 'right' : '', midTurn)).join('');
    el.innerHTML = `
      <div class="bt-arena pvp">
        <div class="bt-side foe">
          <div class="bt-name">玩家 2 ${state.combo[1] >= 2 ? `🔥×${state.combo[1]}` : ''}</div>
          ${hpBar(state.hp[1], t === 1 ? 'active' : '')}
        </div>
        <div class="bt-log">${state.log}</div>
        <div class="bt-side me">
          ${hpBar(state.hp[0], t === 0 ? 'active' : '')}
          <div class="bt-name">玩家 1 ${state.combo[0] >= 2 ? `🔥×${state.combo[0]}` : ''}</div>
        </div>
      </div>
      <div class="bt-turn">👉 玩家 ${t + 1} 作答</div>
      <div class="bt-q">
        <div class="quiz-prompt">${q.prompt}</div>
        <div class="quiz-sub">${q.sub}</div>
        <div class="quiz-opts">${opts}</div>
      </div>`;
    if (!midTurn) {
      el.querySelectorAll('.opt').forEach(b => {
        b.onclick = () => onPvpAnswer(decodeURIComponent(b.dataset.v));
      });
    }
  }

  function pvpFinish(winner) {
    el.innerHTML = `<div class="card-done">
      <div class="big">🏆</div>
      <p>玩家 ${winner} 獲勝！</p>
      <button class="btn" onclick="VDApp.go('battle')">再來一局</button>
      <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button>
    </div>`;
  }

  return { chooseMode };
})();
