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

  /* 文豪名言卡：擊敗該作家解鎖收藏（皆為公版經典名句） */
  const QUOTES = {
    andersen: { q: '人生本身，就是最美妙的童話。', story: '丹麥鞋匠之子，窮到只能想像。\n他把想像寫成《醜小鴨》《小美人魚》，\n160 多篇童話讓全世界的孩子睡前有了光。' },
    aesop: { q: '善行再小，也不會白費。', story: '兩千六百年前的古希臘奴隸，\n靠著會說故事替自己贏得自由。\n龜兔賽跑、狼來了——都是他留下的智慧。' },
    twain: { q: '勇氣不是沒有恐懼，而是戰勝恐懼。', story: '密西西比河上的領航員，筆名意思是「水深兩噚」。\n他寫《湯姆歷險記》，把頑童變成英雄，\n也把美式幽默寫進了世界文學。' },
    austen: { q: '沒有什麼魅力，比得上一顆溫柔的心。', story: '一生未婚的英國牧師之女，\n在客廳小圓桌上偷偷寫作。\n《傲慢與偏見》兩百年來仍是愛情小說的天花板。' },
    hemingway: { q: '人可以被毀滅，但不能被打敗。', story: '記者、拳擊手、戰地司機、諾貝爾獎得主。\n他用最短的句子寫最硬的故事，\n《老人與海》裡那條大魚就是人生。' },
    dickens: { q: '這是最好的時代，也是最壞的時代。', story: '12 歲就進鞋油工廠做工的倫敦少年，\n長大後把貧民窟寫進小說，逼整個英國正視窮人。\n《孤雛淚》《雙城記》至今無人不曉。' },
    shakespeare: { q: '凡是過去，皆為序章。', story: '手套匠之子，只上過文法學校，\n卻發明了 1700 多個英文單字。\n四大悲劇加喜劇 38 部，人類劇場的半壁江山。' },
    tolstoy: { q: '幸福的家庭都是相似的。', story: '俄國伯爵，卻穿農夫衣下田耕作。\n《戰爭與和平》寫了 559 個人物，\n晚年散盡家產，只留下信念與文字。' }
  };

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

  /* 本週擂主：由 VDGame.weekInfo() 提供（別組介面）；沒有就降級不顯示 */
  function weekChampion() {
    try {
      if (typeof VDGame.weekInfo === 'function') return VDGame.weekInfo().championId || null;
    } catch { /* 降級 */ }
    return null;
  }

  /* 同對手連敗計數：只記在 sessionStorage，不進存檔 */
  function loseStreak(id) {
    try { return JSON.parse(sessionStorage.getItem('vd_ls') || '{}')[id] || 0; } catch { return 0; }
  }
  function bumpLoseStreak(id, win) {
    try {
      const m = JSON.parse(sessionStorage.getItem('vd_ls') || '{}');
      m[id] = win ? 0 : (m[id] || 0) + 1;
      sessionStorage.setItem('vd_ls', JSON.stringify(m));
    } catch { /* 忽略 */ }
  }

  /* DDA 橡皮筋：電腦有效命中率隨玩家近期正確率微調（夾在 −0.12 ~ +0.08） */
  function effAcc() {
    const rAcc = ((typeof VDStore.recentAcc === 'function') && VDStore.recentAcc(20)) || 0.7;
    let a = Math.min(opp.acc + 0.08, Math.max(opp.acc - 0.12, opp.acc + (rAcc - 0.7) * 0.3));
    if (loseStreak(opp.id) >= 2) a -= 0.05;          // 同對手連敗 2 場，暗中再放水
    if (state && state.easy) a -= 0.2;                // 新手第一戰：安徒生放水版
    return a;
  }

  /* 作家頭像：3D Pixel Q版圖，載入失敗自動退回 emoji */
  function face(o, big) {
    const cls = 'bt-portrait' + (big ? ' big' : '');
    return `<img loading="lazy" decoding="async" src="img/authors/${o.id}.webp" alt="${o.name}" class="${cls}"
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

  /* 段位條：對戰首頁常駐，勝敗積分＋下一段位進度 */
  function rankStrip() {
    const r = VDGame.rankInfo();
    return `<div class="bt-rank">
      <span class="bt-rank-ico">${r.ico}</span>
      <span class="bt-rank-body">
        <span class="bt-rank-name">${r.name}　<b>${r.pts} 分</b></span>
        <span class="vg-q-bar"><span style="width:${r.pct}%"></span></span>
        <span class="bt-rank-next">${r.next ? `再 ${r.next.at - r.pts} 分晉升 ${r.next.ico} ${r.next.name}` : '已達最高段位！'}</span>
      </span>
      <span class="bt-rank-rule">勝 +20／敗 −10・🛡️ 每週首敗不扣分</span>
    </div>`;
  }

  /* 名言卡集：打敗文豪解鎖他的名言與小傳，8 張收好收滿 */
  function quotesGallery() {
    const got = OPPONENTS.filter(o => VDGame.isBeaten(o.id)).length;
    return `<div class="wc-card bt-quotes">
      <div class="wc-card-body">
        <div class="hero-sec">文豪名言卡　<b>${got}/8</b></div>
        <div class="qt-grid">${OPPONENTS.map(o => {
          const open = VDGame.isBeaten(o.id);
          return `<button class="qt-mini ${open ? '' : 'lock'}" data-q="${o.id}">
            ${open ? face(o) : '<span class="qt-lock">🔒</span>'}
            <span class="qt-name">${open ? o.name : '？？？'}</span>
          </button>`;
        }).join('')}</div>
        <div class="hero-shieldhint">擊敗一位文豪，收藏他的名言卡。</div>
      </div>
    </div>`;
  }

  function showQuote(id) {
    const o = OPPONENTS.find(x => x.id === id), qd = QUOTES[id];
    if (!o || !qd) return;
    const box = document.createElement('div');
    box.className = 'av-modal';
    box.innerHTML = `<div class="av-panel qt-card">
      ${face(o, true)}
      <div class="qt-quote">「${qd.q}」</div>
      <div class="qt-author">—— ${o.name}</div>
      <div class="qt-story">${qd.story.replace(/\n/g, '<br>')}</div>
    </div>`;
    box.onclick = e => { if (e.target === box) box.remove(); };
    document.body.appendChild(box);
  }

  function chooseOpponent() {
    const champ = weekChampion();
    el.innerHTML = `${rankStrip()}<div class="bt-oppgrid">${OPPONENTS.map(o => {
      const open = VDGame.tierUnlocked(o.tier);
      return `<button class="bt-oppcard ${open ? '' : 'locked'}${champ === o.id ? ' champ' : ''}" data-id="${o.id}" data-open="${open ? 1 : 0}">
        ${champ === o.id ? '<div class="bt-champ">👑 本週擂主・段位分×2</div>' : ''}
        <div class="bt-face">${open ? face(o) : '<span class="bt-face-emoji">🔒</span>'}</div>
        <div class="bt-name">${o.name}</div>
        <div class="bt-tier t-${o.tier}">${o.tier}</div>
        ${open ? '' : `<div class="bt-locknote">Lv${VDGame.tierNeed(o.tier)} 解鎖</div>`}
      </button>`;
    }).join('')}</div>
    <div class="bt-lockhint">升等（練習／對戰賺 XP）就能解鎖更強的文學家。</div>
    ${quotesGallery()}`;
    el.querySelectorAll('.bt-oppcard').forEach(b => {
      b.onclick = () => {
        if (b.dataset.open === '0') { VDGame.toast(`這位文學家要 Lv${VDGame.tierNeed(OPPONENTS.find(o => o.id === b.dataset.id).tier)} 才能挑戰`); return; }
        startCpu(OPPONENTS.find(o => o.id === b.dataset.id));
      };
    });
    el.querySelectorAll('.qt-mini').forEach(b => {
      b.onclick = () => {
        if (b.classList.contains('lock')) { VDGame.toast('先擊敗這位文豪，才能收藏他的名言卡'); return; }
        showQuote(b.dataset.q);
      };
    });
  }

  /* ── 單人對戰 ── */
  function startCpu(o) {
    opp = o;
    words = scopedWords(o.levels);
    // 新手第一戰旗標：只對入門安徒生生效（放水 −0.2），打完清除
    const easy = sessionStorage.getItem('vd_firstBattle') === '1' && o.id === 'andersen';
    state = { pHp: MAX_HP, oHp: MAX_HP, combo: 0, round: 0, log: opp.taunt, comeback: false, easy };
    locked = false;
    if (window.VDPets) VDPets.init(); // 助戰詞靈資料，首回合前就緒
    VDGame.onBattleStart();
    // 逃跑懲罰標記：結算時清除；殘留＝中途離開，下次載入判敗
    localStorage.setItem('vd_pendingBattle', JSON.stringify({ mode: 'rank', ts: Date.now() }));
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
    VDStore.record(state.q.word, correct, 'battle');
    VDGame.onAnswer(correct, 'battle', state.combo + (correct ? 1 : 0));
    if (state.pHp < 30) state.comeback = true;
    if (correct) {
      const dmg = playerDamage();
      state.oHp = Math.max(0, state.oHp - dmg);
      state.combo++;
      state.log = `命中！對 ${opp.name} 造成 ${dmg} 點傷害${state.combo >= 2 ? `（連擊 ×${state.combo}）` : ''}`;
      // 詞靈助戰：出戰詞靈追擊 atk/10，leech 解鎖再回血
      const as = window.VDPets ? VDPets.assist() : null;
      if (as && state.oHp > 0) {
        state.oHp = Math.max(0, state.oHp - as.atk);
        state.log += `　${as.ico} ${as.name} 追擊 -${as.atk}`;
        if (as.leech) { state.pHp = Math.min(MAX_HP, state.pHp + as.leech); state.log += `・回血 +${as.leech}`; }
      }
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
      const hit = Math.random() < effAcc();
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

  function assistTag() {
    const as = window.VDPets ? VDPets.assist() : null;
    return as ? `<div class="bt-assist">${as.ico} ${as.name} 助戰（追擊 ${as.atk}${as.leech ? '・回血' : ''}）</div>` : '';
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
        <div class="bt-log" role="status" aria-live="polite">${state.log}</div>
        <div class="bt-side me">
          ${hpBar(state.pHp, 'me')}
          <div class="bt-name">你 ${state.pHp < 30 ? '💢背水一戰' : state.combo >= 2 ? `🔥聚氣 ×${state.combo}` : ''}</div>
          ${assistTag()}
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
      const first = el.querySelector('.opt');
      if (first) first.focus();
    }
  }

  function finish(win) {
    // 復活羽毛：倒下時可原地復活（回 40 血），字幣消耗品的高光時刻
    if (!win && VDGame.revive > 0) {
      el.innerHTML = `<div class="card-done">
        <div class="big">🪶</div>
        <p>你倒下了……但羽毛還在燃燒。</p>
        <button class="btn" id="doRevive">🪶 使用復活羽毛（剩 ${VDGame.revive}）— 回 40 血再戰</button>
        <button class="btn ghost" id="giveUp">接受敗北</button>
      </div>`;
      el.querySelector('#doRevive').onclick = () => {
        if (!VDGame.useRevive()) return finish(false);
        state.pHp = 40; state.combo = 0;
        state.log = '🪶 浴火重生！背水一戰加成已就位';
        nextRound();
      };
      el.querySelector('#giveUp').onclick = () => reallyFinish(false);
      return;
    }
    reallyFinish(win);
  }

  function reallyFinish(win) {
    localStorage.removeItem('vd_pendingBattle'); // 已結算，清逃跑標記
    sessionStorage.removeItem('vd_firstBattle'); // 新手放水只給一場
    bumpLoseStreak(opp.id, win);                 // 連敗計數：贏了歸零
    VDGame.onBattleFinish();  // 每日對戰任務：結算才計數
    const firstBeat = win && !VDGame.isBeaten(opp.id);
    if (win) VDGame.onBattleWin(opp.id, state.comeback);
    const isChamp = weekChampion() === opp.id;
    let rk = win ? VDGame.rankWin() : VDGame.rankLose();
    if (win && isChamp) { // 擊敗本週擂主：段位分雙倍（再結算一次勝場分）
      const rk2 = VDGame.rankWin();
      rk = { ...rk2, delta: rk.delta + rk2.delta };
    }
    const qd = QUOTES[opp.id];
    el.innerHTML = `<div class="card-done">
      <div class="big">${win ? '🏆' : '💀'}</div>
      <p>${win ? `擊敗 ${opp.name}！` : `不敵 ${opp.name}……`}</p>
      <div class="bt-quote">「${win ? opp.lose : opp.win}」</div>
      ${firstBeat && qd ? `<div class="qt-unlock">📜 解鎖名言卡：「${qd.q}」—— ${opp.name}</div>` : ''}
      ${win && isChamp ? '<div class="qt-unlock">👑 擊敗本週擂主——段位分雙倍入帳！</div>' : ''}
      <div class="bt-rankdelta ${win ? 'up' : 'down'}">${rk.ico} ${rk.name}　${rk.delta > 0 ? '+' : ''}${rk.delta} 分（${rk.pts}）</div>
      ${VDGame.milestoneHtml()}
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
    VDStore.record(state.q.word, correct, 'battle');
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
        <div class="bt-log" role="status" aria-live="polite">${state.log}</div>
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
      const first = el.querySelector('.opt');
      if (first) first.focus();
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
