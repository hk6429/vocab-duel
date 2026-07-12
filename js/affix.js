/* 字綴心智圖：字首/字尾/字根資料庫 → SVG 放射家族圖 → 點字看拆解、整族加閃卡 */
const VDAffix = (() => {
  let data = null;          // { prefixes, suffixes, roots }
  let wmap = null;          // word(lower) → 字物件
  let el = null;
  const TABS = [
    { key: 'prefixes', label: '字首' },
    { key: 'suffixes', label: '字尾' },
    { key: 'roots', label: '字根' }
  ];
  let tab = 'prefixes';

  async function ensureData() {
    if (data) return;
    data = await (await fetch('data/affixes.json')).json();
    wmap = {};
    for (const w of VDApp.words()) wmap[w.word.toLowerCase()] = w;
  }

  function wordOf(m) { return wmap[m.toLowerCase()] || null; }

  async function start(container) {
    el = container;
    el.innerHTML = '<div class="loading">載入字綴庫…</div>';
    await ensureData();
    renderList();
  }

  /* 本週主題家族：讀 VDGame.weekInfo().affixIdx（別組提供；沒有就不顯示週主題） */
  function weekTheme() {
    if (!(window.VDGame && typeof VDGame.weekInfo === 'function')) return null;
    try {
      const wi = VDGame.weekInfo();
      if (!wi || wi.affixIdx == null) return null;
      const all = [];
      for (const t of TABS) for (const a of (data[t.key] || [])) all.push({ tab: t.key, a });
      if (!all.length) return null;
      return all[((wi.affixIdx % all.length) + all.length) % all.length];
    } catch { return null; }
  }

  function renderList() {
    let list = (data[tab] || []).slice();
    const theme = weekTheme();
    if (theme && theme.tab === tab) {
      list = [theme.a].concat(list.filter(a => a !== theme.a)); // 本週主題置頂
    }
    el.innerHTML = `
      <div class="af-tabs">${TABS.map(t =>
        `<button class="af-tab ${t.key === tab ? 'on' : ''}" data-k="${t.key}">${t.label}<span>${(data[t.key] || []).length}</span></button>`).join('')}</div>
      <div class="af-hint">點任一字綴，看它的單字家族心智圖</div>
      <div class="af-grid">${list.map((a, i) => `
        <button class="af-card" data-i="${i}">
          ${theme && a === theme.a ? '<span class="af-week">⭐ 本週主題</span>' : ''}
          <span class="af-form">${a.form}</span>
          <span class="af-mean">${a.meaning}</span>
          <span class="af-count">${a.members.length} 字</span>
        </button>`).join('')}</div>`;
    el.querySelectorAll('.af-tab').forEach(b => b.onclick = () => { tab = b.dataset.k; renderList(); });
    el.querySelectorAll('.af-card').forEach(b => b.onclick = () => renderMap(list[+b.dataset.i]));
  }

  /* SVG 放射心智圖：中心＝字綴，輻條＝家族字（最多顯示 14 個，避免擁擠） */
  function renderMap(affix) {
    const shown = affix.members.map(wordOf).filter(Boolean);
    const nodes = shown.slice(0, 14);
    const W = 340, H = 340, cx = W / 2, cy = H / 2, R = 128;
    const spokes = nodes.map((w, i) => {
      const ang = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(ang) * R, y = cy + Math.sin(ang) * R;
      return { w, x, y };
    });
    /* 水彩墨風：弧形墨線輻條、手感微傾紙卡、暈染中心、水彩點綴 */
    const lines = spokes.map((s, i) => {
      const mx = (cx + s.x) / 2, my = (cy + s.y) / 2;
      const dx = s.y - cy, dy = cx - s.x, len = Math.hypot(dx, dy) || 1;
      const bend = (i % 2 ? 9 : -9);
      return `<path d="M${cx},${cy} Q${mx + dx / len * bend},${my + dy / len * bend} ${s.x},${s.y}" class="af-edge"/>`;
    }).join('');
    const dots = spokes.map((s, i) => `
      <circle class="af-dot d${i % 3}" cx="${(cx + s.x * 2) / 3 + (i % 2 ? 8 : -8)}" cy="${(cy + s.y * 2) / 3 + (i % 3 - 1) * 7}" r="${2 + i % 3}"/>`).join('');
    const leaves = spokes.map((s, i) => `
      <g class="af-node" data-w="${s.w.word}" transform="translate(${s.x},${s.y}) rotate(${(i % 3 - 1) * 3})">
        <rect x="-36" y="-16" width="72" height="32" rx="10"/>
        <text y="1">${s.w.word.length > 9 ? s.w.word.slice(0, 8) + '…' : s.w.word}</text>
      </g>`).join('');
    el.innerHTML = `
      <button class="btn ghost af-back">← 回字綴清單</button>
      <div class="af-maphead"><span class="af-form big">${affix.form}</span><span class="af-mean">${affix.meaning}</span></div>
      <svg class="af-svg" viewBox="0 0 ${W} ${H}">
        <defs>
          <radialGradient id="afWash" cx="42%" cy="38%">
            <stop offset="0%" stop-color="#cfe0ee"/>
            <stop offset="62%" stop-color="#9dbcd9"/>
            <stop offset="100%" stop-color="#6f9fc9"/>
          </radialGradient>
          <filter id="afRough" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="7" result="n"/>
            <feDisplacementMap in="SourceGraphic" in2="n" scale="7"/>
          </filter>
        </defs>
        ${lines}
        ${dots}
        <g class="af-center" transform="translate(${cx},${cy})">
          <circle r="46" filter="url(#afRough)"/>
          <circle r="40" class="af-cinner" filter="url(#afRough)"/>
          <text class="af-ctext" y="1">${affix.form}</text>
        </g>
        ${leaves}
      </svg>
      ${affix.members.length > 14 ? `<div class="af-hint">此家族共 ${affix.members.length} 字，圖上顯示前 14 個</div>` : ''}
      <button class="btn af-addall">🃏 整族加入閃卡（${shown.length} 字）</button>
      <div id="afDetail"></div>`;
    el.querySelector('.af-back').onclick = renderList;
    el.querySelectorAll('.af-node').forEach(g => g.onclick = () => showDetail(g.dataset.w));
    el.querySelector('.af-addall').onclick = () => {
      let n = 0;
      shown.forEach(w => { if (VDStore.enroll(w.word)) n++; });
      alert(`已把 ${n} 個新單字加入閃卡待複習！`);
    };
  }

  function showDetail(word) {
    const w = wordOf(word);
    const box = el.querySelector('#afDetail');
    if (!w) { box.innerHTML = ''; return; }
    box.innerHTML = `
      <div class="af-detail">
        <div class="af-dword">${w.word} ${VDSpeak.btn(w.word)} <span class="af-pos">${w.pos.join('・')}</span> <button class="mini-star ${VDStore.isStar(w.word) ? 'on' : ''}" onclick="VDApp.starClick(this,'${w.word}')">${VDStore.isStar(w.word) ? '⭐' : '☆'}</button></div>
        <div class="af-dzh">${w.zh}</div>
        <div class="af-dex">${w.example} ${VDSpeak.btn(w.example)}</div>
        <div class="af-dexz">${w.example_zh}</div>
        ${VDEnrich.block(w.word)}
        <button class="btn ghost af-add1">加入閃卡</button>
      </div>`;
    box.querySelector('.af-add1').onclick = () => {
      const added = VDStore.enroll(w.word);
      alert(added ? `「${w.word}」已加入閃卡！` : `「${w.word}」已經在你的閃卡裡了`);
    };
  }

  return { start };
})();
