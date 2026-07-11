/* 單字之城 VDTownUI：8×8 磚格城鎮。蓋房→招居民→學校訓練職業→解鎖建築鏈；
   資源靠「親自學習」與「詞靈徵戰」，工人只是自動化倍率。居民全講英文。 */
const VDTownUI = (() => {
  let el = null;
  let moving = null;       // 搬移模式：待搬建築的格 key
  let lastTh = 0;          // 偵測市政廳升級 → 建城史詩卡
  const ERA = { 2: '拓荒村落', 3: '學者小鎮', 4: '智慧之城', 5: '單字王都' };
  /* 後端只在 Vercel：CF／Netlify 前端自動指回 vercel API */
  const API = location.hostname.includes('vercel.app') || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? '' : 'https://vocab-duel.vercel.app';
  const img = (n) => `img/town/${n}.png`;
  const stageOf = (lv) => lv >= 4 ? 3 : lv >= 2 ? 2 : 1;
  let wmap = null;
  const words = () => {
    if (!wmap) { wmap = {}; for (const w of VDApp.words()) wmap[w.word.toLowerCase()] = w; }
    return wmap;
  };

  async function render(container) {
    el = container;
    el.innerHTML = '<div class="loading">進城中…</div>';
    await VDTown.init();
    lastTh = VDTown.thLevel();   // paint() 會 tick，離線期間升好的市政廳也能跳史詩卡
    paint();
  }

  /* ── 主畫面（2.5D 等角紙劇場：地面斜置、建築立牌直立） ── */
  function paint() {
    VDTown.tickUpgrades();
    const th = VDTown.thLevel();
    if (th > lastTh) epicShow(th);   // 不論時間到／代幣／答題加速完工都會慶祝
    lastTh = th;
    const g = VDTown.raw;
    const B = VDTown.buildings();
    const grid = [];
    for (let r = 0; r < VDTown.GRID; r++) for (let c = 0; c < VDTown.GRID; c++) {
      const k = `${r},${c}`;
      const cell = g.grid[k];
      grid.push(cell
        ? `<button class="tw-cell has ${moving === k ? 'mv' : ''}" data-k="${k}">
            <span class="tw-b3d">
              <img src="${img(cell.b + '_s' + stageOf(cell.lv))}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${B[cell.b].ico}',className:'tw-emoji'}))">
              <i class="tw-lv">Lv${cell.lv}</i>${cell.up ? '<i class="tw-up">🔨</i>' : ''}
            </span>
          </button>`
        : `<button class="tw-cell ${moving ? 'mvtarget' : ''}" data-k="${k}"></button>`);
    }
    const res = VDTown.RES.map(r => `<span class="tw-res">${VDTown.RES_META[r].ico} ${g.res[r] || 0}</span>`).join('');
    const q = VDTown.questInfo();
    const pk = VDTown.packInfo();
    const tk = VDTown.tokenInfo();
    const mv = VDTown.moveinInfo();
    const era = ERA[VDTown.thLevel()] || '無名荒地';
    el.innerHTML = `
      <div class="wc-card">
        <img class="wc-card-img" src="img/ui/h_town.png" alt="" onerror="this.remove()">
        <div class="wc-card-body">
          <p class="pg-hint">🏛️ <b>${g.name || '（點此為城命名）'}</b>・${era}・市政廳 Lv${VDTown.thLevel()}
            <button class="btn sm ghost" id="twName">✏️</button><br>
            👥 ${g.pop.length}/${VDTown.popCap()} 人・📚 精熟 ${VDTown.mastered()} 字（城的高度＝你的單字量）</p>
          <div class="tw-resbar">${res}<span class="tw-res">🪙 ${VDTown.raw.tokens} 代幣</span><span class="tw-res">💰 ${VDGame.raw.coins}</span></div>
          ${moving ? '<div class="pg-hint">🚚 搬移中——點一塊空地放下，或再點原建築取消</div>' : ''}
          <div class="tw-iso"><div class="tw-grid" style="background-image:url(${img('base')})">${grid.join('')}</div></div>
          <div id="tw-panel"></div>
        </div>
      </div>

      <div class="wc-card"><div class="wc-card-body">
        <div class="hero-sec">👥 居民（點居民聽英文）</div>
        <div class="tw-popgrid">${g.pop.map(p => {
          const job = VDTown.jobs()[p.job];
          const av = p.job ? `res_${p.job}` : (p.id % 2 ? 'res_villager_m' : 'res_villager_f');
          return `<button class="tw-npc ${p.rare ? 'rare' : ''}" data-id="${p.id}">
            <img src="${img(av)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${job ? job.ico : '🙂'}',className:'tw-emoji'}))">
            <b>${p.rare ? '✨' : ''}${p.name}</b><i>${job ? job.ico + job.name : '閒置'}${p.rare ? '・產量×2' : ''}</i>
          </button>`;
        }).join('')}</div>
        <div class="pet-actrow">
          <button class="btn small" id="twMovein">🏠 招募居民（今日還可 ${Math.max(0, mv.todayLeft)} 位・耗 1 米）</button>
          ${VDTown.harvestReady() ? '<button class="btn small" id="twHarvest">🧺 每日收成</button>' : ''}
        </div>
        <div id="tw-say"></div>
      </div></div>

      <div class="wc-card"><div class="wc-card-body">
        <div class="hero-sec">📦 資源補給</div>
        <div class="shop-item"><span class="shop-body">
          <span class="shop-name">📖 學習換資源</span>
          <span class="shop-desc">今日答對 ${pk.correct} 題 → 可領 ${pk.avail} 包（每 5 題 1 包，上限 ${pk.cap}）</span></span>
          <button class="btn sm" id="twPacks" ${pk.avail ? '' : 'disabled'}>領取</button>
        </div>
        <div class="shop-item"><span class="shop-body">
          <span class="shop-name">🪙 城邦代幣</span>
          <span class="shop-desc">競技積分 ${tk.rating}・可兌 ${tk.avail} 枚（每 ${tk.per} 分 1 枚）；代幣可加速升級或換 20 資源</span></span>
          <button class="btn sm" id="twRedeem" ${tk.avail ? '' : 'disabled'}>兌換</button>
        </div>
        ${g.tokens ? `<div class="pet-actrow">${VDTown.RES.map(r =>
          `<button class="btn small ghost tw-t2r" data-r="${r}">🪙→${VDTown.RES_META[r].ico}×20</button>`).join('')}</div>` : ''}
        ${q ? `<div class="tw-quest ${q.done ? 'done' : ''}">
          <img src="${img('res_mayor')}" alt="" onerror="this.remove()">
          <span><b>${q.giver}</b>：“${q.text}”${q.done ? '　✅ Done!' : `　<i>(交 ${VDTown.RES_META[q.res].ico}×${q.n} 得 🪙×${q.rewardTokens})</i>`}</span>
          ${q.done ? '' : '<button class="btn small" id="twQuest">交付</button>'}
        </div>` : ''}
      </div></div>

      ${(g.log || []).length ? `<div class="wc-card"><div class="wc-card-body">
        <div class="hero-sec">📜 城史紀年</div>
        <div class="tw-log">${g.log.slice(-8).reverse().map(e => `<div><i>${e.d.slice(5)}</i> ${e.t}</div>`).join('')}</div>
      </div></div>` : ''}

      <div class="wc-card"><div class="wc-card-body">
        <div class="hero-sec">🏫 班級之城（全班一起蓋）</div>
        <div class="pg-hint">全班在班級榜上傳的「已掌握字數」加總，決定班城時代——揪同學一起把班城蓋成王都！</div>
        <div class="pet-actrow">
          <input class="rt-join-in" id="twClass" placeholder="班級碼" style="width:150px;letter-spacing:normal" value="${localStorage.getItem('vd_classcode') || ''}">
          <button class="btn small" id="twClassGo">看班城</button>
        </div>
        <div id="tw-class"></div>
      </div></div>

      <div class="wc-card"><div class="wc-card-body">
        <div class="hero-sec">☁️ 雲端綁定・參觀好友城</div>
        <div class="pg-hint">把城綁到你的同步碼跨裝置繼續蓋；輸入好友的同步碼可以去他的城參觀。</div>
        <div class="pet-actrow">
          <input class="rt-join-in" id="twCode" placeholder="同步碼" style="width:150px;letter-spacing:normal">
          <button class="btn small" id="twSave">上傳</button>
          <button class="btn small ghost" id="twLoad">下載</button>
          <button class="btn small ghost" id="twVisit">👀 參觀</button>
        </div>
        <div id="tw-visit"></div>
      </div></div>
      ${VDGame.milestoneHtml()}
      <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button>`;
    bind();
  }

  /* ── 建城史詩：市政廳升級的收官慶典卡 ── */
  function epicShow(lv) {
    const g = VDTown.raw;
    const d = document.createElement('div');
    d.className = 'tw-epic';
    d.innerHTML = `<div class="tw-epic-card">
      <div class="big">🏛️</div>
      <h3>${g.name || '你的城'}邁入「${ERA[lv]}」時代！</h3>
      <p>市政廳 Lv${lv}・精熟 ${VDTown.mastered()} 字<br>這座城的每一塊磚，都是你背下的單字。</p>
      <button class="btn" id="twEpicShare">📋 複製戰報</button>
      <button class="btn ghost" id="twEpicClose">繼續建城</button>
    </div>`;
    document.body.appendChild(d);
    d.querySelector('#twEpicClose').onclick = () => d.remove();
    d.querySelector('#twEpicShare').onclick = () => {
      const t = `🏛️ 我的單字之城「${g.name || '無名之城'}」升到 Lv${lv}（${ERA[lv]}）！精熟 ${VDTown.mastered()} 個英文單字蓋出來的城 💪 來字鬥英雄跟我拚：https://vocab-duel.vercel.app`;
      navigator.clipboard && navigator.clipboard.writeText(t);
      VDGame.toast('📋 戰報已複製，貼給同學吧！');
    };
  }

  /* ── 參觀好友城（唯讀） ── */
  async function visitTown(code) {
    const box = el.querySelector('#tw-visit');
    box.innerHTML = '<div class="loading">出發參觀…</div>';
    try {
      const r = await fetch(API + '/api/town', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'load', code })
      }).then(x => x.json());
      if (!r.ok) { box.innerHTML = ''; return VDGame.toast(r.error || '找不到這座城'); }
      const t = r.town, B = VDTown.buildings();
      let n = 0;
      const mini = [];
      for (let rr = 0; rr < VDTown.GRID; rr++) for (let cc = 0; cc < VDTown.GRID; cc++) {
        const cell = (t.grid || {})[`${rr},${cc}`];
        if (cell) n++;
        mini.push(cell
          ? `<span class="tw-vcell"><img src="${img(cell.b + '_s' + stageOf(cell.lv))}" alt="" onerror="this.replaceWith(document.createTextNode('${(B[cell.b] || {}).ico || '🏠'}'))"></span>`
          : '<span class="tw-vcell"></span>');
      }
      const thlv = ((t.grid || {})['3,3'] || { lv: 1 }).lv;
      box.innerHTML = `<div class="pg-fam">
        <b>👀 ${t.name || '好友'}的城</b>　市政廳 Lv${thlv}・${n} 棟建築・${(t.pop || []).length} 位居民
        <div class="tw-vgrid">${mini.join('')}</div>
        <div class="pg-hint">觀摩完回自己的城，把它蓋得更高吧！</div>
      </div>`;
    } catch { box.innerHTML = ''; VDGame.toast('連不上雲端（本機模式沒有後端）'); }
  }

  function bind() {
    el.querySelectorAll('.tw-cell').forEach(b => b.onclick = () => {
      const k = b.dataset.k;
      if (moving) {                                  // 搬移模式：點空地放下／點原地取消
        if (k === moving) { moving = null; return paint(); }
        const r = VDTown.move(moving, ...k.split(',').map(Number));
        VDGame.toast(r.ok ? '🚚 搬好了！' : r.msg);
        if (r.ok) moving = null;
        return paint();
      }
      cellPanel(k);
    });
    el.querySelectorAll('.tw-npc').forEach(b => b.onclick = () => npcPanel(+b.dataset.id));
    const $ = s => el.querySelector(s);
    $('#twName').onclick = () => {
      el.querySelector('#tw-panel').innerHTML = `<div class="pg-fam"><b>📜 為城命名</b>
        <div class="pet-actrow"><input class="rt-join-in" id="twNameIn" maxlength="12" placeholder="1–12 個字" style="width:160px;letter-spacing:normal" value="${VDTown.raw.name || ''}">
        <button class="btn small" id="twNameGo">定名</button></div></div>`;
      el.querySelector('#twNameGo').onclick = () => {
        const r = VDTown.setName(el.querySelector('#twNameIn').value);
        VDGame.toast(r.ok ? '📜 城名已定！' : r.msg);
        if (r.ok) paint();
      };
    };
    $('#twMovein').onclick = () => {
      const r = VDTown.tryMovein();
      VDGame.toast(r.ok ? (r.rare ? `✨ 稀有居民 ${r.name} 搬進來了，產量加倍！` : `🎉 ${r.name} 搬進來了！`) : r.msg);
      if (r.ok) paint();
    };
    if ($('#twHarvest')) $('#twHarvest').onclick = () => {
      const r = VDTown.harvest();
      if (!r.ok) return VDGame.toast(r.msg);
      let msg = '🧺 收成：' + Object.entries(r.out).filter(([, v]) => v).map(([k, v]) => `${VDTown.RES_META[k].ico}+${v}`).join(' ');
      if (r.lazy) msg += '（今天還沒練功，居民只交一半——去答幾題吧！）';
      VDGame.toast(msg);
      if (r.event) setTimeout(() => VDGame.toast(`🎁 奇遇！${r.event.t} “${r.event.en}” ` +
        Object.entries(r.event.gain).map(([k, v]) => `${VDTown.RES_META[k].ico}+${v}`).join(' ')), 1400);
      paint();
    };
    if ($('#twPacks')) $('#twPacks').onclick = () => { const r = VDTown.claimPacks(); VDGame.toast(r.ok ? `📦 領了 ${r.n} 包補給！` : r.msg); if (r.ok) paint(); };
    if ($('#twRedeem')) $('#twRedeem').onclick = () => { const r = VDTown.redeemTokens(); VDGame.toast(r.ok ? `🪙 兌換 ${r.n} 枚城邦代幣！` : r.msg); if (r.ok) paint(); };
    el.querySelectorAll('.tw-t2r').forEach(b => b.onclick = () => { const r = VDTown.tokenToRes(b.dataset.r); VDGame.toast(r.ok ? '已兌換' : r.msg); if (r.ok) paint(); });
    if ($('#twQuest')) $('#twQuest').onclick = () => {
      const r = VDTown.fulfillQuest();
      VDGame.toast(r.ok ? `✅ Well done! 委託完成 +🪙${r.tokens}` : r.msg);
      if (r.ok) paint();
    };
    $('#twSave').onclick = () => cloudOp('save');
    $('#twLoad').onclick = () => cloudOp('load');
    $('#twVisit').onclick = () => {
      const code = el.querySelector('#twCode').value.trim();
      if (code.length < 4) return VDGame.toast('先輸入好友的同步碼（至少 4 碼）');
      visitTown(code);
    };
    $('#twClassGo').onclick = () => {
      const code = el.querySelector('#twClass').value.trim();
      if (!code) return VDGame.toast('先輸入班級碼（跟班級榜同一組）');
      localStorage.setItem('vd_classcode', code);
      classCity(code);
    };
  }

  /* ── 班級之城：全班已掌握字數加總 → 班城時代 ── */
  const CLASS_ERA = [
    { at: 0, name: '無名營地', ico: '⛺' }, { at: 500, name: '拓荒村落', ico: '🛖' },
    { at: 1500, name: '學者小鎮', ico: '🏘️' }, { at: 3000, name: '智慧之城', ico: '🏰' },
    { at: 6000, name: '單字王都', ico: '👑' }
  ];
  async function classCity(code) {
    const box = el.querySelector('#tw-class');
    box.innerHTML = '<div class="loading">召集全班中…</div>';
    try {
      const r = await fetch(API + '/api/board?code=' + encodeURIComponent(code)).then(x => x.json());
      if (!r.rows || !r.rows.length) { box.innerHTML = '<div class="pg-hint">這個班還沒有人上傳戰績——去「雲端／班級榜」當第一個吧！</div>'; return; }
      const total = r.rows.reduce((s, x) => s + (x.mastered || 0), 0);
      let i = 0; while (i + 1 < CLASS_ERA.length && total >= CLASS_ERA[i + 1].at) i++;
      const cur = CLASS_ERA[i], next = CLASS_ERA[i + 1];
      const pct = next ? Math.round((total - cur.at) / (next.at - cur.at) * 100) : 100;
      box.innerHTML = `<div class="pg-fam">
        <b>${cur.ico} 班城「${cur.name}」</b>　全班 ${r.rows.length} 人・共精熟 <b>${total}</b> 字
        <span class="vg-q-bar" style="display:block;margin:6px 0"><span style="width:${pct}%"></span></span>
        <div class="pg-hint">${next ? `再 ${next.at - total} 字，全班晉升「${next.ico} ${next.name}」！` : '已是最高時代——班上是傳說！'}</div>
        <div class="pg-hint">🏗️ 頭號工程師：${r.rows.slice(0, 3).map((x, k) => `${['🥇', '🥈', '🥉'][k]}${x.name}(${x.mastered})`).join('　')}</div>
      </div>`;
    } catch { box.innerHTML = ''; VDGame.toast('連不上雲端（本機模式沒有後端）'); }
  }

  async function cloudOp(op) {
    const code = el.querySelector('#twCode').value.trim();
    if (code.length < 4) return VDGame.toast('先輸入同步碼（至少 4 碼）');
    try {
      const r = await fetch(API + '/api/town', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(op === 'save' ? { op: 'save', code, town: VDTown.exportState() } : { op: 'load', code })
      }).then(x => x.json());
      if (!r.ok) return VDGame.toast(r.error || '雲端出錯');
      if (op === 'save') VDGame.toast('☁️ 城鎮已上傳綁定！');
      else if (VDTown.importState(r.town)) { VDGame.toast('☁️ 城鎮已下載！'); paint(); }
      else VDGame.toast('雲端沒有這個同步碼的城');
    } catch { VDGame.toast('連不上雲端（本機模式沒有後端）'); }
  }

  /* ── 格子面板：空地建造／建築詳情 ── */
  function cellPanel(key) {
    const box = el.querySelector('#tw-panel');
    const g = VDTown.raw;
    const cell = g.grid[key];
    const B = VDTown.buildings();
    if (!cell) {
      box.innerHTML = `<div class="pg-fam"><b>🌱 空地</b>　要蓋什麼？
        <div class="tw-buildmenu">${Object.keys(B).filter(b => b !== 'townhall').map(b => {
          const chk = VDTown.canBuild(b);
          const cost = Object.entries(B[b].cost).map(([r, v]) => `${VDTown.RES_META[r].ico}${v}`).join(' ');
          return `<button class="tw-bopt ${chk.ok ? '' : 'no'}" data-b="${b}" data-k="${key}" title="${chk.ok ? '' : chk.msg}">
            ${B[b].ico} ${B[b].name}<i>${cost || '免費'}</i>${chk.ok ? '' : `<u>${chk.msg}</u>`}
          </button>`;
        }).join('')}</div></div>`;
      box.querySelectorAll('.tw-bopt').forEach(b => b.onclick = () => {
        const r = VDTown.build(b.dataset.b, ...b.dataset.k.split(',').map(Number));
        VDGame.toast(r.ok ? `🏗️ ${B[b.dataset.b].name} 落成！` : r.msg);
        if (r.ok) paint();
      });
      return;
    }
    const def = B[cell.b];
    VDTown.tickUpgrades();
    const req = VDTown.upgradeReq(key);
    const upLeft = cell.up ? Math.max(0, Math.ceil((cell.up.done - Date.now()) / 60000)) : 0;
    const near = cell.b === 'townhall' ? VDTown.nearMastered() : [];
    box.innerHTML = `<div class="pg-fam">
      <b>${def.ico} ${def.name} Lv${cell.lv}</b>　<span class="pg-hint">${def.desc}</span>
      ${cell.b === 'townhall' ? `<div class="pg-hint">📚 「精熟」＝一個字連續答對進到第 3 盒以上。你有 <b>${near.length}</b> 個字再對 1–2 次就精熟${near.length ? '——去收割最快！' : '。'}</div>` : ''}
      <div class="pet-actrow" style="margin-top:6px">
        ${cell.up
          ? `<span class="pg-hint">🔨 升級中，還要約 ${upLeft} 分鐘</span>
             <button class="btn small" id="twRush">🪙×1 立刻完工</button>
             <button class="btn small" id="twQRush">📚 答 5 題加速完工</button>`
          : req.ok
            ? `<button class="btn small" id="twUp">⬆️ 升 Lv${req.next}（${Object.entries(req.cost).map(([r, v]) => VDTown.RES_META[r].ico + v).join(' ')}・${req.next * 5} 分鐘）</button>`
            : `<span class="pg-hint">⬆️ ${req.msg}</span>`}
        ${cell.b === 'school' ? '<button class="btn small" id="twTrain">🎓 職業訓練</button>' : ''}
        ${cell.b === 'townhall' && near.length ? '<button class="btn small" id="twNear">⚡ 去練快精熟的字</button>' : ''}
        ${cell.b === 'house' && VDTown.raw.pop.length ? '<button class="btn small ghost" id="twKnock">🙋 敲門聊聊</button>' : ''}
        ${cell.b !== 'townhall' ? `<button class="btn small ghost" id="twMove">🚚 搬移</button>
          <button class="btn small ghost" id="twDemo">🧨 拆除（退一半建材）</button>` : ''}
      </div>
    </div>`;
    const $ = s => box.querySelector(s);
    if ($('#twUp')) $('#twUp').onclick = () => { const r = VDTown.upgrade(key); VDGame.toast(r.ok ? `🔨 開工！約 ${r.minutes} 分鐘（答 5 題可加速）` : r.msg); if (r.ok) paint(); };
    if ($('#twRush')) $('#twRush').onclick = () => { const r = VDTown.rushUpgrade(key); VDGame.toast(r.ok ? '🪙 完工！' : r.msg); if (r.ok) paint(); };
    if ($('#twQRush')) $('#twQRush').onclick = () => rushQuiz(key);
    if ($('#twTrain')) $('#twTrain').onclick = () => schoolPanel(box);
    if ($('#twNear')) $('#twNear').onclick = () => {
      const wm = words();
      const list = VDTown.nearMastered().map(w => wm[w.toLowerCase()]).filter(Boolean);
      if (!list.length) return VDGame.toast('先去閃卡多練幾個字吧！');
      el.innerHTML = '<div id="tw-flash"></div>';
      VDFlash.start(list.slice(0, 20), el.querySelector('#tw-flash'), { raw: true });
    };
    if ($('#twKnock')) $('#twKnock').onclick = () => {
      const pop = VDTown.raw.pop;
      npcPanel(pop[Math.floor(Math.random() * pop.length)].id);
      el.querySelector('#tw-say').scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    if ($('#twMove')) $('#twMove').onclick = () => { moving = key; paint(); };
    if ($('#twDemo')) $('#twDemo').onclick = () => {
      const b = $('#twDemo');
      if (b.dataset.arm) {
        const r = VDTown.demolish(key);
        VDGame.toast(r.ok ? '🧨 拆除，退回 ' + Object.entries(r.back).filter(([, v]) => v).map(([k, v]) => VDTown.RES_META[k].ico + v).join(' ') : r.msg);
        if (r.ok) paint();
      } else { b.dataset.arm = '1'; b.textContent = '⚠️ 再按一次確定拆除'; }
    };
  }

  /* 出一題：30% 機率拼寫產出題（純字母 3–12 字），其餘中譯四選一 */
  function townQ(w, all) {
    if (/^[a-z]{3,12}$/i.test(w.word) && Math.random() < 0.3) return { w, spell: true };
    const opts = [w.zh];
    while (opts.length < 4) {
      const d = all[Math.floor(Math.random() * all.length)].zh;
      if (!opts.includes(d)) opts.push(d);
    }
    opts.sort(() => Math.random() - 0.5);
    return { w, opts };
  }
  /* 題目主體＋作答繫結（選擇／拼寫共用），答完呼叫 done(correct) */
  function bindQ(box, q, done) {
    if (q.spell) {
      box.querySelector('#twSp').focus();
      const go = () => done(box.querySelector('#twSp').value.trim().toLowerCase() === q.w.word.toLowerCase());
      box.querySelector('#twSpGo').onclick = go;
      box.querySelector('#twSp').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    } else {
      box.querySelectorAll('.opt').forEach(b => b.onclick = () => done(decodeURIComponent(b.dataset.v) === q.w.zh));
    }
  }
  const qBody = (q) => q.spell
    ? `<div class="quiz-prompt" style="margin:8px 0">${q.w.zh}</div>
       <div class="pg-hint">✍️ 拼出這個英文字（開頭 ${q.w.word[0]}…）</div>
       <div class="pet-actrow"><input class="rt-join-in" id="twSp" autocomplete="off" autocapitalize="off" style="width:180px;letter-spacing:normal" placeholder="輸入英文">
       <button class="btn small" id="twSpGo">送出</button></div>`
    : `<div class="quiz-prompt" style="margin:8px 0">${q.w.word}</div>
       <div class="quiz-opts">${q.opts.map((o, k) => `<button class="btn opt" data-v="${encodeURIComponent(o)}"><span class="opt-key">${'ABCD'[k]}</span><span class="opt-text">${o}</span></button>`).join('')}</div>`;

  /* ── 答題加速：5 題對 4，勤學＝最快的工程隊 ── */
  function rushQuiz(key) {
    const all = VDApp.words();
    const qs = [];
    while (qs.length < 5) {
      const w = all[Math.floor(Math.random() * all.length)];
      if (qs.some(q => q.w.word === w.word)) continue;
      qs.push(townQ(w, all));
    }
    let i = 0, score = 0;
    const box = el.querySelector('#tw-panel');
    const step = () => {
      if (i >= qs.length) {
        const passed = score >= 4;
        if (passed) VDTown.quizRush(key, true);
        box.innerHTML = `<div class="pg-fam"><b>${passed ? '⚡ 加速成功，完工！' : '📚 差一點'}</b> 答對 ${score}/5${passed ? '——工人看你讀書讀得起勁，連夜趕完了！' : '，要對 4 題才能加速。再試一次或等時間到。'}</div>`;
        if (passed) setTimeout(paint, 1500);
        return;
      }
      const q = qs[i];
      box.innerHTML = `<div class="pg-fam">
        <b>⚡ 加速測驗</b>　第 ${i + 1}/5 題（答對 ${score}）
        ${qBody(q)}
      </div>`;
      bindQ(box, q, (correct) => {
        VDStore.record(q.w.word, correct);
        VDGame.onAnswer(correct, 'quiz', 0);
        if (correct) score++;
        i++;
        step();
      });
    };
    step();
  }

  /* ── 居民：英文台詞＋派工 ── */
  function npcPanel(id) {
    const p = VDTown.raw.pop.find(x => x.id === id);
    if (!p) return;
    const box = el.querySelector('#tw-say');
    const line = VDTown.npcLine(p);
    const J = VDTown.jobs();
    const basics = Object.keys(J).filter(j => J[j].basic);
    box.innerHTML = `<div class="tw-bubble">
      <b>${p.rare ? '✨' : ''}${p.name}</b>：“${line.text}” <button class="btn sm ghost" id="twSay" title="聽發音">🔊</button>
      <div class="pg-hint" id="tw-trans">（點 🔊 聽整句、點粗體單字看意思＋加入閃卡）</div>
      <div class="pet-actrow">
        ${J[p.job] && !J[p.job].basic ? `<span class="pg-hint">${J[p.job].ico} ${J[p.job].name}（職業居民不可改派）</span>`
        : basics.map(j => `<button class="btn small ghost tw-job" data-j="${j}" data-id="${p.id}">${J[j].ico} 派去${J[j].name}</button>`).join('') +
          (p.job ? `<button class="btn small ghost tw-job" data-j="" data-id="${p.id}">☕ 休息</button>` : '')}
      </div>
    </div>`;
    const sayLine = () => window.VDSpeak && VDSpeak.supported() && VDSpeak.say(line.text.replace(/<[^>]+>/g, ''));
    box.querySelector('#twSay').onclick = sayLine;
    sayLine();
    box.querySelectorAll('.npc-w').forEach(w => w.onclick = () => {
      const wo = words()[w.dataset.w];
      const t = box.querySelector('#tw-trans');
      if (!wo) { t.textContent = `${w.dataset.w}：這個字不在字庫`; return; }
      const fresh = VDStore.enroll(wo.word);
      if (window.VDSpeak && VDSpeak.supported()) VDSpeak.say(wo.word);
      t.innerHTML = `<b>${wo.word}</b>　${wo.zh}${fresh ? '　✅ 已加入閃卡' : '　（閃卡裡已有）'}`;
    });
    box.querySelectorAll('.tw-job').forEach(b => b.onclick = () => {
      const r = VDTown.assignJob(+b.dataset.id, b.dataset.j);
      VDGame.toast(r.ok ? '已派工' : r.msg);
      if (r.ok) paint();
    });
  }

  /* ── 學校：挑居民＋職業 → 主題單字測驗（10 題對 8）→ 結業 ── */
  function schoolPanel(box) {
    const idle = VDTown.idle().concat(VDTown.raw.pop.filter(p => p.job && VDTown.jobs()[p.job].basic));
    const J = VDTown.jobs();
    const profs = Object.keys(J).filter(j => !J[j].basic);
    if (!idle.length) { box.innerHTML = '<div class="pg-fam">沒有可訓練的居民（職業居民不能轉職）。</div>'; return; }
    box.innerHTML = `<div class="pg-fam"><b>🎓 職業訓練</b>　挑一位居民＋一個職業，通過 10 題主題單字測驗（對 8 題）就結業。
      <div class="pet-actrow">學員：<select id="twStu" class="tw-sel">${idle.map(p => `<option value="${p.id}">${p.name}${p.job ? '（' + J[p.job].name + '）' : ''}</option>`).join('')}</select></div>
      <div class="pg-fam-tags">${profs.map(j => `<button class="pg-tag tw-prof" data-j="${j}">${J[j].ico} ${J[j].name}<span>學費 ${J[j].tuition}</span></button>`).join('')}</div>
    </div>`;
    box.querySelectorAll('.tw-prof').forEach(b => b.onclick = () => {
      const id = +box.querySelector('#twStu').value;
      startQuiz(id, b.dataset.j);
    });
  }
  function startQuiz(id, job) {
    const wm = words();
    const themed = VDTown.trainWords(job).map(w => wm[w]).filter(Boolean);
    const fill = VDApp.words().filter(w => !themed.includes(w));
    while (themed.length < 10) themed.push(fill[Math.floor(Math.random() * fill.length)]);
    const qs = themed.slice(0, 10).map(w => townQ(w, fill));
    let i = 0, score = 0;
    const J = VDTown.jobs()[job];
    const step = () => {
      if (i >= qs.length) {
        const passed = score >= 8;
        const r = passed ? VDTown.train(id, job, true) : { ok: false, msg: '' };
        el.querySelector('#tw-panel').innerHTML = `<div class="pg-fam">
          <b>${passed && r.ok ? '🎉 結業！' : '📚 再接再厲'}</b> 答對 ${score}/10${passed
            ? (r.ok ? `——${VDTown.raw.pop.find(p => p.id === id).name} 成為${J.name}！（學費 ${J.tuition} 已繳）` : `，但${r.msg}`)
            : '，要對 8 題才能結業。多背幾個主題字再來！'}
        </div>`;
        if (r.ok) setTimeout(paint, 1600);
        return;
      }
      const q = qs[i];
      const box = el.querySelector('#tw-panel');
      box.innerHTML = `<div class="pg-fam">
        <b>🎓 ${J.name}測驗</b>　第 ${i + 1}/10 題（答對 ${score}）
        ${qBody(q)}
      </div>`;
      bindQ(box, q, (correct) => {
        VDStore.record(q.w.word, correct);
        VDGame.onAnswer(correct, 'quiz', 0);
        if (correct) score++;
        i++;
        step();
      });
    };
    step();
  }

  return { render };
})();
window.VDTownUI = VDTownUI;
