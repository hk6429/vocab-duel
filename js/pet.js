/* 詞靈夥伴 VDPet：20 寵清單、詳情養成（升級/進化/技能/裝備/裝飾/特寫/出戰）、詞源之力區 */
const VDPet = (() => {
  let el = null;

  const imgOf = (id, stage) => `img/pets/${id}_s${stage}.png`;
  const KNAME = { p: '字首', s: '字尾', r: '字根' };

  /* 幼靈圖＝雙親水彩圖 CSS 疊合＋色相偏移（第一版不生新圖） */
  const petImg = (p, stage, cls) => p.parents
    ? `<span class="fu-imgs ${cls || ''}">
        <img src="${imgOf(p.parents[0], 3)}" alt="" onerror="this.remove()">
        <img src="${imgOf(p.parents[1], 3)}" class="fu-b" alt="" onerror="this.remove()">
        <b class="fu-egg">🐣</b>
      </span>`
    : `<img class="${cls || ''}" src="${imgOf(p.id, stage)}" alt=""
        onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'wc-mcard-ph',textContent:'${p.ico}'}))">`;

  async function render(container) {
    el = container;
    el.innerHTML = '<div class="loading">詞靈甦醒中…</div>';
    await VDPets.init();
    renderList();
  }

  /* ── 清單 ── */
  function renderList() {
    const list = VDPets.list();
    const ownedN = list.filter(p => p.owned).length;
    const cost = VDPets.adoptCost();
    el.innerHTML = `
      <div class="wc-card">
        <img class="wc-card-img" src="img/ui/h_pets.png" alt="" onerror="this.remove()">
        <div class="wc-card-body">
          <p class="pg-hint">每隻詞靈守護一族字綴——你學會的字越多，牠的「詞源之力」越強。已結緣 <b>${ownedN}</b>/20${ownedN < 20 ? `・下一隻 ${cost === 0 ? '免費！' : cost + ' 字幣'}` : '・全員到齊！'}</p>
          <div class="shop-wallet">💰 ${VDGame.raw.coins} 字幣　⚔️ 競技積分 ${VDPets.rating}</div>
        </div>
      </div>
      <div class="wc-mgrid pet-grid">
        ${list.map(p => `
          <button class="wc-mcard pet-card ${p.owned ? '' : 'locked'}" data-id="${p.id}">
            ${p.isActive ? '<span class="wc-mcard-badge">出戰中</span>' : ''}
            ${p.isFusion ? petImg(p, p.stage, 'wc-mcard-img') : `<img class="wc-mcard-img ${p.owned ? '' : 'pet-sil'}" src="${imgOf(p.id, p.stage)}" alt=""
              onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'wc-mcard-ph',textContent:'${p.ico}'}))">`}
            <div class="wc-mcard-cap">
              <div class="wc-mcard-title">${p.deco || ''}${p.name}</div>
              <span class="wc-mcard-sub">${p.owned ? `Lv.${p.lv}　⚔️${p.atk}　❤️${p.hp}` : `${p.theme}・領養 ${cost === 0 ? '免費' : cost + ' 幣'}`}</span>
            </div>
          </button>`).join('')}
      </div>
      ${altarCard(list)}
      ${bagCard()}
      ${VDGame.milestoneHtml()}
      <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button>`;
    el.querySelectorAll('.pet-card').forEach(b => { b.onclick = () => renderDetail(b.dataset.id); });
    bindAltar();
    bindBag();
  }

  /* ── 詞源融合祭壇：兩隻滿級 → 幼靈 ── */
  let fusePick = [];
  function altarCard(list) {
    const ready = VDPets.canFuse();
    const fusions = VDPets.fusions();
    if (ready.length < 2 && !fusions.length) return '';
    if (ready.length < 2) return `
      <div class="wc-card"><div class="wc-card-body">
        <div class="hero-sec">🐣 詞源融合祭壇</div>
        <div class="pg-hint">再養滿兩隻 Lv25 詞靈，就能融合出第 21 隻「幼靈」（已有 ${fusions.length}/${VDPets.FUSE_MAX}）。</div>
      </div></div>`;
    const cands = list.filter(p => ready.includes(p.id));
    const picked = fusePick.filter(id => ready.includes(id));
    const skillPool = picked.length === 2
      ? [...VDPets.def(picked[0]).skills, ...VDPets.def(picked[1]).skills]
      : [];
    return `
      <div class="wc-card"><div class="wc-card-body">
        <div class="hero-sec">🐣 詞源融合祭壇　<span class="pg-hint">${fusions.length}/${VDPets.FUSE_MAX} 幼靈</span></div>
        <div class="pg-hint">選兩隻 Lv25 詞靈融合出幼靈：守護字綴＝雙親聯集（分母變大→先變弱，補學就變強）。代價：雙親降回 Lv15＋${VDPets.FUSE_COST} 字幣。</div>
        <div class="pg-fam-tags">${cands.map(p => `
          <button class="pg-tag fu-cand ${picked.includes(p.id) ? 'on' : ''}" data-id="${p.id}">${p.ico} ${p.name}</button>`).join('')}</div>
        ${picked.length === 2 ? `
          <div class="pet-actrow" style="margin-top:8px">
            <input class="rt-join-in" id="fuName" maxlength="4" placeholder="幼靈名 2–4 字" style="width:150px;letter-spacing:normal">
          </div>
          <div class="pg-hint">從雙親 6 技挑 3 個：</div>
          <div class="pg-fam-tags">${skillPool.map(s => `
            <button class="pg-tag fu-skill" data-s="${s}">${s}</button>`).join('')}</div>
          <button class="btn" id="doFuse" style="margin-top:8px">🐣 融合（${VDPets.FUSE_COST} 字幣）</button>` : ''}
      </div></div>`;
  }
  function bindAltar() {
    el.querySelectorAll('.fu-cand').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.id;
        if (fusePick.includes(id)) fusePick = fusePick.filter(x => x !== id);
        else { fusePick.push(id); if (fusePick.length > 2) fusePick.shift(); }
        renderList();
      };
    });
    const skillSel = new Set();
    el.querySelectorAll('.fu-skill').forEach(b => {
      b.onclick = () => {
        const s = b.dataset.s;
        if (skillSel.has(s)) { skillSel.delete(s); b.classList.remove('on'); }
        else if (skillSel.size < 3) { skillSel.add(s); b.classList.add('on'); }
      };
    });
    const go = el.querySelector('#doFuse');
    if (go) go.onclick = () => {
      const name = (el.querySelector('#fuName') || {}).value || '';
      const r = VDPets.fuse(fusePick[0], fusePick[1], name, [...skillSel]);
      if (!r.ok) return VDGame.toast(r.msg);
      fusePick = [];
      VDGame.toast(`🐣 ${name.trim()} 誕生了！`);
      renderDetail(r.id);
    };
  }

  /* ── 背包＋鍛造：3 件同階熔 1 件高一階 ── */
  let sel = new Set();
  function bagCard() {
    const bag = VDPets.bag();
    const perks = VDPets.activePerks();
    const item = (it, i) => `
      <button class="pet-eq bag-it t-${it.tier} ${sel.has(i) ? 'sel' : ''}" data-i="${i}">
        ${it.ico} ${it.name}<i>${it.atk ? '⚔️+' + it.atk : '❤️+' + it.hp}${it.perk ? '・' + VDPets.PERKS[it.perk].ico : ''}</i>
      </button>`;
    return `
      <div class="wc-card">
        <div class="wc-card-body">
          <div class="hero-sec">🎒 裝備背包　<b>${bag.length}</b>/${VDPets.BAG_MAX}</div>
          ${perks.length ? `<div class="pg-hint">出戰詞條生效中：${perks.map(p => `${p.ico} ${p.name}`).join('・')}</div>` : ''}
          ${bag.length ? `<div class="pet-equips">${bag.map(item).join('')}</div>
          <div class="pet-actrow">
            <button class="btn small" id="bagEquip" ${sel.size === 1 ? '' : 'disabled'}>裝上出戰詞靈</button>
            <button class="btn small" id="bagForge" ${sel.size === 3 ? '' : 'disabled'}>🔥 鍛造（3 同階 → 高一階）</button>
            <button class="btn small ghost" id="bagDrop" ${sel.size ? '' : 'disabled'}>丟棄</button>
          </div>
          <div class="hero-shieldhint">點裝備選取；稀有以上可能帶「學習詞條」，掛在出戰詞靈身上全站生效。</div>`
        : '<div class="pg-hint">背包空空——去野生試煉打寶吧！</div>'}
        </div>
      </div>`;
  }
  function bindBag() {
    el.querySelectorAll('.bag-it').forEach(b => {
      b.onclick = () => {
        const i = +b.dataset.i;
        sel.has(i) ? sel.delete(i) : sel.add(i);
        renderList();
      };
    });
    const $ = s => el.querySelector(s);
    if ($('#bagEquip')) $('#bagEquip').onclick = () => {
      const active = VDPets.active();
      if (!active) return VDGame.toast('先設定出戰詞靈');
      const r = VDPets.equipFromBag(active, [...sel][0]);
      VDGame.toast(r.ok ? (r.prev ? '已裝上（原裝備回背包）' : '已裝上') : r.msg);
      sel.clear(); renderList();
    };
    if ($('#bagForge')) $('#bagForge').onclick = () => {
      const r = VDPets.forge([...sel]);
      if (!r.ok) return VDGame.toast(r.msg);
      VDGame.toast(`🔥 鍛造成功：${r.item.name}！`);
      sel.clear(); renderList();
    };
    if ($('#bagDrop')) $('#bagDrop').onclick = () => {
      [...sel].sort((a, b) => b - a).forEach(i => VDPets.dropBag(i));
      VDGame.toast('已丟棄');
      sel.clear(); renderList();
    };
  }

  /* ── 詳情 ── */
  function renderDetail(id) {
    const p = VDPets.list().find(x => x.id === id);
    const fs = VDPets.familyStats(id);
    const pw = Math.round(p.power * 100);
    if (!p.owned) {
      const cost = VDPets.adoptCost();
      el.innerHTML = `
        <div class="wc-card pet-detail">
          <img class="wc-card-img pet-sil" src="${imgOf(id, 1)}" alt="" onerror="this.remove()">
          <div class="wc-card-body">
            <h2>${p.ico} ${p.name}</h2>
            <p class="pg-hint">${p.theme}・守護 ${p.affixes.length} 個字綴（已學 ${fs.learned}/${fs.total} 字）</p>
            ${affixChips(p)}
            <button class="btn" id="doAdopt">🤝 結緣領養（${cost === 0 ? '首隻免費' : cost + ' 字幣'}）</button>
            <button class="btn ghost" id="backList">← 回詞靈列表</button>
          </div>
        </div>`;
      el.querySelector('#doAdopt').onclick = () => {
        const r = VDPets.adopt(id);
        if (!r.ok) return VDGame.toast(r.msg);
        VDGame.toast(`🎉 ${p.name} 加入了你的隊伍！`);
        renderDetail(id);
      };
      el.querySelector('#backList').onclick = renderList;
      return;
    }
    const lvCost = VDPets.levelCost(p.lv);
    const skills = VDPets.skillsOf(id);
    const nextEvo = p.lv < 10 ? `Lv.10 進化` : p.lv < 25 ? `Lv.25 終階` : '終階型態';
    el.innerHTML = `
      <div class="wc-card pet-detail">
        ${p.isFusion ? petImg(p, p.stage, 'wc-card-img pet-stage') : `<img class="wc-card-img pet-stage" id="petImg" src="${imgOf(id, p.stage)}" alt=""
          onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'wc-mcard-ph',textContent:'${p.ico}'}))">`}
        ${p.deco ? `<span class="pet-deco">${p.deco}</span>` : ''}
        <div class="wc-card-body">
          <h2>${p.ico} ${p.name} <span class="pet-lv">Lv.${p.lv}</span>${p.isActive ? '<span class="wc-mcard-badge" style="position:static">出戰中</span>' : ''}</h2>
          <p class="pg-hint">${p.theme}・第 ${p.stage} 階（${nextEvo}）</p>
          <div class="pet-stats">
            <div class="pet-stat"><span>⚔️ 攻擊</span><b>${p.atk}</b></div>
            <div class="pet-stat"><span>❤️ 血量</span><b>${p.hp}</b></div>
            <div class="pet-stat"><span>📖 詞源之力</span><b>+${pw}%</b></div>
          </div>
          <div class="pet-actrow">
            ${p.lv < VDPets.MAX_LV ? `<button class="btn" id="doLv">⬆️ 升級（${lvCost} 字幣）</button>` : '<span class="pet-max">🌟 已滿級</span>'}
            ${p.isActive ? '' : '<button class="btn" id="doActive">🚩 出戰</button>'}
            <button class="btn ghost" id="doClose">🔍 特寫</button>
          </div>

          <div class="pg-sub">✨ 技能（Lv.5／12／20 解鎖）</div>
          <div class="pet-skills">${skills.map(s => `
            <div class="pet-skill ${s.unlocked ? '' : 'locked'}">
              <span class="ps-ico">${s.unlocked ? s.ico : '🔒'}</span>
              <b>${s.name}</b><i>${s.unlocked ? s.desc : `Lv.${s.needLv} 解鎖`}</i>
            </div>`).join('')}</div>

          <div class="pg-sub">🛡️ 裝備（點擊卸下）</div>
          <div class="pet-equips">${VDPets.SLOTS.map(sl => {
            const it = p.equip[sl];
            return it
              ? `<button class="pet-eq t-${it.tier}" data-sl="${sl}">${it.ico} ${it.name}<i>${it.atk ? '⚔️+' + it.atk : '❤️+' + it.hp}${it.perk ? '・' + VDPets.PERKS[it.perk].ico + VDPets.PERKS[it.perk].name : ''}</i></button>`
              : `<div class="pet-eq empty">${VDPets.SLOT_NAME[sl]}<i>對戰掉落</i></div>`;
          }).join('')}</div>

          <div class="pg-sub">🎀 裝飾</div>
          <div class="pet-decos">${VDPets.DECOS.map(d =>
            `<button class="pet-dbtn ${p.deco === d ? 'on' : ''}" data-d="${d}">${d || '無'}</button>`).join('')}</div>

          <div class="pg-sub">📚 守護字綴（學這家族＝餵養牠）</div>
          ${affixChips(p)}
          <div class="pg-hint">已學 ${fs.learned}/${fs.total} 字・精熟 ${fs.mastered}　<button class="btn small" id="doTrain">🃏 學這家族的字</button>　<button class="btn small ghost" id="doGraph">🌌 看星圖</button></div>

          <button class="btn ghost" id="backList" style="margin-top:12px">← 回詞靈列表</button>
        </div>
      </div>`;
    bindDetail(id, p);
  }

  const affixChips = p => `<div class="pg-fam-tags">${p.affixes.map(a =>
    `<span class="pg-tag">${a.f}<span>${KNAME[a.k]}</span></span>`).join('')}</div>`;

  function bindDetail(id, p) {
    const $ = s => el.querySelector(s);
    if ($('#doLv')) $('#doLv').onclick = () => {
      const r = VDPets.levelUp(id);
      if (!r.ok) return VDGame.toast(r.msg);
      if (r.evolved) evoAnim(id, r.evolved, () => renderDetail(id));
      else { VDGame.toast(`⬆️ ${p.name} 升到 Lv.${r.lv}！`); renderDetail(id); }
    };
    if ($('#doActive')) $('#doActive').onclick = () => { VDPets.setActive(id); VDGame.toast(`🚩 ${p.name} 出戰！`); renderDetail(id); };
    $('#doClose').onclick = () => closeUp(p);
    el.querySelectorAll('.pet-eq[data-sl]').forEach(b => {
      b.onclick = () => {
        const r = VDPets.unequip(id, b.dataset.sl);
        VDGame.toast(r.ok ? '已卸下，收進背包' : r.msg);
        if (r.ok) renderDetail(id);
      };
    });
    el.querySelectorAll('.pet-dbtn').forEach(b => {
      b.onclick = () => { VDPets.setDeco(id, b.dataset.d); renderDetail(id); };
    });
    $('#doTrain').onclick = () => {
      const unlearned = [...VDPets.wordsOf(id)].filter(w => VDStore.box(w) < 0);
      const wmap = {}; for (const w of VDApp.words()) wmap[w.word.toLowerCase()] = w;
      const list = unlearned.map(w => wmap[w]).filter(Boolean).slice(0, 10);
      if (!list.length) return VDGame.toast('這家族的字都學過了！');
      el.innerHTML = '<div id="pet-flash"></div><button class="btn ghost" onclick="VDApp.go(\'pets\')">← 回詞靈</button>';
      VDFlash.start(list, el.querySelector('#pet-flash'), { raw: true });
    };
    $('#doGraph').onclick = () => VDApp.go('graph');
    $('#backList').onclick = renderList;
  }

  /* ── 進化動畫：vg-levelup 同款全螢幕＋換圖 ── */
  function evoAnim(id, stage, done) {
    const ov = document.createElement('div');
    ov.className = 'vg-levelup';
    ov.innerHTML = `<div class="pet-evo">
      <img src="${imgOf(id, stage)}" alt="" onerror="this.remove()">
      <div class="pet-evo-txt">✨ 進化！第 ${stage} 階型態 ✨</div>
      <div class="pg-hint" style="color:#eee">點擊任意處繼續</div>
    </div>`;
    ov.onclick = () => { ov.remove(); done(); };
    document.body.appendChild(ov);
  }

  /* ── 特寫 modal ── */
  function closeUp(p) {
    const ov = document.createElement('div');
    ov.className = 'vg-levelup';
    ov.innerHTML = `<div class="pet-closeup">
      ${p.deco ? `<span class="pet-deco big">${p.deco}</span>` : ''}
      <img src="${imgOf(p.id, p.stage)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'wc-mcard-ph',textContent:'${p.ico}'}))">
      <div class="pet-evo-txt">${p.ico} ${p.name}　Lv.${p.lv}</div>
      <div class="pg-hint" style="color:#eee">⚔️${p.atk}　❤️${p.hp}　詞源之力 +${Math.round(p.power * 100)}%</div>
    </div>`;
    ov.onclick = () => ov.remove();
    document.body.appendChild(ov);
  }

  return { render };
})();
window.VDPet = VDPet;
