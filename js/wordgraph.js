/* 單字關聯圖 VDWordGraph：Obsidian 式知識圖譜。
   每個「已學單字」是一顆小點，透過邊連到它的詞頭/詞尾/字根中樞；
   多綴單字落在多個中樞的重心、同時連多條邊；沒掛任何字綴的已學字沉為外圈背景點雲。
   金點＝精熟(盒≥3)、藍點＝已學。點中樞看家族、點字點看字義。 */
const VDWordGraph = (() => {
  let el = null, canvas = null, ctx = null, raf = 0, frame = 0;
  let hubs = [], words = [], loose = [];
  let wmap = {};
  let cam = { x: 0, y: 0, s: 1 };
  let hi = null; // 高亮中樞 index

  async function render(container) {
    el = container;
    el.innerHTML = '<div class="loading">載入單字關聯圖…</div>';
    await VDPets.init();
    wmap = {};
    for (const w of VDApp.words()) wmap[w.word.toLowerCase()] = w;
    build();
    el.innerHTML = `
      <div class="wc-card">
        <img loading="lazy" decoding="async" class="wc-card-img" src="img/ui/h_graph.webp" alt="" onerror="this.remove()">
        <div class="wc-card-body">
          <p class="pg-hint">你學過的每個字都是一顆星——連著它的詞頭、詞尾或字根。金色＝精熟、藍色＝已學；外圈灰點是還沒掛上字綴的字。點中樞看整個家族，點小點看字義。拖曳移動、滾輪縮放。</p>
          <div class="wg-stats">${statsLine()}</div>
          <canvas id="wg-canvas"></canvas>
          <div id="wg-words"></div>
        </div>
      </div>
      ${VDGame.milestoneHtml()}
      <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button>`;
    canvas = el.querySelector('#wg-canvas');
    ctx = canvas.getContext('2d');
    const w = Math.min(el.clientWidth - 32, 860);
    canvas.width = w * devicePixelRatio; canvas.height = 560 * devicePixelRatio;
    canvas.style.width = w + 'px'; canvas.style.height = '560px';
    ctx.scale(devicePixelRatio, devicePixelRatio);
    cam = { x: w / 2, y: 280, s: Math.min(1, w / 900) };
    bindCanvas();
    frame = 0;
    tick();
  }

  /* ── 建圖：只納入「已學」單字 ── */
  function build() {
    hubs = []; words = []; loose = [];
    const stats = VDPets.affixStats();
    const wordHubs = {};             // 已學字 → [hub index...]
    const GA = Math.PI * (3 - Math.sqrt(5)); // 黃金角

    // 中樞：有已學成員的字綴才進圖（0 字家族只會製造噪音）
    const active = stats.filter(s => s.learned > 0)
      .sort((a, b) => b.learned - a.learned);
    active.forEach((s, i) => {
      const orbit = 16 + 7 * Math.sqrt(s.learned);
      // 黃金角螺旋錨點，力導向再鬆開重疊
      const r = 90 + 34 * Math.sqrt(i);
      const a = i * GA;
      hubs.push({ s, orbit, ax: Math.cos(a) * r, ay: Math.sin(a) * r,
                  x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, n: 0 });
      for (const m of s.members) {
        const k = m.toLowerCase();
        if (VDStore.box(k) < 0) continue;
        (wordHubs[k] = wordHubs[k] || []).push(hubs.length - 1);
      }
    });
    for (const k in wordHubs) {
      words.push({ k, hubIdx: wordHubs[k], gold: VDStore.box(k) >= 3, x: 0, y: 0 });
    }
    // 沒掛字綴的已學字 → 外圈點雲
    let li = 0;
    for (const k in wmap) {
      if (VDStore.box(k) < 0 || wordHubs[k]) continue;
      const a = li * GA, r = 620 + 26 * Math.sqrt(li);
      loose.push({ k, gold: VDStore.box(k) >= 3, x: Math.cos(a) * r, y: Math.sin(a) * r });
      li++;
    }
  }

  /* 每幀依中樞現位擺放單字（單綴繞軌道、多綴取重心） */
  function placeWords() {
    for (const h of hubs) h.n = 0;
    for (const w of words) {
      if (w.hubIdx.length === 1) {
        const h = hubs[w.hubIdx[0]];
        const i = h.n++;
        const a = i * Math.PI * (3 - Math.sqrt(5));
        const r = h.orbit + 7 * Math.sqrt(i);
        w.x = h.x + Math.cos(a) * r; w.y = h.y + Math.sin(a) * r;
      } else {
        let cx = 0, cy = 0;
        for (const idx of w.hubIdx) { cx += hubs[idx].x; cy += hubs[idx].y; }
        cx /= w.hubIdx.length; cy /= w.hubIdx.length;
        // 穩定僞隨機抖動，避免多綴字疊成一點
        const hsh = [...w.k].reduce((a2, c) => (a2 * 31 + c.charCodeAt(0)) % 997, 7);
        w.x = cx + (hsh % 41) - 20; w.y = cy + (Math.floor(hsh / 41) % 41) - 20;
      }
    }
  }

  /* ── 中樞間力模擬（200 幀後凍結） ── */
  function step() {
    for (const h of hubs) {
      h.vx += (h.ax - h.x) * 0.008; h.vy += (h.ay - h.y) * 0.008;
    }
    for (let i = 0; i < hubs.length; i++) {
      for (let j = i + 1; j < hubs.length; j++) {
        const a = hubs[i], b = hubs[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        const min = a.orbit + b.orbit + 26;
        const d2 = dx * dx + dy * dy;
        if (d2 > min * min || d2 < 0.01) continue;
        const d = Math.sqrt(d2), f = (min - d) / d * 0.06;
        dx *= f; dy *= f;
        a.vx += dx; a.vy += dy; b.vx -= dx; b.vy -= dy;
      }
    }
    for (const h of hubs) { h.vx *= 0.8; h.vy *= 0.8; h.x += h.vx; h.y += h.vy; }
  }

  function draw() {
    placeWords();
    const w = canvas.width / devicePixelRatio, h = canvas.height / devicePixelRatio;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(cam.x, cam.y); ctx.scale(cam.s, cam.s);
    const inHi = idxs => hi === null || idxs.includes(hi);
    // 外圈點雲（永遠最淡）
    for (const p of loose) {
      ctx.globalAlpha = hi === null ? 0.22 : 0.08;
      ctx.fillStyle = p.gold ? '#c9a24b' : '#8fa3b5';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, 7); ctx.fill();
    }
    // 邊
    for (const wd of words) {
      const on = inHi(wd.hubIdx);
      ctx.strokeStyle = on ? 'rgba(74,123,166,.16)' : 'rgba(43,43,43,.025)';
      for (const idx of wd.hubIdx) {
        const hb = hubs[idx];
        ctx.beginPath(); ctx.moveTo(hb.x, hb.y); ctx.lineTo(wd.x, wd.y); ctx.stroke();
      }
    }
    // 單字點
    for (const wd of words) {
      const on = inHi(wd.hubIdx);
      ctx.globalAlpha = on ? 0.95 : 0.1;
      ctx.fillStyle = wd.gold ? '#c9a24b' : '#4a7ba6';
      const r = wd.hubIdx.length > 1 ? 4 : 3;
      ctx.beginPath(); ctx.arc(wd.x, wd.y, r, 0, 7); ctx.fill();
      if (on && (cam.s > 1.4 || (hi !== null && cam.s > 0.7))) {
        ctx.fillStyle = '#2b2b2b'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(wd.k, wd.x, wd.y - r - 3);
      }
    }
    // 中樞
    hubs.forEach((hb, i) => {
      const on = hi === null || hi === i;
      const pct = hb.s.pct;
      const r = 7 + 8 * pct;
      ctx.globalAlpha = on ? 1 : 0.15;
      ctx.fillStyle = pct >= 0.6 ? '#c9a24b' : '#4a7ba6';
      ctx.beginPath(); ctx.arc(hb.x, hb.y, r, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(hb.x, hb.y, r, 0, 7); ctx.stroke();
      ctx.fillStyle = '#2b2b2b';
      ctx.font = `bold ${Math.max(10, 9 + 5 * pct)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(hb.s.form, hb.x, hb.y - r - 4);
      ctx.lineWidth = 1;
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function tick() {
    if (!canvas || !canvas.isConnected) { raf = 0; return; }
    if (frame < 200) step();
    draw();
    frame++;
    if (frame < 200) raf = requestAnimationFrame(tick);
    else raf = 0;
  }
  function wake() { if (!raf && canvas && canvas.isConnected) draw(); }

  /* ── 互動 ── */
  function bindCanvas() {
    let drag = null;
    const toWorld = (px, py) => ({ x: (px - cam.x) / cam.s, y: (py - cam.y) / cam.s });
    const pos = e => {
      const r = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    canvas.onpointerdown = e => { drag = { ...pos(e), cx: cam.x, cy: cam.y, moved: false }; canvas.setPointerCapture(e.pointerId); };
    canvas.onpointermove = e => {
      if (!drag) return;
      const p = pos(e);
      if (Math.abs(p.x - drag.x) + Math.abs(p.y - drag.y) > 4) drag.moved = true;
      cam.x = drag.cx + (p.x - drag.x); cam.y = drag.cy + (p.y - drag.y);
      wake();
    };
    canvas.onpointerup = e => {
      const wasDrag = drag && drag.moved; drag = null;
      if (wasDrag) return;
      const p = pos(e), m = toWorld(p.x, p.y);
      const hitHub = hubs.findIndex(hb => (hb.x - m.x) ** 2 + (hb.y - m.y) ** 2 < (7 + 8 * hb.s.pct + 8) ** 2);
      if (hitHub >= 0) {
        hi = hi === hitHub ? null : hitHub;
        wake();
        showFamily(hi !== null ? hubs[hitHub] : null);
        return;
      }
      const hitW = words.find(wd => (wd.x - m.x) ** 2 + (wd.y - m.y) ** 2 < 100 / cam.s)
        || loose.find(wd => (wd.x - m.x) ** 2 + (wd.y - m.y) ** 2 < 100 / cam.s);
      if (hitW) {
        const wo = wmap[hitW.k];
        if (wo) VDGame.toast(`<b>${wo.word}</b>　${wo.zh}`);
      }
    };
    canvas.onwheel = e => {
      e.preventDefault();
      const p = pos(e), k = e.deltaY < 0 ? 1.12 : 0.89;
      const ns = Math.max(0.2, Math.min(3.5, cam.s * k));
      cam.x = p.x - (p.x - cam.x) * (ns / cam.s);
      cam.y = p.y - (p.y - cam.y) * (ns / cam.s);
      cam.s = ns; wake();
    };
  }

  function showFamily(hub) {
    const box = el.querySelector('#wg-words');
    if (!hub) { box.innerHTML = ''; return; }
    const s = hub.s;
    const cells = s.members.map(m => {
      const b = VDStore.box(m.toLowerCase());
      const cls = b >= 3 ? 'gold' : b >= 0 ? 'seen' : '';
      return `<span class="dex-cell ${cls}" data-w="${m.toLowerCase()}">${m}</span>`;
    }).join('');
    const unlearned = s.members.filter(m => VDStore.box(m.toLowerCase()) < 0);
    box.innerHTML = `
      <div class="pg-fam">
        <b>${s.form}</b>（${s.meaning}）守護者：${s.petName}・已學 ${s.learned}/${s.total}
        ${unlearned.length ? `<button class="btn small wg-train" style="margin-left:8px">🃏 去練這家族（${Math.min(10, unlearned.length)} 字）</button>` : ' ✅ 全學過'}
        <div class="dex-wall" style="margin-top:8px">${cells}</div>
      </div>`;
    box.querySelectorAll('.dex-cell').forEach(c => {
      c.onclick = () => { const w = wmap[c.dataset.w]; if (w) VDGame.toast(`<b>${w.word}</b>　${w.zh}`); };
    });
    const tr = box.querySelector('.wg-train');
    if (tr) tr.onclick = () => {
      const list = unlearned.map(m => wmap[m.toLowerCase()]).filter(Boolean).slice(0, 10);
      if (!list.length) return VDGame.toast('這家族的字不在目前字庫');
      el.innerHTML = '<div id="wg-flash"></div><button class="btn ghost" onclick="VDApp.go(\'wordgraph\')">← 回單字關聯圖</button>';
      VDFlash.start(list, el.querySelector('#wg-flash'), { raw: true });
    };
  }

  function statsLine() {
    const linked = words.length, gold = words.filter(w => w.gold).length;
    const multi = words.filter(w => w.hubIdx.length > 1).length;
    return `已學 <b>${linked + loose.length}</b> 字・掛上字綴 <b>${linked}</b> 字（精熟 ${gold}・跨家族 ${multi}）・活躍字綴 <b>${hubs.length}</b> 個`;
  }

  return { render };
})();
window.VDWordGraph = VDWordGraph;
