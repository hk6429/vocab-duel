/* 字鬥英雄：主控與畫面切換 */
const VDApp = (() => {
  let allWords = [];

  const $view = () => document.getElementById('view');

  function scopeWords() {
    return VDStore.stage === 'E' ? allWords.filter(w => w.level === 'E') : allWords;
  }

  function header(title) {
    return `<div class="topbar"><button class="back" onclick="VDApp.go('menu')">←</button><h2>${title}</h2></div>`;
  }

  const views = {
    stage() {
      $view().innerHTML = `
        <div class="hero"><h1>字鬥英雄</h1><p>從 1200 到 2000，一字一戰！</p></div>
        <div class="stage-btns">
          <button class="btn stage" data-s="E">🏫 國小挑戰<br><span>基本 1200 字</span></button>
          <button class="btn stage" data-s="J">🎓 國中挑戰<br><span>常用 2000 字</span></button>
        </div>`;
      document.querySelectorAll('.stage').forEach(b => {
        b.onclick = () => { VDStore.stage = b.dataset.s; go('menu'); };
      });
    },
    menu() {
      const s = VDStore.stats(scopeWords());
      const stageName = VDStore.stage === 'E' ? '國小 1200' : '國中 2000';
      $view().innerHTML = `
        <div class="hero small"><h1>字鬥英雄</h1>
          <p>${stageName} 字｜已掌握 ${s.mastered} 字｜待複習 ${s.due} 字</p></div>
        <div class="menu-btns">
          <button class="btn main" onclick="VDApp.go('flash')">🃏 閃卡練功</button>
          <button class="btn main" onclick="VDApp.go('quiz')">⚔️ 單字自測</button>
          <button class="btn main" onclick="VDApp.go('stats')">📊 我的戰績</button>
          <button class="btn ghost" onclick="VDApp.go('stage')">切換學段</button>
        </div>`;
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

  function go(name) { views[name](); }

  async function init() {
    const res = await fetch('data/words.json');
    allWords = await res.json();
    go(VDStore.stage ? 'menu' : 'stage');
  }

  return { init, go, scopeWords };
})();

document.addEventListener('DOMContentLoaded', VDApp.init);
