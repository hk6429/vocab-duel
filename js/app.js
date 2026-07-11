/* 字鬥英雄：主控與畫面切換 */
const VDApp = (() => {
  let allWords = [];

  const $view = () => document.getElementById('view');

  function scopeWords() {
    const s = VDStore.stage;
    if (s === 'E') return allWords.filter(w => w.level === 'E');
    if (s === 'J') return allWords.filter(w => w.level === 'E' || w.level === 'J');
    return allWords; // S=高中，含全部
  }

  function header(title) {
    return `<div class="topbar"><button class="back" onclick="VDApp.go('menu')">←</button><h2>${title}</h2></div>`;
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

  const views = {
    stage() {
      $view().innerHTML = `
        <div class="hero"><h1>字鬥英雄</h1><p>從 1200 到 2000，一字一戰！</p></div>
        <div class="stage-btns">
          <button class="btn stage" data-s="E">🏫 國小挑戰<br><span>基本 1200 字</span></button>
          <button class="btn stage" data-s="J">🎓 國中挑戰<br><span>常用 2000 字</span></button>
          <button class="btn stage" data-s="S">🏆 高中挑戰<br><span>學測 6000 字（Level 1–6）</span></button>
        </div>`;
      document.querySelectorAll('.stage').forEach(b => {
        b.onclick = () => { VDStore.stage = b.dataset.s; go('menu'); };
      });
    },
    menu() {
      const words = scopeWords();
      const stageName = { E: '國小 1200', J: '國中 2000', S: '高中 6000' }[VDStore.stage];
      const item = (view, cls, ico, title, sub) =>
        `<button class="btn main ${cls}" onclick="VDApp.go('${view}')">
          <span class="m-ico">${ico}</span>
          <span>${title}<span class="m-sub">${sub}</span></span>
        </button>`;
      $view().innerHTML = `
        <div class="hero small"><h1>字鬥英雄</h1></div>
        ${dashboard(words, stageName)}
        <div class="menu-group">
          <div class="menu-glabel">練習</div>
          ${item('flash', 'c-study', '🃏', '閃卡練功', '五盒間隔複習，記得牢')}
          ${item('quiz', 'c-study', '✍️', '單字自測', '三題型隨機，一輪十題')}
        </div>
        <div class="menu-group">
          <div class="menu-glabel">對戰</div>
          ${item('battle', 'c-battle', '🎭', '文學家對戰', '八位文豪闖關／同機雙人搶答')}
        </div>
        <div class="menu-group">
          <div class="menu-glabel">題庫工具</div>
          ${item('affix', 'c-tool', '🧩', '字綴心智圖', '字首字尾字根，成串記憶')}
          ${item('exam', 'c-tool', '📝', '會考考古題', '104–115 年英語閱讀 445 題')}
        </div>
        <div class="menu-foot">
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
    quiz() {
      $view().innerHTML = header('單字自測') + '<div id="mod"></div>';
      VDQuiz.start(scopeWords(), document.getElementById('mod'));
    },
    stats() {
      $view().innerHTML = header('我的戰績') + '<div id="mod"></div>';
      VDStats.render(allWords, document.getElementById('mod'));
    }
  };

  function go(name) { document.body.dataset.view = name; views[name](); }

  async function init() {
    const res = await fetch('data/words.json');
    allWords = await res.json();
    go(VDStore.stage ? 'menu' : 'stage');
  }

  return { init, go, scopeWords, words: () => allWords };
})();

document.addEventListener('DOMContentLoaded', VDApp.init);
