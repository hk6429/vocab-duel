/* 英雄檔案：自訂頭像/暱稱（CD3/4）、等級稱號、徽章牆（CD2）、字幣護盾（CD4/8）、分享挑戰（CD5） */
const VDHero = (() => {
  let el = null, curTab = 'me';

  function tabBar() {
    const tab = (id, label) => `<button class="hero-tab ${curTab === id ? 'on' : ''}" data-htab="${id}">${label}</button>`;
    return `<div class="hero-tabs">${tab('me', '🦸 本人戰績')}${tab('class', '🏫 班級榜')}${tab('pet', '🐾 詞靈榜')}</div>`;
  }

  function meTab() {
    const g = VDGame, lp = g.levelProgress(), bc = g.badgeCount();
    const badges = g.badges();
    const streak = VDStore.stats([]).streak;
    const rep = VDStore.streakRepairInfo();
    return `
      <div class="wc-card">
        <img loading="lazy" decoding="async" class="wc-card-img tall" src="img/ui/h_hero.webp" alt="" onerror="this.remove()">
        <div class="wc-card-body">
          <div class="hero-card">
            <button class="hero-av" id="avPick">${g.avHtml('big')}</button>
            <div class="hero-meta">
              <input class="hero-nick" id="nick" maxlength="12" placeholder="取個英雄名…" value="${g.heroName() === '無名字鬥者' ? '' : g.heroName()}">
              <div class="hero-lv">Lv${lp.L}　<b>${lp.title}</b></div>
              <div class="vg-xpbar big"><span style="width:${lp.pct}%"></span></div>
              <div class="hero-xp">${lp.inLv} / ${lp.need} XP　到下一級</div>
            </div>
          </div>
          <div class="hero-rank">${(r => `${r.ico} 對戰段位：<b>${r.name}</b>　${r.pts} 分${r.next ? `（再 ${r.next.at - r.pts} 分晉升）` : ''}`)(g.rankInfo())}</div>
          <div class="hero-wallet">
            <span>🔥 連續 ${streak} 天</span>
            <span>🪙 ${g.coins} 字幣</span>
            <span>🛡️ ${g.shield} 護盾</span>
            <span>🪶 ${g.revive} 羽毛</span>
            <button class="btn ghost sm" onclick="VDApp.go('shop')">🏪 去商店</button>
          </div>
          ${rep ? `<div class="pg-hint">🔥 連續 ${rep.was} 天斷掉了！<button class="btn small" id="btnRepair">🛠️ 花 ${rep.cost} 字幣接回</button></div>` : ''}
          <div class="hero-shieldhint">護盾可在連續天數即將中斷時自動頂上，別讓 🔥 歸零。</div>
        </div>
      </div>

      <div class="wc-card">
        <img loading="lazy" decoding="async" class="wc-card-img" src="img/ui/h_badges.webp" alt="" onerror="this.remove()">
        <div class="wc-card-body">
          <div class="hero-sec">成就徽章　<b>${bc.got}/${bc.total}</b></div>
          <div class="badge-grid">
            ${badges.map(b => `<div class="badge ${b.got ? 'got' : 'lock'}" title="${b.desc}">
              <span class="badge-ico">${b.got ? b.ico : '🔒'}</span>
              <span class="badge-name">${b.name}</span>
              <span class="badge-desc">${b.desc}</span></div>`).join('')}
          </div>
        </div>
      </div>

      <div class="wc-card">
        <div class="wc-card-body">
          <div class="hero-sec">設定</div>
          <div class="hero-settings">
            <button class="set-toggle" id="sndToggle" aria-pressed="${VDSound.on}">🔊 音效：<b>${VDSound.on ? '開' : '關'}</b></button>
            <button class="set-toggle" id="fsToggle" aria-pressed="${(localStorage.getItem('vd_fontscale') || 'normal') === 'large'}">🔠 字級：<b>${(localStorage.getItem('vd_fontscale') || 'normal') === 'large' ? '大' : '標準'}</b></button>
            <button class="set-toggle" id="thToggle" aria-pressed="${localStorage.getItem('vd_theme') === 'dark'}">🌓 深色模式：<b>${localStorage.getItem('vd_theme') === 'dark' ? '開' : '關'}</b></button>
            <button class="set-toggle" id="qmToggle" aria-pressed="${localStorage.getItem('vd_quizmode') === 'en'}">🇬🇧 英英模式：<b>${localStorage.getItem('vd_quizmode') === 'en' ? '開' : '關'}</b></button>
            <button class="set-toggle" id="calmToggle" aria-pressed="${localStorage.getItem('vd_calm') === '1'}">🕊️ 安心模式：<b>${localStorage.getItem('vd_calm') === '1' ? '開' : '關'}</b></button>
          </div>
          <div class="pg-hint">英英模式：單字自測的「字義題」改用英文定義當選項（學測練兵）。</div>
          <div class="pg-hint">安心模式：隱藏排行榜名次比較，只跟上週的自己比——資料照常同步給老師。</div>
        </div>
      </div>

      <div class="wc-card">
        <img loading="lazy" decoding="async" class="wc-card-img" src="img/ui/h_share.webp" alt="" onerror="this.remove()">
        <div class="wc-card-body">
          <div class="hero-sec">分享與挑戰</div>
          <div class="hero-share">
            <button class="btn" id="shareBtn">🖼️ 分享戰績卡</button>
            <button class="btn ghost" id="txtBtn">📋 複製文字版</button>
            <button class="btn ghost" id="chalBtn">⚔️ 產生挑戰連結</button>
          </div>
          <textarea id="shareBox" class="share-box" placeholder="複製的戰績卡／挑戰碼會出現在這裡，貼給同學 PK！"></textarea>
        </div>
      </div>`;
  }

  function bindMeEvents() {
    // 頭像選擇
    el.querySelector('#avPick').onclick = () => pickAvatar();
    // 暱稱即時存
    el.querySelector('#nick').onchange = e => VDGame.setNick(e.target.value);
    // 連續天數修復
    const repBtn = el.querySelector('#btnRepair');
    if (repBtn) repBtn.onclick = () => {
      const ns = VDStore.repairStreak();
      VDGame.toast(ns ? `🔥 連續紀錄接回來了！目前 ${ns} 天` : '字幣不夠，先去練功賺一點吧');
      if (ns) render(el);
    };
    // 設定
    el.querySelector('#sndToggle').onclick = () => { VDSound.setOn(!VDSound.on); render(el); };
    el.querySelector('#fsToggle').onclick = () => { VDApp.toggleFontScale(); render(el); };
    el.querySelector('#thToggle').onclick = () => {
      const next = localStorage.getItem('vd_theme') === 'dark' ? 'light' : 'dark';
      localStorage.setItem('vd_theme', next);
      VDApp.applyTheme();
      render(el);
    };
    el.querySelector('#qmToggle').onclick = () => {
      const next = localStorage.getItem('vd_quizmode') === 'en' ? 'zh' : 'en';
      localStorage.setItem('vd_quizmode', next);
      if (next === 'en' && window.VDEnrich) VDEnrich.ensure();
      VDGame.toast(next === 'en' ? '🇬🇧 英英模式開啟——下一輪自測生效' : '已切回中文選項');
      render(el);
    };
    el.querySelector('#calmToggle').onclick = () => {
      const on = localStorage.getItem('vd_calm') === '1';
      if (on) localStorage.removeItem('vd_calm'); else localStorage.setItem('vd_calm', '1');
      VDGame.toast(on ? '已關閉安心模式，排行榜恢復顯示' : '🕊️ 安心模式開啟——排行榜只顯示你自己的進步');
      render(el);
    };
    // 分享
    el.querySelector('#shareBtn').onclick = () => shareCard();
    el.querySelector('#txtBtn').onclick = () => copyOut(VDGame.bragText(), '戰績卡文字已複製，貼給同學！');
    el.querySelector('#chalBtn').onclick = () => {
      const code = VDGame.challengeCode();
      const url = location.origin + location.pathname + '?ch=' + encodeURIComponent(code);
      copyOut(url, '⚔️ 挑戰連結已複製——同學點開就能應戰！');
      el.querySelector('#shareBox').value = url + '\nCHALLENGE:' + code;
    };
  }

  function render(container) {
    el = container;
    el.innerHTML = `${tabBar()}<div id="heroTabBody"></div>
      <button class="btn ghost wide" onclick="VDApp.go('menu')">回主選單</button>`;
    el.querySelectorAll('[data-htab]').forEach(b => {
      b.onclick = () => { curTab = b.dataset.htab; render(el); };
    });
    const body = el.querySelector('#heroTabBody');
    if (curTab === 'me') {
      body.innerHTML = meTab();
      bindMeEvents();
    } else if (curTab === 'class') {
      VDCloud.start(body);
    } else if (curTab === 'pet') {
      VDPetBattle.boardOnly(body);
    }
  }

  /* 戰績卡出圖：純 canvas 文字＋色塊，優先系統分享，退而下載 PNG，再退複製文字 */
  function drawCard() {
    const g = VDGame, lp = g.levelProgress(), bc = g.badgeCount(), rk = g.rankInfo();
    const streak = VDStore.stats([]).streak, mastered = g.masteredAll();
    const c = document.createElement('canvas');
    c.width = 800; c.height = 480;
    const x = c.getContext('2d');
    // 舊瀏覽器沒有 roundRect：退方角矩形
    if (!x.roundRect) x.roundRect = function (rx, ry, rw, rh) { this.rect(rx, ry, rw, rh); };
    // 底：靛藍→水藍漸層＋米白面板
    const bg = x.createLinearGradient(0, 0, 800, 480);
    bg.addColorStop(0, '#2c3e6b'); bg.addColorStop(1, '#6f9fc9');
    x.fillStyle = bg; x.fillRect(0, 0, 800, 480);
    x.fillStyle = 'rgba(255,250,240,.95)';
    x.beginPath(); x.roundRect(36, 36, 728, 408, 22); x.fill();
    // 標頭
    x.fillStyle = '#2c3e6b';
    x.font = '700 26px system-ui, sans-serif';
    x.fillText('⚔️ 字鬥英雄・戰績卡', 64, 92);
    x.strokeStyle = 'rgba(111,159,201,.5)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(64, 110); x.lineTo(736, 110); x.stroke();
    // 頭像＋名字
    x.font = '64px system-ui, sans-serif';
    x.fillText(g.avatar, 64, 196);
    x.fillStyle = '#2b2b2b';
    x.font = '800 40px system-ui, sans-serif';
    x.fillText(g.heroName(), 160, 176);
    x.fillStyle = '#6f6a60';
    x.font = '600 24px system-ui, sans-serif';
    x.fillText(`Lv${lp.L}　${lp.title}`, 160, 212);
    // 四格戰績
    const cells = [
      ['📚 已掌握', `${mastered} 字`], [`${rk.ico} 段位`, `${rk.name}`],
      ['🔥 連續', `${streak} 天`], ['🎖️ 徽章', `${bc.got}/${bc.total}`]
    ];
    cells.forEach(([lab, val], i) => {
      const cx = 64 + (i % 2) * 344, cy = 244 + Math.floor(i / 2) * 92;
      x.fillStyle = 'rgba(111,159,201,.12)';
      x.beginPath(); x.roundRect(cx, cy, 328, 76, 14); x.fill();
      x.fillStyle = '#6f6a60'; x.font = '600 20px system-ui, sans-serif';
      x.fillText(lab, cx + 20, cy + 32);
      x.fillStyle = '#2c3e6b'; x.font = '800 28px system-ui, sans-serif';
      x.fillText(val, cx + 20, cy + 64);
    });
    x.fillStyle = '#9a948a'; x.font = '500 18px system-ui, sans-serif';
    x.fillText('你也來字鬥吧！— vocab-duel', 64, 428);
    return c;
  }

  function shareCard() {
    try {
      const c = drawCard();
      c.toBlob(async blob => {
        if (!blob) return copyOut(VDGame.bragText(), '出圖失敗，改複製文字版！');
        const file = new File([blob], 'vocab-duel-card.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: '字鬥英雄戰績卡' });
            return;
          } catch (e) { if (e && e.name === 'AbortError') return; /* 不支援就往下走 */ }
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'vocab-duel-card.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        VDGame.toast('🖼️ 戰績卡 PNG 已下載，傳給同學吧！');
      }, 'image/png');
    } catch {
      copyOut(VDGame.bragText(), '出圖失敗，改複製文字版！');
    }
  }

  function pickAvatar() {
    const cur = VDGame.avatar;
    const prevFocus = document.activeElement;
    const box = document.createElement('div');
    box.className = 'av-modal';
    box.innerHTML = `<div class="av-panel" role="dialog" aria-modal="true" aria-label="選一個英雄化身"><div class="av-title">選一個英雄化身</div>
      <div class="av-grid">${VDGame.AVATARS.map(a => `<button class="av-opt ${a === cur ? 'on' : ''}" data-a="${a}" aria-label="化身 ${a}">${a}</button>`).join('')}</div>
      <button class="btn ghost" id="avClose">關閉</button></div>`;
    const close = () => {
      document.removeEventListener('keydown', onKey);
      box.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    box.onclick = e => { if (e.target === box) close(); };
    box.querySelector('#avClose').onclick = close;
    box.querySelectorAll('.av-opt').forEach(b => b.onclick = () => { VDGame.setAvatar(b.dataset.a); close(); render(el); });
    document.body.appendChild(box);
    (box.querySelector('.av-opt.on') || box.querySelector('.av-opt')).focus();
  }

  function copyOut(text, ok) {
    const ta = el.querySelector('#shareBox');
    ta.value = text;
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => VDGame.toast(ok)).catch(() => { ta.select(); VDGame.toast('已填入下方，長按複製'); });
    else { ta.select(); VDGame.toast('已填入下方，長按複製'); }
  }

  return { render };
})();
window.VDHero = VDHero;
