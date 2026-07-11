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

  /* 家長週報：本週（週一起）練習天數、總答題數、每日條狀圖 */
  function weekCard() {
    let daily = {};
    try { daily = (JSON.parse(localStorage.getItem('vd_meta')) || {}).daily || {}; } catch { /* 沒有紀錄 */ }
    const t = VDStore.today();
    const base = new Date(t + 'T00:00:00');
    base.setDate(base.getDate() - (base.getDay() + 6) % 7); // 退到本週一
    const W = ['一', '二', '三', '四', '五', '六', '日'];
    let total = 0, days = 0, cells = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(base); d.setDate(d.getDate() + i);
      const ds = d.toLocaleDateString('sv-SE');
      const n = daily[ds] || 0;
      const future = ds > t;
      if (n > 0) { total += n; days++; }
      cells += `<div style="text-align:center;font-size:12px" title="${ds}：${n} 題">
        <div>${W[i]}</div>
        <div style="width:26px;height:26px;border-radius:6px;margin:2px auto 0;
          background:${n > 0 ? '#4a8f52' : '#e9e2d3'};opacity:${future ? 0.35 : 1}"></div></div>`;
    }
    return `<div class="wc-card"><div class="wc-card-body">
      <div class="hero-sec">📅 本週學習</div>
      <div style="display:flex;gap:8px;margin:8px 0">${cells}</div>
      <div class="pg-hint">本週練習 <b>${days}</b> 天・共答 <b>${total}</b> 題（週一起算，實心＝當天有練）</div>
    </div></div>`;
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
      ${weekCard()}
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
            <button class="btn ghost" id="btnWords">匯入單字清單</button>
            <textarea id="ioText" placeholder="匯出的進度碼會顯示在這裡；匯入時把進度碼貼進來再按匯入。匯入單字清單：一行一個英文字，貼進來後按「匯入單字清單」"></textarea>
            <div class="pg-hint">匯入的單字會加入複習佇列並加 ⭐ 收藏（例如老師發的考前字表）；「批次標熟」待進度引擎支援後推出。</div>
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
    // 批次匯入字表：按行拆字 → 比對字庫 → enroll ＋ 加星
    el.querySelector('#btnWords').onclick = () => {
      const lines = el.querySelector('#ioText').value.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean);
      if (!lines.length) { alert('請先把單字清單（一行一個字）貼進上面的文字框。'); return; }
      const dict = new Map(allWords.map(w => [w.word.toLowerCase(), w.word]));
      let n = 0, miss = 0;
      for (const lw of new Set(lines)) {
        const word = dict.get(lw);
        if (!word) { miss++; continue; }
        VDStore.enroll(word);
        if (!VDStore.isStar(word)) VDStore.toggleStar(word);
        n++;
      }
      alert(`匯入 ${n} 字（已加入複習佇列並加星）${miss ? `、${miss} 字不在字庫` : ''}`);
      VDApp.go('stats');
    };
    affixWeak(el);
  }

  return { render };
})();
