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

  /* 自我基準卡：只跟自己比 — 14 天精熟曲線＋本週 vs 上週＋近期正確率
     所有人的戰績頁都顯示；安心模式的班級榜也複用這張卡 */
  function selfCard() {
    let meta = {};
    try { meta = JSON.parse(localStorage.getItem('vd_meta')) || {}; } catch { /* 沒有紀錄 */ }
    const hist = meta.hist || {};
    const t = VDStore.today();
    const addDays = (ds, n) => { const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
    // 14 天精熟數序列：缺快照的日子沿用前一筆（快照只在有練的日子拍）
    const dates = Object.keys(hist).sort();
    const series = [];
    for (let i = 13; i >= 0; i--) {
      const d = addDays(t, -i);
      let v = null;
      for (const h of dates) { if (h <= d) v = hist[h]; else break; }
      series.push(v);
    }
    const nums = series.map(v => v == null ? 0 : v);
    const hasData = dates.length >= 2 && nums[13] > 0;
    let spark = '';
    if (hasData) {
      const min = Math.min(...nums), max = Math.max(...nums), span = Math.max(1, max - min);
      const pts = nums.map((v, i) => `${(i / 13 * 100).toFixed(1)},${(30 - (v - min) / span * 26).toFixed(1)}`).join(' ');
      spark = `<svg viewBox="0 0 100 32" preserveAspectRatio="none" style="width:100%;height:44px;display:block" aria-label="近 14 天精熟曲線">
        <polyline points="${pts}" fill="none" stroke="#4a8f52" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>
        <div class="pg-hint" style="display:flex;justify-content:space-between"><span>14 天前：${nums[0]} 字</span><span>今天：${nums[13]} 字</span></div>`;
    }
    // 本週 vs 上週新增精熟：用週一快照基準相減；資料不足顯示 —
    const monday = (ds) => { const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.toLocaleDateString('sv-SE'); };
    const thisMon = monday(t), lastMon = addDays(thisMon, -7);
    const baseAt = (cut) => { let b = null; for (const d of dates) { if (d < cut) b = hist[d]; else break; } return b; };
    const thisWeek = VDStore.weekMastered();
    const b1 = baseAt(thisMon), b0 = baseAt(lastMon);
    const lastWeek = (b1 != null && b0 != null) ? Math.max(0, b1 - b0) : null;
    const diff = lastWeek == null ? null : thisWeek - lastWeek;
    const acc = VDStore.recentAcc(20);
    const accLine = acc == null ? '' :
      `<div class="pg-hint">🎯 最近 20 題正確率 <b>${Math.round(acc * 100)}%</b>${acc >= 0.8 ? '——穩得很！' : acc >= 0.5 ? '——持續進步中' : '——錯的字都記進弱字本了，慢慢清'}</div>`;
    return `<div class="wc-card"><div class="wc-card-body">
      <div class="hero-sec">🕊️ 跟自己比</div>
      ${spark || '<div class="pg-hint">再累積幾天練習，這裡會畫出你的成長曲線。</div>'}
      <div class="pg-hint">⚡ 本週新掌握 <b>${thisWeek}</b> 字${lastWeek == null ? '' :
        `・上週 ${lastWeek} 字${diff > 0 ? `——比上週多 ${diff} 字 👏` : diff === 0 ? '——持平' : `——再補 ${-diff} 字就追平上週`}`}</div>
      ${accLine}
    </div></div>`;
  }

  /* 老師字表指派進度：每份顯示 完成 N/M（box≥1）進度條 */
  function assignmentCard() {
    const asg = VDStore.assignments();
    const codes = Object.keys(asg).sort((a, b) => asg[b].ts - asg[a].ts);
    if (!codes.length) return '';
    const rows = codes.map(c => {
      const a = asg[c];
      const done = a.words.filter(w => VDStore.box(w) >= 1).length;
      return bar(Math.round(done / a.words.length * 100), `${VDGame.esc(a.name)}（${c}）：完成 ${done}/${a.words.length}`);
    }).join('');
    return `<div class="wc-card"><div class="wc-card-body">
      <div class="hero-sec">📋 老師指派字表</div>${rows}
      <div class="pg-hint">「完成」= 該字熟悉度達第 1 盒以上</div>
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
    const pct = (m, t) => +(m / t * 100).toFixed(1); // 一位小數：前幾週才不會永遠卡在 0%
    const unit = VDStore.unitInfo(scope);
    const rep = VDStore.streakRepairInfo();
    el.innerHTML = `
      <div class="wc-card">
        <img loading="lazy" decoding="async" class="wc-card-img" src="img/ui/h_stats.webp" alt="" onerror="this.remove()">
        <div class="wc-card-body">
          <div class="stat-grid">
            <div class="stat-tile"><div class="stat-num">${sAll.mastered}</div><div class="stat-cap">已掌握單字</div></div>
            <div class="stat-tile"><div class="stat-num">${sAll.seen}</div><div class="stat-cap">學過單字</div></div>
            <div class="stat-tile"><div class="stat-num">${s.todayCount}</div><div class="stat-cap">今日複習</div></div>
            <div class="stat-tile"><div class="stat-num">${s.streak}</div><div class="stat-cap">連續天數</div></div>
          </div>
          ${rep ? `<div class="pg-hint">🔥 連續 ${rep.was} 天斷掉了！<button class="btn small" id="btnRecallFix">🏮 免費打 5 題接回</button><button class="btn small" id="btnRepair">🛠️ 花 ${rep.cost} 字幣接回</button></div>` : ''}
          ${bar(pct(sE.mastered, eWords.length), `國小 1200 字（${sE.mastered}/${eWords.length}）`)}
          ${bar(pct(sJ.mastered, jWords.length), `國中 2000 字（${sJ.mastered}/${jWords.length}）`)}
          ${bar(pct(sAll.mastered, allWords.length), `高中 6000 字（${sAll.mastered}/${allWords.length}）`)}
          ${unit ? bar(Math.round(unit.done / unit.total * 100), `本包進度：第 ${unit.packNo} 包（${unit.done}/${unit.total}）`) : ''}
          <div class="stat-note">「已掌握」= 熟悉度達第 3 盒以上；目前學段待複習 ${s.due} 字${s.due > 40 ? '——別擔心，每天 20 字慢慢清' : ''}</div>
        </div>
      </div>
      ${weekCard()}
      ${selfCard()}
      <div class="wc-card">
        <div class="wc-card-body">
          <div class="hero-sec">🎯 弱點分析</div>
          ${weakness(allWords)}
          <div id="stat-affix"></div>
        </div>
      </div>
      ${assignmentCard()}
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
    // 首行可寫 #assignment:代碼,名稱 → 存成「老師指派字表」，戰績頁追蹤完成進度
    el.querySelector('#btnWords').onclick = () => {
      let lines = el.querySelector('#ioText').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      let asg = null;
      const m = lines.length && lines[0].match(/^#assignment:\s*([^,，]+)[,，]\s*(.+)$/i);
      if (m) { asg = { code: m[1].trim(), name: m[2].trim() }; lines = lines.slice(1); }
      lines = lines.map(s => s.toLowerCase());
      if (!lines.length) { alert('請先把單字清單（一行一個字）貼進上面的文字框。'); return; }
      const dict = new Map(allWords.map(w => [w.word.toLowerCase(), w.word]));
      let n = 0, miss = 0;
      const hit = [];
      for (const lw of new Set(lines)) {
        const word = dict.get(lw);
        if (!word) { miss++; continue; }
        VDStore.enroll(word);
        if (!VDStore.isStar(word)) VDStore.toggleStar(word);
        hit.push(word);
        n++;
      }
      if (asg && hit.length) VDStore.addAssignment(asg.code, asg.name, hit);
      alert(`匯入 ${n} 字（已加入複習佇列並加星）${miss ? `、${miss} 字不在字庫` : ''}${asg && hit.length ? `\n已建立指派「${asg.name}」（${asg.code}），戰績頁可追進度` : ''}`);
      VDApp.go('stats');
    };
    const recallBtn = el.querySelector('#btnRecallFix');
    if (recallBtn) recallBtn.onclick = () => VDApp.go('recall');
    const repBtn = el.querySelector('#btnRepair');
    if (repBtn) repBtn.onclick = () => {
      const ns = VDStore.repairStreak();
      VDGame.toast(ns ? `🔥 連續紀錄接回來了！目前 ${ns} 天` : '字幣不夠，先去練功賺一點吧');
      if (ns) VDApp.go('stats');
    };
    affixWeak(el);
  }

  return { render, selfCard };
})();
