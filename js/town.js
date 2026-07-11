/* 單字之城 VDTownUI：8×8 磚格城鎮。蓋房→招居民→學校訓練職業→解鎖建築鏈；
   資源靠「親自學習」與「詞靈徵戰」，工人只是自動化倍率。居民全講英文。 */
const VDTownUI = (() => {
  let el = null;
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
    VDTown.tickUpgrades();
    paint();
  }

  /* ── 主畫面 ── */
  function paint() {
    const g = VDTown.raw;
    const B = VDTown.buildings();
    const grid = [];
    for (let r = 0; r < VDTown.GRID; r++) for (let c = 0; c < VDTown.GRID; c++) {
      const cell = g.grid[`${r},${c}`];
      grid.push(cell
        ? `<button class="tw-cell has" data-k="${r},${c}">
            <img src="${img(cell.b + '_s' + stageOf(cell.lv))}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${B[cell.b].ico}',className:'tw-emoji'}))">
            <i class="tw-lv">Lv${cell.lv}</i>${cell.up ? '<i class="tw-up">🔨</i>' : ''}
          </button>`
        : `<button class="tw-cell" data-k="${r},${c}"></button>`);
    }
    const res = VDTown.RES.map(r => `<span class="tw-res">${VDTown.RES_META[r].ico} ${g.res[r] || 0}</span>`).join('');
    const q = VDTown.questInfo();
    const pk = VDTown.packInfo();
    const tk = VDTown.tokenInfo();
    const mv = VDTown.moveinInfo();
    el.innerHTML = `
      <div class="wc-card">
        <img class="wc-card-img" src="img/ui/h_town.png" alt="" onerror="this.remove()">
        <div class="wc-card-body">
          <p class="pg-hint">🏛️ 市政廳 Lv${VDTown.thLevel()}・👥 ${g.pop.length}/${VDTown.popCap()} 人・📚 精熟 ${VDTown.mastered()} 字（城的高度＝你的單字量）</p>
          <div class="tw-resbar">${res}<span class="tw-res">🪙 ${VDTown.raw.tokens} 代幣</span><span class="tw-res">💰 ${VDGame.raw.coins}</span></div>
          <div class="tw-grid" style="background-image:url(${img('base')})">${grid.join('')}</div>
          <div id="tw-panel"></div>
        </div>
      </div>

      <div class="wc-card"><div class="wc-card-body">
        <div class="hero-sec">👥 居民（點居民聽英文）</div>
        <div class="tw-popgrid">${g.pop.map(p => {
          const job = VDTown.jobs()[p.job];
          const av = p.job ? `res_${p.job}` : (p.id % 2 ? 'res_villager_m' : 'res_villager_f');
          return `<button class="tw-npc" data-id="${p.id}">
            <img src="${img(av)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${job ? job.ico : '🙂'}',className:'tw-emoji'}))">
            <b>${p.name}</b><i>${job ? job.ico + job.name : '閒置'}</i>
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

      <div class="wc-card"><div class="wc-card-body">
        <div class="hero-sec">☁️ 城鎮雲端綁定</div>
        <div class="pg-hint">把城綁到你的同步碼，換裝置繼續蓋（同步碼在「雲端／班級榜」）。</div>
        <div class="pet-actrow">
          <input class="rt-join-in" id="twCode" placeholder="同步碼" style="width:150px;letter-spacing:normal">
          <button class="btn small" id="twSave">上傳</button>
          <button class="btn small ghost" id="twLoad">下載</button>
        </div>
      </div></div>
      ${VDGame.milestoneHtml()}
      <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button>`;
    bind();
  }

  function bind() {
    el.querySelectorAll('.tw-cell').forEach(b => b.onclick = () => cellPanel(b.dataset.k));
    el.querySelectorAll('.tw-npc').forEach(b => b.onclick = () => npcPanel(+b.dataset.id));
    const $ = s => el.querySelector(s);
    $('#twMovein').onclick = () => { const r = VDTown.tryMovein(); VDGame.toast(r.ok ? `🎉 ${r.name} 搬進來了！` : r.msg); if (r.ok) paint(); };
    if ($('#twHarvest')) $('#twHarvest').onclick = () => {
      const r = VDTown.harvest();
      if (!r.ok) return VDGame.toast(r.msg);
      VDGame.toast('🧺 收成：' + Object.entries(r.out).filter(([, v]) => v).map(([k, v]) => `${VDTown.RES_META[k].ico}+${v}`).join(' '));
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
  }

  async function cloudOp(op) {
    const code = el.querySelector('#twCode').value.trim();
    if (code.length < 4) return VDGame.toast('先輸入同步碼（至少 4 碼）');
    try {
      const r = await fetch('api/town', {
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
    box.innerHTML = `<div class="pg-fam">
      <b>${def.ico} ${def.name} Lv${cell.lv}</b>　<span class="pg-hint">${def.desc}</span>
      <div class="pet-actrow" style="margin-top:6px">
        ${cell.up
          ? `<span class="pg-hint">🔨 升級中，還要約 ${upLeft} 分鐘</span><button class="btn small" id="twRush">🪙×1 立刻完工</button>`
          : req.ok
            ? `<button class="btn small" id="twUp">⬆️ 升 Lv${req.next}（${Object.entries(req.cost).map(([r, v]) => VDTown.RES_META[r].ico + v).join(' ')}・${req.next * 5} 分鐘）</button>`
            : `<span class="pg-hint">⬆️ ${req.msg}</span>`}
        ${cell.b === 'school' ? '<button class="btn small" id="twTrain">🎓 職業訓練</button>' : ''}
      </div>
    </div>`;
    const $ = s => box.querySelector(s);
    if ($('#twUp')) $('#twUp').onclick = () => { const r = VDTown.upgrade(key); VDGame.toast(r.ok ? `🔨 開工！約 ${r.minutes} 分鐘` : r.msg); if (r.ok) paint(); };
    if ($('#twRush')) $('#twRush').onclick = () => { const r = VDTown.rushUpgrade(key); VDGame.toast(r.ok ? '🪙 完工！' : r.msg); if (r.ok) paint(); };
    if ($('#twTrain')) $('#twTrain').onclick = () => schoolPanel(box);
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
      <b>${p.name}</b>：“${line.text}” 🔊
      <div class="pg-hint" id="tw-trans">（點粗體單字看意思、加入閃卡）</div>
      <div class="pet-actrow">
        ${J[p.job] && !J[p.job].basic ? `<span class="pg-hint">${J[p.job].ico} ${J[p.job].name}（職業居民不可改派）</span>`
        : basics.map(j => `<button class="btn small ghost tw-job" data-j="${j}" data-id="${p.id}">${J[j].ico} 派去${J[j].name}</button>`).join('') +
          (p.job ? `<button class="btn small ghost tw-job" data-j="" data-id="${p.id}">☕ 休息</button>` : '')}
      </div>
    </div>`;
    if (window.VDSpeak && VDSpeak.supported()) VDSpeak.say ? VDSpeak.say(line.text.replace(/<[^>]+>/g, '')) : null;
    box.querySelectorAll('.npc-w').forEach(w => w.onclick = () => {
      const wo = words()[w.dataset.w];
      const t = box.querySelector('#tw-trans');
      if (!wo) { t.textContent = `${w.dataset.w}：這個字不在字庫`; return; }
      const fresh = VDStore.enroll(wo.word);
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
    const qs = themed.slice(0, 10).map(w => {
      const opts = [w.zh];
      while (opts.length < 4) {
        const d = fill[Math.floor(Math.random() * fill.length)].zh;
        if (!opts.includes(d)) opts.push(d);
      }
      opts.sort(() => Math.random() - 0.5);
      return { w, opts };
    });
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
      el.querySelector('#tw-panel').innerHTML = `<div class="pg-fam">
        <b>🎓 ${J.name}測驗</b>　第 ${i + 1}/10 題（答對 ${score}）
        <div class="quiz-prompt" style="margin:8px 0">${q.w.word}</div>
        <div class="quiz-opts">${q.opts.map((o, k) => `<button class="btn opt" data-v="${encodeURIComponent(o)}"><span class="opt-key">${'ABCD'[k]}</span><span class="opt-text">${o}</span></button>`).join('')}</div>
      </div>`;
      el.querySelectorAll('#tw-panel .opt').forEach(b => b.onclick = () => {
        const correct = decodeURIComponent(b.dataset.v) === q.w.zh;
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
