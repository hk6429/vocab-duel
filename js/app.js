/* 字鬥英雄：主控與畫面切換 */
const VDApp = (() => {
  let allWords = [];

  const $view = () => document.getElementById('view');

  function scopeWords() {
    const s = VDStore.stage;
    if (s === 'E') return allWords.filter(w => w.level === 'E');
    if (s === 'J') return allWords.filter(w => w.level === 'E' || w.level === 'J');
    // S=高中：可再依大考中心 Level（S1–S6）篩選
    const sub = VDStore.sub;
    if (sub && sub !== 'all') return allWords.filter(w => w.level === sub);
    return allWords;
  }

  function header(title) {
    return `<div class="topbar"><button class="back" onclick="VDApp.go('menu')">←</button><h2>${title}</h2></div>`;
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
    const mastered = d[3] + d[4];
    const segs = d.map((n, b) => n === 0 ? '' :
      `<div class="dash-seg b${b}" style="width:${(n / seen * 100).toFixed(1)}%" title="第${b}盒 ${n} 字"></div>`).join('');
    return `<div class="dash">
      <div class="dash-top"><span class="d-stage">${stageName}</span>
        ${streak > 0 ? `<span class="d-streak">🔥 連續 ${streak} 天</span>` : ''}</div>
      <div class="dash-bar">${segs}</div>
      <div class="dash-legend">
        <span>已學 <b>${seen}</b>/${total}</span>
        <span>已掌握 <b>${mastered}</b></span>
        <span>複習中 <b>${d[0] + d[1] + d[2]}</b></span>
      </div>
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
          <img class="wc-stage-img" src="img/wc/${img}.png" alt="${name}" onerror="this.style.display='none'">
          <div class="wc-stage-cap">
            <div class="wc-stage-name">${name}</div>
            <span class="wc-stage-amb">${amb} 領路</span>
            <div class="wc-stage-sub">${sub}</div>
            <span class="wc-enter">進入練功坊 ＞</span>
          </div>
        </button>`;
      $view().innerHTML = `
        <div class="wc-hero">
          <img class="wc-banner" src="img/wc/banner.png" alt="" onerror="this.remove()">
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
          <img class="wc-mcard-img" src="img/ui/${key}.png" alt=""
            onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'wc-mcard-ph',textContent:'${ico}'}))">
          <div class="wc-mcard-cap">
            <div class="wc-mcard-title">${title}</div>
            <span class="wc-mcard-sub">${sub}</span>
          </div>
        </button>`;
      const wrongN = VDStore.wrongWords(words).length;
      const starN = VDStore.starWords(words).length;
      $view().innerHTML = `
        <div class="wc-menu-top">
          <img class="wc-menu-banner" src="img/wc/banner.png" alt="" onerror="this.remove()">
          <h1>字鬥英雄</h1>
        </div>
        ${VDGame.heroStrip()}
        ${VDGame.dailyPanel()}
        ${dashboard(words, stageName)}
        ${levelChips()}
        <div class="menu-group">
          <div class="menu-glabel">練習</div>
          <div class="wc-mgrid">
            ${card('flash', 'm_flash', '🃏', '閃卡練功', '五盒間隔複習，記得牢')}
            ${card('quiz', 'm_quiz', '✍️', '單字自測', '三題型隨機，一輪十題')}
            ${card('sprint', 'm_sprint', '⏱️', '限時衝刺', '60 秒搶答，衝高分')}
            ${wrongN ? card('review', 'm_review', '🩹', '錯題複習', '只練你答錯過的字', false, wrongN) : ''}
          </div>
        </div>
        <div class="menu-group">
          <div class="menu-glabel">對戰</div>
          <div class="wc-mgrid">
            ${card('battle', 'm_battle', '🎭', '文學家對戰', '八位文豪闖關／同機雙人搶答', true)}
          </div>
        </div>
        <div class="menu-group">
          <div class="menu-glabel">詞靈</div>
          <div class="wc-mgrid">
            ${card('pets', 'm_pets', '🐾', '詞靈夥伴', '20 隻字綴守護獸，學字餵養', true)}
            ${card('graph', 'm_graph', '🌌', '詞源星圖', '172 字綴星空，越學越亮')}
            ${card('petbattle', 'm_arena', '⚔️', '詞靈競技', '野生試煉＋影子對戰掉裝備')}
          </div>
        </div>
        <div class="menu-group">
          <div class="menu-glabel">題庫工具</div>
          <div class="wc-mgrid">
            ${card('search', 'm_search', '🔍', '查單字', '打英文或中文，秒查秒收藏')}
            ${card('affix', 'm_affix', '🧩', '字綴心智圖', '字首字尾字根，成串記憶')}
            ${card('exam', 'm_exam', '📝', '會考考古題', '104–115 閱讀 445 題')}
            ${card('cloud', 'm_cloud', '☁️', '雲端／班級榜', '跨裝置存進度・拚排名')}
            ${starN ? card('starred', 'm_starred', '⭐', '我的收藏', '只刷你加星的字', false, starN) : ''}
          </div>
        </div>
        <div class="menu-group">
          <div class="menu-glabel">英雄</div>
          <div class="wc-mgrid">
            ${card('hero', 'm_hero', '🦸', '英雄檔案', '稱號・徽章・字幣・自訂頭像', true)}
            ${card('shop', 'm_shop', '🏪', '字幣商店', '頭像框・護盾・復活羽毛')}
            ${card('dex', 'm_dex', '🖼️', '單字圖鑑', `把 ${allWords.length} 個字一格一格點亮`)}
          </div>
        </div>
        <div class="wc-menu-navrow">
          <button class="btn ghost" onclick="VDApp.go('stats')">📊 我的戰績</button>
          <button class="btn ghost" onclick="VDApp.go('stage')">切換學段</button>
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
      $view().innerHTML = header('會考英文考古題') + '<div id="mod"></div>';
      VDExam.start(document.getElementById('mod'));
    },
    flash() {
      $view().innerHTML = header('閃卡練功') + '<div id="mod"></div>';
      VDFlash.start(scopeWords(), document.getElementById('mod'));
    },
    review() {
      const wrong = VDStore.wrongWords(scopeWords());
      $view().innerHTML = header('錯題複習') + '<div id="mod"></div>';
      VDFlash.start(wrong, document.getElementById('mod'), { raw: true });
    },
    quiz() {
      $view().innerHTML = header('單字自測') + '<div id="mod"></div>';
      VDQuiz.start(scopeWords(), document.getElementById('mod'));
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
    }
  };

  function go(name) { document.body.dataset.view = name; views[name](); }

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

  async function init() {
    const res = await fetch('data/words.json');
    allWords = await res.json();
    VDEnrich.ensure();  // 詞彙深度資料背景載入，供閃卡／自測／字綴顯示英英定義＋搭配詞
    VDGame.init();      // 遊戲化引擎：XP／稱號／徽章／每日任務／字幣／護盾
    applyFontScale();
    go(VDStore.stage ? 'menu' : 'stage');
  }

  function setSub(v) { VDStore.sub = v; go('menu'); }

  return { init, go, setSub, scopeWords, words: () => allWords, starClick, toggleFontScale };
})();

document.addEventListener('DOMContentLoaded', VDApp.init);
