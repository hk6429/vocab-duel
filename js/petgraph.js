/* 詞源星圖 VDGraph：Canvas 力導向。20 詞靈外環錨定＋172 字綴力導向，
   節點大小/亮度 ∝ 家族已學比例。點寵高亮家族、點綴展開單字格牆、側欄最熟/最弱 Top5。 */
const VDGraph = (() => {
  let el = null, canvas = null, ctx = null, raf = 0, frame = 0;
  let nodes = [], petNodes = [], stats = [];
  let wmap = {};
  let cam = { x: 0, y: 0, s: 1 };
  let hi = null;         // 高亮 petId
  let petImgs = {};

  async function render(container) {
    el = container;
    el.innerHTML = '<div class="loading">載入詞源星圖…</div>';
    await VDPets.init();
    wmap = {};
    for (const w of VDApp.words()) wmap[w.word.toLowerCase()] = w;
    stats = VDPets.affixStats();
    build();
    el.innerHTML = `
      <div class="wc-card">
        <img loading="lazy" decoding="async" class="wc-card-img" src="img/ui/h_graph.webp" alt="" onerror="this.remove()">
        <div class="wc-card-body">
          <p class="pg-hint">每顆星是一個字綴，越亮越大＝你越熟。20 隻詞靈守在外圈——點詞靈看領地，點字綴看家族單字。拖曳移動、滾輪縮放。</p>
          <canvas id="pg-canvas"></canvas>
          <div id="pg-words"></div>
        </div>
      </div>
      ${sidebar()}
      ${VDGame.milestoneHtml()}
      <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button>`;
    canvas = el.querySelector('#pg-canvas');
    ctx = canvas.getContext('2d');
    const w = Math.min(el.clientWidth - 32, 860);
    canvas.width = w * devicePixelRatio; canvas.height = 520 * devicePixelRatio;
    canvas.style.width = w + 'px'; canvas.style.height = '520px';
    ctx.scale(devicePixelRatio, devicePixelRatio);
    cam = { x: w / 2, y: 260, s: Math.min(1, w / 760) };
    loadImgs();
    bindCanvas(w);
    bindSidebar();
    frame = 0;
    tick();
  }

  /* ── 建圖 ── */
  function build() {
    nodes = []; petNodes = [];
    const pets = VDPets.list();
    const R = 330;
    pets.forEach((p, i) => {
      const a = (i / pets.length) * Math.PI * 2 - Math.PI / 2;
      petNodes.push({ pet: p, x: Math.cos(a) * R, y: Math.sin(a) * R, r: 26 });
    });
    for (const s of stats) {
      const anchor = petNodes.find(n => n.pet.id === s.petId);
      const j = () => (Math.random() - 0.5) * 120;
      nodes.push({ s, ax: anchor.x, ay: anchor.y, x: anchor.x * 0.6 + j(), y: anchor.y * 0.6 + j(), vx: 0, vy: 0 });
    }
  }
  function loadImgs() {
    for (const n of petNodes) {
      if (petImgs[n.pet.id]) continue;
      const im = new Image();
      im.src = `img/pets/${n.pet.id}_s1.webp`;
      im.onload = () => { petImgs[n.pet.id] = im; wake(); };
    }
  }

  /* ── 力模擬（200 幀後凍結省電） ── */
  function step() {
    for (const n of nodes) {
      // 彈簧拉向錨點（靠內 55%）
      const tx = n.ax * 0.55, ty = n.ay * 0.55;
      n.vx += (tx - n.x) * 0.012; n.vy += (ty - n.y) * 0.012;
    }
    // 節點間斥力
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 3600 || d2 < 0.01) continue;
        const f = 30 / d2;
        dx *= f; dy *= f;
        a.vx += dx; a.vy += dy; b.vx -= dx; b.vy -= dy;
      }
    }
    for (const n of nodes) {
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += n.vx; n.y += n.vy;
    }
  }

  function draw() {
    const w = canvas.width / devicePixelRatio, h = canvas.height / devicePixelRatio;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(cam.x, cam.y); ctx.scale(cam.s, cam.s);
    // 邊
    for (const n of nodes) {
      const dim = hi && n.s.petId !== hi;
      ctx.strokeStyle = dim ? 'rgba(43,43,43,.03)' : 'rgba(74,123,166,.12)';
      ctx.beginPath(); ctx.moveTo(n.ax, n.ay); ctx.lineTo(n.x, n.y); ctx.stroke();
    }
    // 字綴節點
    for (const n of nodes) {
      const pct = n.s.pct, dim = hi && n.s.petId !== hi;
      const r = 3.5 + 9 * pct;
      ctx.globalAlpha = dim ? 0.12 : 0.35 + 0.65 * pct;
      ctx.fillStyle = pct >= 0.6 ? '#c9a24b' : '#4a7ba6';
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 7); ctx.fill();
      if (!dim && (pct > 0.15 || cam.s > 0.9)) {
        ctx.globalAlpha = dim ? 0.15 : 0.8;
        ctx.fillStyle = '#2b2b2b';
        ctx.font = `${Math.max(9, 8 + 4 * pct)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(n.s.form, n.x, n.y - r - 3);
      }
    }
    ctx.globalAlpha = 1;
    // 詞靈節點
    for (const p of petNodes) {
      const dim = hi && p.pet.id !== hi;
      ctx.globalAlpha = dim ? 0.25 : 1;
      const im = petImgs[p.pet.id];
      ctx.save();
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.clip();
      if (im) ctx.drawImage(im, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      else {
        ctx.fillStyle = '#eef4f8'; ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        ctx.font = '26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.pet.ico, p.x, p.y + 2);
      }
      ctx.restore();
      ctx.strokeStyle = p.pet.owned ? '#c9a24b' : 'rgba(43,43,43,.25)';
      ctx.lineWidth = p.pet.owned ? 2.5 : 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.stroke();
      ctx.fillStyle = '#2b2b2b'; ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(p.pet.name, p.x, p.y + p.r + 14);
      ctx.lineWidth = 1;
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function tick() {
    if (!canvas || !canvas.isConnected) { raf = 0; return; }  // 離開頁面自動停
    if (frame < 200) step();
    draw();
    frame++;
    if (frame < 200) raf = requestAnimationFrame(tick);
    else raf = 0;   // 凍結；互動時 wake()
  }
  function wake() { if (!raf && canvas && canvas.isConnected) { draw(); } }

  /* ── 互動 ── */
  function bindCanvas(w) {
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
      // 先找寵物
      const hitPet = petNodes.find(n => (n.x - m.x) ** 2 + (n.y - m.y) ** 2 < (n.r + 6) ** 2);
      if (hitPet) { hi = hi === hitPet.pet.id ? null : hitPet.pet.id; wake(); showFamily(hi ? hitPet.pet : null); return; }
      const hitAf = nodes.find(n => (n.x - m.x) ** 2 + (n.y - m.y) ** 2 < 14 ** 2);
      if (hitAf) showWords(hitAf.s);
    };
    canvas.onwheel = e => {
      e.preventDefault();
      const p = pos(e), k = e.deltaY < 0 ? 1.12 : 0.89;
      const ns = Math.max(0.35, Math.min(3, cam.s * k));
      cam.x = p.x - (p.x - cam.x) * (ns / cam.s);
      cam.y = p.y - (p.y - cam.y) * (ns / cam.s);
      cam.s = ns; wake();
    };
  }

  /* ── 點寵：領地摘要；點綴：單字格牆 ── */
  function showFamily(pet) {
    const box = el.querySelector('#pg-words');
    if (!pet) { box.innerHTML = ''; return; }
    const fs = VDPets.familyStats(pet.id);
    const mine = stats.filter(s => s.petId === pet.id);
    box.innerHTML = `
      <div class="pg-fam">
        <b>${pet.ico} ${pet.name}</b> 的領地：${mine.length} 個字綴・已學 ${fs.learned}/${fs.total} 字（精熟 ${fs.mastered}）
        ${pet.owned ? `・詞源之力 <b>+${Math.round(pet.power * 100)}%</b> 攻擊` : '・尚未領養'}
        <div class="pg-fam-tags">${mine.map(s => `<button class="pg-tag" data-f="${s.form}" data-p="${s.petId}">${s.form} <span>${s.learned}/${s.total}</span></button>`).join('')}</div>
      </div>`;
    box.querySelectorAll('.pg-tag').forEach(b => {
      b.onclick = () => {
        const s = stats.find(x => x.form === b.dataset.f && x.petId === b.dataset.p);
        if (s) showWords(s);
      };
    });
  }
  function showWords(s) {
    const box = el.querySelector('#pg-words');
    const cells = s.members.map(m => {
      const b = VDStore.box(m.toLowerCase());
      const cls = b >= 3 ? 'gold' : b >= 0 ? 'seen' : '';
      return `<span class="dex-cell ${cls}" data-w="${m.toLowerCase()}">${m}</span>`;
    }).join('');
    const unlearned = s.members.filter(m => VDStore.box(m.toLowerCase()) < 0);
    box.innerHTML = `
      <div class="pg-fam">
        <b>${s.form}</b>（${s.meaning}）守護者：${s.petName}・已學 ${s.learned}/${s.total}
        ${unlearned.length ? `<button class="btn small pg-train" style="margin-left:8px">🃏 去練這家族（${Math.min(10, unlearned.length)} 字）</button>` : ' ✅ 全學過'}
        <div class="dex-wall" style="margin-top:8px">${cells}</div>
      </div>`;
    box.querySelectorAll('.dex-cell').forEach(c => {
      c.onclick = () => { const w = wmap[c.dataset.w]; if (w) VDGame.toast(`<b>${w.word}</b>　${w.zh}`); };
    });
    const tr = box.querySelector('.pg-train');
    if (tr) tr.onclick = () => train(unlearned);
  }
  function train(members) {
    const list = members.map(m => wmap[m.toLowerCase()]).filter(Boolean).slice(0, 10);
    if (!list.length) return VDGame.toast('這家族的字不在目前字庫');
    el.innerHTML = '<div id="pg-flash"></div><button class="btn ghost" onclick="VDApp.go(\'graph\')">← 回詞源星圖</button>';
    VDFlash.start(list, el.querySelector('#pg-flash'), { raw: true });
  }

  /* ── 側欄統計 ── */
  function sidebar() {
    let learned = 0, total = 0;
    const seen = new Set();
    for (const s of stats) for (const m of s.members) {
      const k = m.toLowerCase();
      if (seen.has(k)) continue; seen.add(k);
      total++; if (VDStore.box(k) >= 0) learned++;
    }
    const top = VDPets.topAffixes(5), weak = VDPets.weakAffixes(5);
    const bar = (a, cls) => `
      <div class="pg-row">
        <span class="pg-form">${a.form}</span>
        <span class="pg-bar"><i class="${cls}" style="width:${Math.round(a.pct * 100)}%"></i></span>
        <span class="pg-num">${a.learned}/${a.total}</span>
        ${cls === 'weak' ? `<button class="btn small pg-go" data-f="${a.form}" data-p="${a.petId}">去練</button>` : `<span class="pg-pet">${a.petName}</span>`}
      </div>`;
    return `
      <div class="wc-card pg-side">
        <div class="wc-card-body">
          <div class="pg-total">字綴家族已學 <b>${learned}</b> / ${total} 字</div>
          <div class="pg-sub">🏆 最熟五綴</div>
          ${top.length ? top.map(a => bar(a, 'top')).join('') : '<div class="pg-empty">還沒開始——先去閃卡學幾個字吧！</div>'}
          <div class="pg-sub">🌱 最弱五綴（詞靈在等糧草）</div>
          ${weak.map(a => bar(a, 'weak')).join('')}
        </div>
      </div>`;
  }
  function bindSidebar() {
    el.querySelectorAll('.pg-go').forEach(b => {
      b.onclick = () => {
        const s = stats.find(x => x.form === b.dataset.f && x.petId === b.dataset.p);
        if (!s) return;
        train(s.members.filter(m => VDStore.box(m.toLowerCase()) < 0));
      };
    });
  }

  return { render };
})();
window.VDGraph = VDGraph;
