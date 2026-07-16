/* 字鬥英雄：主控與畫面切換 */
const VDApp = (() => {
  let allWords = [];

  const $view = () => document.getElementById('view');

  function scopeWords(ignoreLock) {
    // 老師範圍鎖：有作用中的鎖定指派（且本次會話沒按「暫離」）→ 全部練習模組只出指派字
    const lock = ignoreLock ? null : VDStore.lockWords();
    if (lock && !sessionStorage.getItem('vd_lockoff')) {
      const set = new Set(lock);
      return allWords.filter(w => set.has(w.word));
    }
    const s = VDStore.stage;
    if (s === 'E') return allWords.filter(w => w.level === 'E');
    if (s === 'J') return allWords.filter(w => w.level === 'E' || w.level === 'J');
    // S=高中：可再依大考中心 Level（S1–S6）篩選
    const sub = VDStore.sub;
    if (sub && sub !== 'all') return allWords.filter(w => w.level === sub);
    return allWords;
  }

  function header(title) {
    const streak = VDStore.stats([]).streak;
    const shield = VDGame.shield;
    const badge = (streak > 0 || shield > 0) ? `<span class="hdr-badge">
      ${streak > 0 ? `<span class="hdr-badge-i" title="連續 ${streak} 天">🔥${streak}</span>` : ''}
      ${shield > 0 ? `<span class="hdr-badge-i" title="護盾 ${shield} 枚">🛡️${shield}</span>` : ''}
    </span>` : '';
    return `<div class="topbar"><button class="back" onclick="VDApp.go('menu')">←</button><h2>${title}</h2>${badge}</div>`;
  }

  /* 星圖／單字關聯圖 頁內分頁 */
  function graphTabs(cur) {
    const tab = (id, label) => `<button class="wg-tab ${cur === id ? 'on' : ''}" onclick="VDApp.go('${id}')">${label}</button>`;
    return `<div class="wg-tabs">${tab('graph', '🌌 詞源星圖')}${tab('wordgraph', '🕸️ 單字關聯圖')}</div>`;
  }

  /* 首頁迷你戰況：Leitner 五盒分佈長條＋連續天數 */
  function dashboard(words, stageName) {
    const { d, unseen, total, streak } = VDStore.boxDist(words);
    const seen = total - unseen;
    if (seen === 0) {
      return `<div class="dash"><div class="dash-top"><span class="d-stage">${stageName}</span>
        ${streak > 0 ? `<span class="d-streak">🔥 連續 ${streak} 天</span>` : ''}</div>
        <div class="dash-empty">還沒開始練功 — 挑一個模式，踏出第一步！</div></div>`;
    }
    const mastered = d[3] + d[4] + d[5];
    const segs = d.map((n, b) => n === 0 ? '' :
      `<div class="dash-seg b${b}" style="width:${(n / seen * 100).toFixed(1)}%" title="第${b}盒 ${n} 字"></div>`).join('');
    const due = VDStore.stats(words).due;
    return `<div class="dash">
      <div class="dash-top"><span class="d-stage">${stageName}</span>
        ${streak > 0 ? `<span class="d-streak">🔥 連續 ${streak} 天</span>` : ''}</div>
      <div class="dash-bar">${segs}</div>
      <div class="dash-legend">
        <span>已學 <b>${seen}</b>/${total}</span>
        <span>已掌握 <b>${mastered}</b></span>
        <span>複習中 <b>${d[0] + d[1] + d[2]}</b></span>
      </div>
      ${due > 0 ? `<button class="dash-due" onclick="VDApp.go('flash')">📬 今天有 ${due} 字到期 → 去複習</button>` : ''}
    </div>`;
  }

  /* 高中分級篩選晶片（只在高中學段顯示） */
  function levelChips() {
    if (VDStore.stage !== 'S') return '';
    const cur = VDStore.sub;
    const chip = (v, label) => `<button class="lvl-chip ${cur === v ? 'on' : ''}" onclick="VDApp.setSub('${v}')">${label}</button>`;
    return `<div class="lvl-row"><span class="lvl-lab">範圍</span>${chip('all', '全部')}${['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map((s, i) => chip(s, 'L' + (i + 1))).join('')}</div>`;
  }

  const views = {
    stage() {
      const card = (s, img, name, amb, sub) => `
        <button class="wc-stage" data-s="${s}">
          <img loading="lazy" decoding="async" class="wc-stage-img" src="img/wc/${img}.webp" alt="${name}" onerror="this.style.display='none'">
          <div class="wc-stage-cap">
            <div class="wc-stage-name">${name}</div>
            <span class="wc-stage-amb">${amb} 領路</span>
            <div class="wc-stage-sub">${sub}</div>
            <span class="wc-enter">進入練功坊 ＞</span>
          </div>
        </button>`;
      $view().innerHTML = `
        <div class="wc-hero">
          <img loading="lazy" decoding="async" class="wc-banner" src="img/wc/banner.webp" alt="" onerror="this.remove()">
          <h1 class="wc-title">字鬥英雄</h1>
          <p class="wc-tagline">跟著西洋文豪，一字一戰 — 從 1200 到 6000</p>
        </div>
        <div class="wc-stage-grid">
          ${card('E', 'andersen', '國小挑戰', '安徒生', '童話般的 1200 基本字')}
          ${card('J', 'twain', '國中挑戰', '馬克吐溫', '冒險的 2000 常用字')}
          ${card('S', 'shakespeare', '高中挑戰', '莎士比亞', '經典殿堂 6000 學測字')}
        </div>`;
      document.querySelectorAll('.wc-stage').forEach(b => {
        b.onclick = () => { VDStore.stage = b.dataset.s; go('menu'); };
      });
    },
    menu() {
      const words = scopeWords();
      const stageName = { E: '國小 1200', J: '國中 2000', S: '高中 6000' }[VDStore.stage];
      // 圖卡：上圖下字，水彩西洋文豪風；圖載入失敗退 emoji 佔位
      const card = (view, key, ico, title, sub, feature, badge) => `
        <button class="wc-mcard${feature ? ' feature' : ''}" onclick="VDApp.go('${view}')">
          ${badge ? `<span class="wc-mcard-badge">${badge}</span>` : ''}
          <img loading="lazy" decoding="async" class="wc-mcard-img" src="img/ui/${key}.webp" alt=""
            onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'wc-mcard-ph',textContent:'${ico}'}))">
          <div class="wc-mcard-cap">
            <div class="wc-mcard-title">${title}</div>
            <span class="wc-mcard-sub">${sub}</span>
          </div>
        </button>`;
      const wrongN = VDStore.wrongWords(words).length;
      const starN = VDStore.starWords(words).length;
      // 漸進解鎖：依英雄等級分階開放功能，解鎖本身就是獎勵（老玩家等級高，全部照舊開著）
      const lv = VDGame.level();
      const lockCard = (ico, title, need, feature) => {
        const pct = VDGame.progressToLevel(need);
        return `
        <div class="wc-mcard menu-card locked${feature ? ' feature' : ''}" aria-disabled="true">
          <div class="wc-mcard-ph">${ico}</div>
          <div class="wc-mcard-cap">
            <div class="wc-mcard-title">${title}</div>
            <span class="wc-mcard-sub">🔒 Lv ${lv}/${need} 解鎖</span>
            <span class="wc-lock-bar"><span style="width:${pct}%"></span></span>
          </div>
        </div>`;
      };
      // 新手引導卡：還沒學過任何字（= 尚未入門）就置頂顯示；練過第一個字自動消失
      const intro = VDStore.stats(allWords).seen === 0 ? `
        <div class="wc-card" style="border:2px solid #e8a020;background:linear-gradient(135deg,#fff8ec,#fdefd2)">
          <div class="wc-card-body">
            <div class="hero-sec">👋 第一次來？先打一場</div>
            <p class="pg-hint" style="font-size:1.05em">迎戰入門文豪安徒生——第一場特別放水，贏了再去閃卡練功！</p>
            <button class="btn" onclick="sessionStorage.setItem('vd_firstBattle','1');VDApp.go('battle')">⚔️ 迎戰第一位文豪</button>
          </div>
        </div>` : '';
      // 老師範圍鎖 chip：鎖定中顯示指派名與進度，可單次會話「暫離」（重新進站恢復鎖定）
      const lockChip = (() => {
        const lw = VDStore.lockWords();
        if (!lw) return '';
        const asg = VDStore.assignments()[VDStore.lockAsg()];
        const done = lw.filter(w => VDStore.box(w) >= 1).length;
        const off = !!sessionStorage.getItem('vd_lockoff');
        return `<div class="lvl-row" style="align-items:center">
          <span class="lvl-lab">📋 老師指派範圍：${VDGame.esc(asg.name)}（${done}/${lw.length}）${off ? '・已暫離' : ''}</span>
          <button class="lvl-chip ${off ? '' : 'on'}" onclick="sessionStorage.${off ? 'removeItem' : 'setItem'}('vd_lockoff'${off ? '' : ",'1'"});VDApp.go('menu')">${off ? '回到指派範圍' : '暫離'}</button>
        </div>`;
      })();
      const weakN = window.VDWeak ? VDWeak.count(words) : 0;
      $view().innerHTML = `
        <div class="wc-menu-top">
          <img loading="lazy" decoding="async" class="wc-menu-banner" src="img/wc/banner.webp" alt="" onerror="this.remove()">
          <h1>字鬥英雄</h1>
        </div>
        ${intro}
        ${VDGame.heroStrip()}
        ${VDGame.dailyPanel()}
        ${dashboard(words, stageName)}
        ${lockChip}
        ${levelChips()}
        <div class="menu-group">
          <div class="menu-glabel">練習</div>
          <div class="wc-mgrid">
            ${card('flash', 'm_flash', '🃏', '閃卡練功', '五盒間隔複習，記得牢')}
            ${card('quiz', 'm_quiz', '✍️', '單字自測', '三題型隨機，一輪十題')}
            ${card('listen', 'm_listen', '🎧', '聽力理解', '聽音辨義／聽寫關鍵字')}
            ${card('write', 'm_write', '📝', '寫作坊', '造句・重組・填空，自己寫出來')}
            ${lv >= 2 ? card('sprint', 'm_sprint', '⏱️', '限時衝刺', '60 秒搶答，衝高分') : lockCard('⏱️', '限時衝刺', 2)}
            ${weakN ? card('weak', 'm_weak', '🩺', '弱字本', '錯過＋假熟練，一站補強', false, weakN) : ''}
            ${lv >= 2 && wrongN ? card('review', 'm_review', '🩹', '錯題複習', '只練你答錯過的字', false, wrongN) : ''}
          </div>
        </div>
        <div class="menu-group">
          <div class="menu-glabel">對戰</div>
          <div class="wc-mgrid">
            ${card('battle', 'm_battle', '🎭', '文學家對戰', '八位文豪闖關／同機雙人搶答', true)}
            ${localStorage.getItem('vd_classcode') ? card('live', 'm_live', '📡', '隨堂考', '老師開場，全班同步搶答') : ''}
          </div>
        </div>
        <div class="menu-group">
          <div class="menu-glabel">詞靈</div>
          <div class="wc-mgrid">
            ${lv >= 3 ? `
            ${card('pets', 'm_pets', '🐾', '詞靈夥伴', '20 隻字綴守護獸，學字餵養', true)}
            ${card('graph', 'm_graph', '🌌', '詞源星圖', '172 字綴星空，越學越亮')}
            ${card('petbattle', 'm_arena', '⚔️', '詞靈競技', '野生試煉＋影子對戰掉裝備')}` :
            lockCard('🐾', '詞靈系列', 3, true)}
          </div>
        </div>
        <div class="menu-group">
          <div class="menu-glabel">城邦</div>
          <div class="wc-mgrid">
            ${lv >= 4 ? card('town', 'm_town', '🏰', '單字之城', '背單字蓋出一座城，居民全講英文', true) : lockCard('🏰', '單字之城', 4, true)}
          </div>
        </div>
        <div class="menu-group">
          <div class="menu-glabel">英雄</div>
          <div class="wc-mgrid">
            ${card('hero', 'm_hero', '🦸', '英雄檔案', '稱號・徽章・字幣・自訂頭像', true)}
            ${lv >= 5 ? card('shop', 'm_shop', '🏪', '字幣商店', '頭像框・護盾・復活羽毛') : lockCard('🏪', '字幣商店', 5)}
            ${card('dex', 'm_dex', '🖼️', '單字圖鑑', `把 ${allWords.length} 個字一格一格點亮`)}
          </div>
        </div>
        <details class="menu-group tools-fold">
          <summary><span class="tf-ico">🧰</span> 更多工具 <span class="tf-sub">查單字・字綴・會考・雲端${starN ? '・收藏' : ''}</span></summary>
          <div class="wc-mgrid">
            ${card('search', 'm_search', '🔍', '查單字', '打英文或中文，秒查秒收藏')}
            ${card('affix', 'm_affix', '🧩', '字綴心智圖', '字首字尾字根，成串記憶')}
            ${card('exam', 'm_exam', '📝', '會考考古題', '104–115 閱讀 445 題')}
            ${card('cloud', 'm_cloud', '☁️', '雲端／班級榜', '跨裝置存進度・拚排名')}
            ${starN ? card('starred', 'm_starred', '⭐', '我的收藏', '只刷你加星的字', false, starN) : ''}
          </div>
        </details>
        <div class="wc-menu-navrow">
          <button class="btn ghost" onclick="VDApp.go('stats')">📊 我的戰績</button>
          <button class="btn ghost" onclick="VDApp.go('stage')">切換學段</button>
          <button class="btn ghost" onclick="VDApp.go('parents')">👨‍👩‍👦 給家長的話</button>
        </div>`;
    },
    battle() {
      $view().innerHTML = header('文學家對戰') + '<div id="mod"></div>';
      VDBattle.chooseMode(document.getElementById('mod'));
    },
    affix() {
      $view().innerHTML = header('字綴心智圖') + '<div id="mod"></div>';
      VDAffix.start(document.getElementById('mod'));
    },
    exam() {
      $view().innerHTML = header('國中會考英文考古題') + '<div id="mod"></div>';
      VDExam.start(document.getElementById('mod'));
    },
    flash() {
      $view().innerHTML = header('閃卡練功') + '<div id="mod"></div>';
      VDFlash.start(scopeWords(), document.getElementById('mod'));
    },
    review() {
      const wrong = VDStore.wrongWords(scopeWords());
      $view().innerHTML = header('錯題複習') + '<div id="mod"></div>';
      VDFlash.start(wrong, document.getElementById('mod'), { raw: true, wrong: true });
    },
    quiz() {
      $view().innerHTML = header('單字自測') + '<div id="mod"></div>';
      const ws = scopeWords();
      // 範圍太小（如老師鎖定的短字表）：誘答池改用完整學段，避免選項重複／不足
      if (ws.length < 12) VDQuiz.startWith(ws, document.getElementById('mod'), scopeWords(true));
      else VDQuiz.start(ws, document.getElementById('mod'));
    },
    listen() {
      $view().innerHTML = header('聽力理解') + '<div id="mod"></div>';
      VDListen.start(scopeWords(), document.getElementById('mod'));
    },
    write() {
      $view().innerHTML = header('寫作坊') + '<div id="mod"></div>';
      VDWrite.start(scopeWords(), document.getElementById('mod'));
    },
    weak() {
      $view().innerHTML = header('弱字本') + '<div id="mod"></div>';
      VDWeak.start(scopeWords(), document.getElementById('mod'));
    },
    teach() {
      $view().innerHTML = header('老師後台') + '<div id="mod"></div>';
      VDTeach.start(document.getElementById('mod'));
    },
    live() {
      $view().innerHTML = header('隨堂考') + '<div id="mod"></div>';
      VDLive.start(scopeWords(), document.getElementById('mod'));
    },
    recall() {
      $view().innerHTML = header('召回關卡') + '<div id="mod"></div>';
      VDGame.startRecall(document.getElementById('mod'));
    },
    stats() {
      $view().innerHTML = header('我的戰績') + '<div id="mod"></div>';
      VDStats.render(allWords, document.getElementById('mod'));
    },
    hero() {
      $view().innerHTML = header('英雄檔案') + '<div id="mod"></div>';
      VDHero.render(document.getElementById('mod'));
    },
    shop() {
      $view().innerHTML = header('字幣商店') + '<div id="mod"></div>';
      VDShop.render(document.getElementById('mod'));
    },
    dex() {
      $view().innerHTML = header('單字圖鑑') + '<div id="mod"></div>';
      VDDex.render(document.getElementById('mod'));
    },
    pets() {
      $view().innerHTML = header('詞靈夥伴') + '<div id="mod"></div>';
      VDPet.render(document.getElementById('mod'));
    },
    graph() {
      $view().innerHTML = header('詞源星圖') + graphTabs('graph') + '<div id="mod"></div>';
      VDGraph.render(document.getElementById('mod'));
    },
    wordgraph() {
      $view().innerHTML = header('單字關聯圖') + graphTabs('wordgraph') + '<div id="mod"></div>';
      VDWordGraph.render(document.getElementById('mod'));
    },
    petbattle() {
      $view().innerHTML = header('詞靈競技') + '<div id="mod"></div>';
      VDPetBattle.render(document.getElementById('mod'));
    },
    town() {
      $view().innerHTML = header('單字之城') + '<div id="mod"></div>';
      VDTownUI.render(document.getElementById('mod'));
    },
    sprint() {
      $view().innerHTML = header('限時衝刺') + '<div id="mod"></div>';
      VDSprint.start(scopeWords(), document.getElementById('mod'));
    },
    search() {
      $view().innerHTML = header('查單字') + '<div id="mod"></div>';
      VDSearch.start(document.getElementById('mod'));
    },
    cloud() {
      $view().innerHTML = header('雲端／班級榜') + '<div id="mod"></div>';
      VDCloud.start(document.getElementById('mod'));
    },
    starred() {
      const stars = VDStore.starWords(scopeWords());
      $view().innerHTML = header('我的收藏') + '<div id="mod"></div>';
      if (!stars.length) {
        document.getElementById('mod').innerHTML = `<div class="card-done"><div class="big">⭐</div>
          <p>還沒收藏任何字。在查單字或閃卡按 ☆ 加星吧！</p>
          <button class="btn" onclick="VDApp.go('search')">去查單字</button>
          <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button></div>`;
        return;
      }
      VDFlash.start(stars, document.getElementById('mod'), { raw: true });
    },
    parents() {
      $view().innerHTML = header('給家長的話') + `
        <div class="wc-card"><div class="wc-card-body">
          <div class="hero-sec">👨‍👩‍👦 這個遊戲怎麼運作</div>
          <p class="pg-hint" style="font-size:1.02em;line-height:1.8">
            <b>零內購。</b>字鬥英雄完全免費，沒有任何儲值、廣告或付費項目。<br><br>
            <b>字幣只能靠答題賺。</b>遊戲裡的「字幣」唯一來源是答對題目與完成任務，
            無法用金錢購買——想買頭像框，就得先把單字背起來。<br><br>
            <b>開箱機率透明、防釣魚。</b>寶箱獎勵的機率固定寫在程式裡，
            且以答題進度為種子，不存在「花越多開越好」的機制。<br><br>
            <b>市場只有虛擬物。</b>所有商店與市場交易的都是遊戲內虛擬道具
            （頭像框、護盾、羽毛），與現實金錢完全無關。<br><br>
            <b>30 分鐘休息提醒。</b>建議孩子每次使用不超過 30 分鐘；
            單字記憶本來就靠「少量多次」，一次久坐反而沒效率。<br><br>
            <b>背後的科學：Leitner 間隔複習。</b>閃卡採用五盒間隔複習法——
            答對的字晉盒、拉長複習間隔；答錯的字退回第一盒、隔天再考。
            這是認知心理學驗證過最有效的長期記憶策略之一，
            遊戲化只是讓孩子願意天天回來複習的糖衣。
          </p>
          <p style="margin-top:12px"><a href="privacy.html" target="_blank" rel="noopener">🔒 隱私與資料說明</a></p>
        </div></div>
        <button class="btn ghost wide" onclick="VDApp.go('menu')">回主選單</button>`;
    }
  };

  /* 漸進解鎖門檻：與 menu() 卡片顯示的 Lv 一致；直接呼叫 go()/改網址列都擋，不只是選單裝飾 */
  const LEVEL_GATE = { sprint: 2, pets: 3, graph: 3, petbattle: 3, town: 4, shop: 5 };
  function go(name, noPush) {
    if (!views[name]) name = 'menu';
    const need = LEVEL_GATE[name];
    if (need && VDGame.level() < need) name = 'menu';
    document.body.dataset.view = name;
    views[name]();
    // History API：換頁推一筆，讓手機返回鍵是「回上一頁」而非退出；同頁重繪不重複疊
    if (!noPush && !(history.state && history.state.v === name)) history.pushState({ v: name }, '');
  }

  /* 任意處的加星鈕：就地切換收藏狀態 */
  function starClick(btn, word) {
    const on = VDStore.toggleStar(word);
    btn.textContent = on ? '⭐' : '☆';
    btn.classList.toggle('on', on);
    if (window.VDSound) VDSound.click();
    VDGame.toast(on ? `⭐ 收藏「${word}」` : `取消收藏「${word}」`);
  }

  /* 字級：normal / large，套用 body class（放大主要閱讀文字） */
  function applyFontScale() {
    const fs = localStorage.getItem('vd_fontscale') || 'normal';
    document.body.classList.toggle('fs-large', fs === 'large');
  }
  function toggleFontScale() {
    const cur = localStorage.getItem('vd_fontscale') || 'normal';
    const next = cur === 'large' ? 'normal' : 'large';
    localStorage.setItem('vd_fontscale', next);
    applyFontScale();
    return next;
  }
  /* 深色模式：自習室護眼用 */
  function applyTheme() {
    document.body.classList.toggle('dark', localStorage.getItem('vd_theme') === 'dark');
  }

  async function init() {
    const res = await fetch('data/words.json');
    allWords = await res.json();
    VDEnrich.ensure();  // 詞彙深度資料背景載入，供閃卡／自測／字綴顯示英英定義＋搭配詞
    VDGame.init();      // 遊戲化引擎：XP／稱號／徽章／每日任務／字幣／護盾
    applyFontScale();
    applyTheme();
    const first = VDStore.stage ? 'menu' : 'stage';
    go(first, true);
    history.replaceState({ v: first }, '');
    // 返回鍵：popstate 回上一個 view；狀態不明就留在 menu，不直接退出
    window.addEventListener('popstate', e => {
      const v = e.state && e.state.v;
      go(v && views[v] ? v : 'menu', true);
    });
    // 挑戰連結：?ch=<code> 進站彈出應戰邀請，導向限時衝刺並自動帶入挑戰碼
    const ch = new URLSearchParams(location.search).get('ch');
    if (ch) {
      const d = VDGame.decodeChallenge(ch.replace(/^CHALLENGE:/, ''));
      if (d && VDStore.stage) {
        const box = document.createElement('div');
        box.className = 'av-modal';
        box.innerHTML = `<div class="av-panel" role="dialog" aria-modal="true">
          <div class="av-title">⚔️ 有人向你挑戰！</div>
          <p style="text-align:center;margin-bottom:14px">
            <b>${VDGame.esc(d.n || '同學')}</b> 在限時衝刺拿了 <b>${d.s | 0}</b> 分，敢應戰嗎？</p>
          <button class="btn" id="chGo" style="width:100%">接受挑戰</button>
          <button class="btn ghost" id="chNo" style="width:100%;margin-top:8px">先逛逛再說</button></div>`;
        document.body.appendChild(box);
        box.querySelector('#chGo').onclick = () => {
          box.remove();
          go('sprint');
          const inp = document.getElementById('chal');
          if (inp) inp.value = ch;
        };
        box.querySelector('#chNo').onclick = () => box.remove();
        box.onclick = e => { if (e.target === box) box.remove(); };
      } else if (d) {
        VDGame.toast('⚔️ 收到挑戰！先選好學段，再到「限時衝刺」貼上挑戰碼 PK');
      }
    }
  }

  function setSub(v) { VDStore.sub = v; go('menu'); }

  return { init, go, setSub, scopeWords, words: () => allWords, starClick, toggleFontScale, applyTheme };
})();

document.addEventListener('DOMContentLoaded', VDApp.init);
window.VDApp = VDApp;
