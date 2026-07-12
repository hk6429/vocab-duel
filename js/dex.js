/* 單字圖鑑：6205 字收集牆——未學灰影、學過半亮、掌握全亮，滿區給徽章（completionist hook） */
const VDDex = (() => {
  let el = null;
  const GROUPS = [
    { key: 'E', name: '國小 1200', match: w => w.level === 'E' },
    { key: 'J', name: '國中 2000', match: w => w.level === 'J' },
    { key: 'S1', name: '高中 L1', match: w => w.level === 'S1' },
    { key: 'S2', name: '高中 L2', match: w => w.level === 'S2' },
    { key: 'S3', name: '高中 L3', match: w => w.level === 'S3' },
    { key: 'S4', name: '高中 L4', match: w => w.level === 'S4' },
    { key: 'S5', name: '高中 L5', match: w => w.level === 'S5' },
    { key: 'S6', name: '高中 L6', match: w => w.level === 'S6' }
  ];

  function groupStats(words) {
    let seen = 0, mastered = 0;
    for (const w of words) {
      const b = VDStore.box(w.word);
      if (b >= 0) seen++;
      if (b >= 3) mastered++;
    }
    return { seen, mastered, total: words.length };
  }

  function render(container) {
    el = container;
    const all = VDApp.words();
    const secs = GROUPS.map(gr => {
      const words = all.filter(gr.match);
      if (!words.length) return '';
      const s = groupStats(words);
      const full = s.seen === s.total;
      return `<div class="dex-sec">
        <button class="dex-head" data-k="${gr.key}">
          <span class="dex-title">${gr.name} ${full ? '🏆' : ''}</span>
          <span class="dex-stat">點亮 <b>${s.seen}</b>/${s.total}　全亮 <b class="dex-gold">${s.mastered}</b></span>
          <span class="dex-bar"><span class="seen" style="width:${s.seen / s.total * 100}%"></span><span class="gold" style="width:${s.mastered / s.total * 100}%"></span></span>
          <span class="dex-arrow">▾</span>
        </button>
        <div class="dex-wall" data-wall="${gr.key}" hidden></div>
      </div>`;
    }).join('');
    const totals = groupStats(all);
    el.innerHTML = `
      <div class="wc-card">
        <img loading="lazy" decoding="async" class="wc-card-img" src="img/ui/h_dex.webp" alt="" onerror="this.remove()">
        <div class="wc-card-body">
          <div class="hero-sec">單字圖鑑　<b>${totals.seen}</b> / ${totals.total} 點亮</div>
          <div class="dex-legend">
            <span><i class="dex-dot"></i> 未遇見</span>
            <span><i class="dex-dot seen"></i> 已點亮（練過）</span>
            <span><i class="dex-dot gold"></i> 全亮（已掌握）</span>
          </div>
          ${secs}
        </div>
      </div>
      <div id="eq-dex"></div>
      ${VDGame.milestoneHtml()}
      <button class="btn ghost wide" onclick="VDApp.go('menu')">回主選單</button>`;
    renderEqDex();
    el.querySelectorAll('.dex-head').forEach(b => b.onclick = () => toggleWall(b.dataset.k, all));
    // 點格子看字：事件委派，6 千格只掛一個 listener
    el.onclick = e => {
      const cell = e.target.closest('[data-w]');
      if (!cell) return;
      const w = all.find(x => x.word === cell.dataset.w);
      if (w) VDGame.toast(`<b>${w.word}</b>　${w.zh}`);
    };
  }

  /* 裝備圖鑑：16 名稱 × 3 階收集牆（打過寶就點亮） */
  function renderEqDex() {
    const box = el.querySelector('#eq-dex');
    if (!box || !window.VDPets) return;
    VDPets.init().then(() => {
      if (!box.isConnected) return;
      const items = VDPets.eqDex();
      const got = items.filter(x => x.got).length;
      const TIER_N = { common: '普通', rare: '稀有', legendary: '傳說' };
      box.innerHTML = `
        <div class="wc-card">
          <div class="wc-card-body">
            <div class="hero-sec">裝備圖鑑　<b>${got}</b> / ${items.length} 收集</div>
            ${['common', 'rare', 'legendary'].map(tier => `
              <div class="pg-sub">${TIER_N[tier]}</div>
              <div class="eqdex-row">${items.filter(x => x.tier === tier).map(x =>
                `<span class="eqdex-cell t-${tier} ${x.got ? 'got' : ''}" title="${x.got ? x.base : '？？？'}">${x.got ? x.ico : '❔'}<i>${x.got ? x.base : '？？？'}</i></span>`).join('')}</div>`).join('')}
            <div class="hero-shieldhint">野生試煉、影子對戰與鍛造都會掉裝備——集滿一整排！</div>
          </div>
        </div>`;
    });
  }

  function toggleWall(key, all) {
    const wall = el.querySelector(`[data-wall="${key}"]`);
    if (!wall.hidden) { wall.hidden = true; return; }
    if (!wall.innerHTML) {
      const gr = GROUPS.find(g => g.key === key);
      const words = all.filter(gr.match);
      wall.innerHTML = words.map(w => {
        const b = VDStore.box(w.word);
        const cls = b >= 3 ? 'gold' : b >= 0 ? 'seen' : '';
        return `<span class="dex-cell ${cls}" data-w="${w.word}" title="${w.word}"></span>`;
      }).join('');
    }
    wall.hidden = false;
  }

  return { render };
})();
window.VDDex = VDDex;
