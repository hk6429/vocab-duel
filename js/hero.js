/* 英雄檔案：自訂頭像/暱稱（CD3/4）、等級稱號、徽章牆（CD2）、字幣護盾（CD4/8）、分享挑戰（CD5） */
const VDHero = (() => {
  let el = null;

  function render(container) {
    el = container;
    const g = VDGame, lp = g.levelProgress(), bc = g.badgeCount();
    const badges = g.badges();
    el.innerHTML = `
      <img class="hero-banner2" src="img/ui/p_hero2.png" alt="" onerror="this.remove()">
      <div class="hero-card">
        <button class="hero-av" id="avPick">${g.avatar}</button>
        <div class="hero-meta">
          <input class="hero-nick" id="nick" maxlength="12" placeholder="取個英雄名…" value="${g.heroName() === '無名字鬥者' ? '' : g.heroName()}">
          <div class="hero-lv">Lv${lp.L}　<b>${lp.title}</b></div>
          <div class="vg-xpbar big"><span style="width:${lp.pct}%"></span></div>
          <div class="hero-xp">${lp.inLv} / ${lp.need} XP　到下一級</div>
        </div>
      </div>
      <div class="hero-wallet">
        <span>🪙 ${g.coins} 字幣</span>
        <span>🛡️ ${g.shield} 護盾</span>
        <button class="btn ghost sm" id="buyShield">買護盾（100幣）</button>
      </div>
      <div class="hero-shieldhint">護盾可在連續天數即將中斷時自動頂上，別讓 🔥 歸零。</div>

      <div class="hero-sec">🏆 成就徽章　${bc.got}/${bc.total}</div>
      <div class="badge-grid">
        ${badges.map(b => `<div class="badge ${b.got ? 'got' : 'lock'}" title="${b.desc}">
          <span class="badge-ico">${b.got ? b.ico : '🔒'}</span>
          <span class="badge-name">${b.name}</span>
          <span class="badge-desc">${b.desc}</span></div>`).join('')}
      </div>

      <div class="hero-sec">⚙️ 設定</div>
      <div class="hero-settings">
        <button class="set-toggle" id="sndToggle">🔊 音效：<b>${VDSound.on ? '開' : '關'}</b></button>
        <button class="set-toggle" id="fsToggle">🔠 字級：<b>${(localStorage.getItem('vd_fontscale') || 'normal') === 'large' ? '大' : '標準'}</b></button>
      </div>

      <div class="hero-sec">📣 分享與挑戰</div>
      <div class="hero-share">
        <button class="btn" id="shareBtn">📋 複製戰績卡</button>
        <button class="btn ghost" id="chalBtn">⚔️ 產生挑戰碼</button>
      </div>
      <textarea id="shareBox" class="share-box" placeholder="複製的戰績卡／挑戰碼會出現在這裡，貼給同學 PK！"></textarea>
      <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button>`;

    // 頭像選擇
    el.querySelector('#avPick').onclick = () => pickAvatar();
    // 暱稱即時存
    el.querySelector('#nick').onchange = e => VDGame.setNick(e.target.value);
    // 護盾
    el.querySelector('#buyShield').onclick = () => { if (VDGame.buyShield()) render(el); else VDGame.toast('字幣不足，先去答題賺幣吧！'); };
    // 設定
    el.querySelector('#sndToggle').onclick = () => { VDSound.setOn(!VDSound.on); render(el); };
    el.querySelector('#fsToggle').onclick = () => { VDApp.toggleFontScale(); render(el); };
    // 分享
    el.querySelector('#shareBtn').onclick = () => copyOut(VDGame.bragText(), '戰績卡已複製，貼給同學！');
    el.querySelector('#chalBtn').onclick = () => copyOut('CHALLENGE:' + VDGame.challengeCode(), '挑戰碼已複製，同學在限時衝刺輸入即可 PK！');
  }

  function pickAvatar() {
    const cur = VDGame.avatar;
    const box = document.createElement('div');
    box.className = 'av-modal';
    box.innerHTML = `<div class="av-panel"><div class="av-title">選一個英雄化身</div>
      <div class="av-grid">${VDGame.AVATARS.map(a => `<button class="av-opt ${a === cur ? 'on' : ''}" data-a="${a}">${a}</button>`).join('')}</div></div>`;
    box.onclick = e => { if (e.target === box) box.remove(); };
    box.querySelectorAll('.av-opt').forEach(b => b.onclick = () => { VDGame.setAvatar(b.dataset.a); box.remove(); render(el); });
    document.body.appendChild(box);
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
