/* 統計儀表板 */
const VDStats = (() => {
  function bar(pct, label) {
    return `<div class="stat-bar-label">${label}</div>
      <div class="stat-bar"><div class="stat-bar-fill" style="width:${pct}%"></div><span>${pct}%</span></div>`;
  }

  function render(allWords, el) {
    const eWords = allWords.filter(w => w.level === 'E');
    const jWords = allWords.filter(w => w.level === 'E' || w.level === 'J');
    const scope = VDApp.scopeWords();
    const s = VDStore.stats(scope);
    const sE = VDStore.stats(eWords);
    const sJ = VDStore.stats(jWords);
    const sAll = VDStore.stats(allWords);
    const pct = (m, t) => Math.round(m / t * 100);
    el.innerHTML = `
      <div class="stat-grid">
        <div class="stat-tile"><div class="stat-num">${sAll.mastered}</div><div class="stat-cap">已掌握單字</div></div>
        <div class="stat-tile"><div class="stat-num">${sAll.seen}</div><div class="stat-cap">學過單字</div></div>
        <div class="stat-tile"><div class="stat-num">${s.todayCount}</div><div class="stat-cap">今日複習</div></div>
        <div class="stat-tile"><div class="stat-num">${s.streak}</div><div class="stat-cap">連續天數</div></div>
      </div>
      ${bar(pct(sE.mastered, eWords.length), `國小 1200 字（${sE.mastered}/${eWords.length}）`)}
      ${bar(pct(sJ.mastered, jWords.length), `國中 2000 字（${sJ.mastered}/${jWords.length}）`)}
      ${bar(pct(sAll.mastered, allWords.length), `高中 6000 字（${sAll.mastered}/${allWords.length}）`)}
      <div class="stat-note">「已掌握」= 熟悉度達第 3 盒以上；目前學段待複習 ${s.due} 字</div>
      <div class="io-box">
        <button class="btn ghost" id="btnExport">匯出進度碼</button>
        <button class="btn ghost" id="btnImport">匯入進度碼</button>
        <textarea id="ioText" placeholder="匯出的進度碼會顯示在這裡；匯入時把進度碼貼進來再按匯入"></textarea>
      </div>`;
    el.querySelector('#btnExport').onclick = () => {
      el.querySelector('#ioText').value = VDStore.exportCode();
    };
    el.querySelector('#btnImport').onclick = () => {
      try {
        VDStore.importCode(el.querySelector('#ioText').value);
        alert('匯入成功！');
        VDApp.go('stats');
      } catch { alert('進度碼格式不對，請確認後再試。'); }
    };
  }

  return { render };
})();
