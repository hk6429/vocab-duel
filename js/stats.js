/* 統計儀表板 */
const VDStats = (() => {
  function bar(pct, label) {
    return `<div class="stat-bar-label">${label}</div>
      <div class="stat-bar"><div class="stat-bar-fill" style="width:${pct}%"></div><span>${pct}%</span></div>`;
  }

  /* 弱點分析：各級距錯題率＋錯最兇的字 */
  function weakness(allWords) {
    const LV = [['E', '國小'], ['J', '國中'], ['S', '高中']];
    const rows = LV.map(([lv, name]) => {
      const ws = allWords.filter(w => lv === 'S' ? w.level.startsWith('S') : w.level === lv);
      const learned = ws.filter(w => VDStore.box(w.word) >= 0);
      const wrong = VDStore.wrongWords(learned);
      const rate = learned.length ? Math.round(wrong.length / learned.length * 100) : 0;
      return { name, learned: learned.length, wrong: wrong.length, rate };
    }).filter(r => r.learned);
    if (!rows.length) return '<div class="pg-hint">先去閃卡或自測練幾個字，這裡就會告訴你弱點在哪。</div>';
    const worst = rows.slice().sort((a, b) => b.rate - a.rate)[0];
    const topWrong = VDStore.wrongWords(allWords).slice(0, 10);
    return `
      ${rows.map(r => bar(r.rate, `${r.name}：錯題 ${r.wrong}/${r.learned} 學過字${r === worst && r.rate ? '　⚠️ 最弱' : ''}`)).join('')}
      ${topWrong.length ? `<div class="pg-hint" style="margin-top:8px">🔥 錯最兇：${topWrong.map(w => `<b>${w.word}</b>`).join('、')}</div>
      <button class="btn small" onclick="VDApp.go('review')">🃏 立刻複習錯題</button>` : '<div class="pg-hint">目前沒有掛在錯題本上的字，讚！</div>'}`;
  }

  /* 字綴弱點：學了不少但精熟率低的家族（要等 VDPets 資料） */
  async function affixWeak(el) {
    try {
      if (!window.VDPets) return;
      await VDPets.init();
      const weak = VDPets.affixStats()
        .filter(a => a.learned >= 3)
        .map(a => {
          let mastered = 0;
          for (const m of a.members) if (VDStore.box(m.toLowerCase()) >= 3) mastered++;
          return { ...a, mrate: Math.round(mastered / a.learned * 100) };
        })
        .sort((x, y) => x.mrate - y.mrate).slice(0, 3);
      const box = el.querySelector('#stat-affix');
      if (!box || !weak.length) return;
      box.innerHTML = `<div class="pg-hint" style="margin-top:8px">🧩 最弱字綴家族（學了但精熟率低）：
        ${weak.map(a => `<b>${a.form}</b>（${a.meaning}，精熟 ${a.mrate}%）`).join('、')}——去「字綴心智圖」整族補強！</div>`;
    } catch { /* 資料沒到就靜默 */ }
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
      <div class="wc-card">
        <img class="wc-card-img" src="img/ui/h_stats.png" alt="" onerror="this.remove()">
        <div class="wc-card-body">
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
        </div>
      </div>
      <div class="wc-card">
        <div class="wc-card-body">
          <div class="hero-sec">🎯 弱點分析</div>
          ${weakness(allWords)}
          <div id="stat-affix"></div>
        </div>
      </div>
      <div class="wc-card">
        <div class="wc-card-body">
          <div class="hero-sec">進度備份</div>
          <div class="io-box">
            <button class="btn ghost" id="btnExport">匯出進度碼</button>
            <button class="btn ghost" id="btnImport">匯入進度碼</button>
            <textarea id="ioText" placeholder="匯出的進度碼會顯示在這裡；匯入時把進度碼貼進來再按匯入"></textarea>
          </div>
        </div>
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
    affixWeak(el);
  }

  return { render };
})();
