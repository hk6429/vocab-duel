/* 雲端存檔＋班級排行榜（VDCloud）
   - API 在 Vercel（唯一能跑 serverless 的平台）；CF/Netlify 前端一律打 Vercel 絕對網址
   - 未設定後端金鑰時，功能優雅降級：顯示「建置中」而非壞掉 */
const VDCloud = (() => {
  // 同源在 Vercel → 相對路徑；其餘平台 → 指向 Vercel API
  const API = location.hostname.includes('vercel.app') || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? ''
    : 'https://vocab-duel.vercel.app';

  const LS = { sync: 'vd_synccode', ccode: 'vd_classcode', cname: 'vd_classname' };
  const genCode = () => {
    const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 8; i++) s += c[Math.floor(Math.random() * c.length)];
    return s;
  };

  /* 從 localStorage 直接快照三把鑰匙，最完整、不依賴內部結構 */
  function snapshot() {
    return {
      p: JSON.parse(localStorage.getItem('vd_progress') || '{}'),
      m: JSON.parse(localStorage.getItem('vd_meta') || '{}'),
      g: JSON.parse(localStorage.getItem('vd_game') || '{}'),
    };
  }
  function restore(blob) {
    if (blob.p) localStorage.setItem('vd_progress', JSON.stringify(blob.p));
    if (blob.m) localStorage.setItem('vd_meta', JSON.stringify(blob.m));
    if (blob.g) localStorage.setItem('vd_game', JSON.stringify(blob.g));
  }

  /* 目前戰績摘要（給班級榜） */
  function myStats() {
    const p = JSON.parse(localStorage.getItem('vd_progress') || '{}');
    let mastered = 0;
    for (const w in p) if ((p[w].b || 0) >= 3) mastered++;
    const meta = JSON.parse(localStorage.getItem('vd_meta') || '{}');
    const level = (window.VDGame && VDGame.levelProgress) ? VDGame.levelProgress().L : 1;
    const badges = (window.VDGame && VDGame.badgeCount) ? VDGame.badgeCount().got : 0;
    return { mastered, level, streak: meta.streak || 0, badges };
  }

  async function api(path, opts) {
    const r = await fetch(API + path, opts);
    let body = null;
    try { body = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error((body && body.error) || ('HTTP ' + r.status));
    return body;
  }

  let el = null;
  function render(container) {
    el = container;
    const syncCode = localStorage.getItem(LS.sync) || '';
    const cc = localStorage.getItem(LS.ccode) || '';
    const cn = localStorage.getItem(LS.cname) || '';
    el.innerHTML = `
      <div class="cloud-sec">
        <div class="cloud-h">☁️ 雲端存檔（換手機、換電腦不怕丟進度）</div>
        <p class="cloud-tip">把你的同步碼記起來。在別台裝置輸入同一組碼「下載」，進度就跟過去了。</p>
        <div class="cloud-row">
          <input id="syncIn" class="cloud-input" maxlength="12" placeholder="你的同步碼（8 碼）" value="${syncCode}">
          <button class="btn ghost sm" id="genBtn">產生新碼</button>
        </div>
        <div class="cloud-row">
          <button class="btn" id="upBtn">⬆️ 上傳這台的進度</button>
          <button class="btn ghost" id="downBtn">⬇️ 下載到這台</button>
        </div>
        <div id="syncMsg" class="cloud-msg" aria-live="polite"></div>
      </div>

      <div class="cloud-sec">
        <div class="cloud-h">🏫 班級排行榜（老師派碼、同學一起拚）</div>
        <p class="cloud-tip">老師給一組班級碼，全班輸入同一組。上傳後就能看到全班的已掌握字數排名。</p>
        <div class="cloud-row">
          <input id="ccIn" class="cloud-input" maxlength="16" placeholder="班級碼（老師給）" value="${cc}">
          <input id="cnIn" class="cloud-input" maxlength="12" placeholder="你的名字" value="${cn}">
        </div>
        <div class="cloud-row">
          <button class="btn" id="subBtn">📤 上傳我的戰績</button>
          <button class="btn ghost" id="boardBtn">🏆 看排行榜</button>
        </div>
        <div id="boardMsg" class="cloud-msg" aria-live="polite"></div>
        <div id="boardBox"></div>
      </div>
      <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button>`;

    const msg = (id, t, ok) => { const m = el.querySelector('#' + id); m.textContent = t; m.className = 'cloud-msg ' + (ok ? 'ok' : 'err'); };

    el.querySelector('#genBtn').onclick = () => { el.querySelector('#syncIn').value = genCode(); };

    el.querySelector('#upBtn').onclick = async () => {
      let code = el.querySelector('#syncIn').value.trim();
      if (!/^[A-Za-z0-9]{6,12}$/.test(code)) { code = genCode(); el.querySelector('#syncIn').value = code; }
      localStorage.setItem(LS.sync, code);
      msg('syncMsg', '上傳中…', true);
      try {
        await api('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, blob: snapshot() }) });
        msg('syncMsg', `✅ 已上傳。記住這組碼：${code}`, true);
        if (window.VDSound) VDSound.coin();
      } catch (e) { msg('syncMsg', friendly(e), false); }
    };

    el.querySelector('#downBtn').onclick = async () => {
      const code = el.querySelector('#syncIn').value.trim();
      if (!/^[A-Za-z0-9]{6,12}$/.test(code)) return msg('syncMsg', '請先輸入正確的同步碼', false);
      msg('syncMsg', '下載中…', true);
      try {
        const r = await api('/api/sync?code=' + encodeURIComponent(code), {});
        restore(r.blob);
        localStorage.setItem(LS.sync, code);
        msg('syncMsg', '✅ 已下載，重新整理套用…', true);
        setTimeout(() => location.reload(), 800);
      } catch (e) { msg('syncMsg', e.message === 'no save' ? '這組碼還沒有存檔' : friendly(e), false); }
    };

    el.querySelector('#subBtn').onclick = async () => {
      const code = el.querySelector('#ccIn').value.trim();
      const name = el.querySelector('#cnIn').value.trim();
      if (!code) return msg('boardMsg', '請輸入班級碼', false);
      if (!name) return msg('boardMsg', '請輸入你的名字', false);
      localStorage.setItem(LS.ccode, code); localStorage.setItem(LS.cname, name);
      const s = myStats();
      msg('boardMsg', '上傳中…', true);
      try {
        await api('/api/board', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync', code, name, ...s }) });
        msg('boardMsg', `✅ 已上傳：已掌握 ${s.mastered} 字 · Lv${s.level}`, true);
        loadBoard(code, name);
        if (window.VDSound) VDSound.coin();
      } catch (e) { msg('boardMsg', friendly(e), false); }
    };

    el.querySelector('#boardBtn').onclick = () => {
      const code = el.querySelector('#ccIn').value.trim();
      if (!code) return msg('boardMsg', '請輸入班級碼', false);
      localStorage.setItem(LS.ccode, code);
      loadBoard(code, el.querySelector('#cnIn').value.trim());
    };
  }

  async function loadBoard(code, me) {
    const box = el.querySelector('#boardBox');
    box.innerHTML = '<div class="cloud-msg">載入中…</div>';
    try {
      const r = await api('/api/board?code=' + encodeURIComponent(code), {});
      if (!r.rows.length) { box.innerHTML = '<div class="cloud-msg">這個班級還沒有人上傳，當第一個吧！</div>'; return; }
      const medal = (i) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
      box.innerHTML = `<table class="board-tbl"><thead><tr><th>#</th><th>名字</th><th>已掌握</th><th>等級</th><th>🔥</th></tr></thead><tbody>${
        r.rows.map((x, i) => `<tr class="${x.name === me ? 'me' : ''}"><td>${medal(i)}</td><td>${esc(x.name)}</td><td>${x.mastered}</td><td>Lv${x.level}</td><td>${x.streak}</td></tr>`).join('')
      }</tbody></table>`;
    } catch (e) {
      box.innerHTML = `<div class="cloud-msg err">${friendly(e)}</div>`;
    }
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function friendly(e) {
    const m = String(e && e.message || e);
    if (/Failed to fetch|NetworkError|HTTP 5|500/.test(m)) return '雲端功能建置中（後端金鑰尚未設定），稍後再試。';
    return '出錯了：' + m;
  }

  return { start: render, myStats };
})();
window.VDCloud = VDCloud;
