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

  /* 從 localStorage 直接快照六把鑰匙（進度／統計／遊戲＋詞靈／城鎮／市場掛單），不依賴內部結構。
     總量評估：town 上限 60KB、pets 通常 <20KB，遠低於後端 512KB 上限，安全 */
  function snapshot() {
    const ls = (k) => { try { return JSON.parse(localStorage.getItem(k)) || null; } catch { return null; } };
    return {
      p: ls('vd_progress') || {},
      m: ls('vd_meta') || {},
      g: ls('vd_game') || {},
      pe: ls('vd_pets'),
      t: ls('vd_town'),
      mc: ls('vd_market_claims'),
    };
  }
  function restore(blob) {
    if (blob.p) localStorage.setItem('vd_progress', JSON.stringify(blob.p));
    if (blob.m) localStorage.setItem('vd_meta', JSON.stringify(blob.m));
    if (blob.g) localStorage.setItem('vd_game', JSON.stringify(blob.g));
    // 舊格式存檔沒有這三鍵——有才還原，沒有就保留本機現況（容錯）
    if (blob.pe) localStorage.setItem('vd_pets', JSON.stringify(blob.pe));
    if (blob.t) localStorage.setItem('vd_town', JSON.stringify(blob.t));
    if (blob.mc) localStorage.setItem('vd_market_claims', JSON.stringify(blob.mc));
  }

  /* 目前戰績摘要（給班級榜） */
  function myStats() {
    const p = JSON.parse(localStorage.getItem('vd_progress') || '{}');
    let mastered = 0;
    for (const w in p) if ((p[w].b || 0) >= 3) mastered++;
    const meta = JSON.parse(localStorage.getItem('vd_meta') || '{}');
    const level = (window.VDGame && VDGame.levelProgress) ? VDGame.levelProgress().L : 1;
    const badges = (window.VDGame && VDGame.badgeCount) ? VDGame.badgeCount().got : 0;
    // 本週新掌握字數：由 VDStore.weekMastered() 提供（別組實作）；沒有就傳 0
    const weekMastered = (window.VDStore && typeof VDStore.weekMastered === 'function') ? (VDStore.weekMastered() || 0) : 0;
    // 目前作用中字表指派完成進度：{code,name,done,total} 或 null；供班級榜顯示「本週指派」小徽章
    const assign = (window.VDStore && typeof VDStore.activeAssignmentProgress === 'function') ? VDStore.activeAssignmentProgress() : null;
    return { mastered, level, streak: meta.streak || 0, badges, weekMastered, assign };
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
        <p class="cloud-tip">把你的同步碼記起來。在別台裝置輸入同一組碼「下載」，進度就跟過去了。上傳內容包含單字進度、字幣裝備，也含詞靈與城鎮。</p>
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
          <input id="cnIn" class="cloud-input" maxlength="12" placeholder="你的暱稱（勿用真名）" value="${cn}">
        </div>
        <p class="cloud-tip">⚠️ 排行榜全班都看得到——暱稱請勿使用真實姓名，用綽號、座號或代號就好。</p>
        <div class="cloud-row">
          <button class="btn" id="subBtn">📤 上傳我的戰績</button>
          <button class="btn ghost" id="boardBtn">🏆 看排行榜</button>
        </div>
        <div id="boardMsg" class="cloud-msg" aria-live="polite"></div>
        <div id="boardBox"></div>
      </div>

      <div class="cloud-sec">
        <div class="cloud-h">📝 班級語錄牆（分享你的自編例句／助記口訣）</div>
        <p class="cloud-tip">用同一組班級碼，把你記單字的小訣竅公開分享給同學——不是只有分數能被看見。</p>
        <div class="cloud-row">
          <input id="qwWord" class="cloud-input" maxlength="20" placeholder="單字（例：resilient）">
        </div>
        <div class="cloud-row">
          <input id="qwSentence" class="cloud-input" maxlength="60" placeholder="你的例句或助記口訣（最長 60 字）">
        </div>
        <div class="cloud-row">
          <button class="btn" id="qwPostBtn">📤 發布語錄</button>
          <button class="btn ghost" id="qwLoadBtn">🔄 重新整理</button>
        </div>
        <div id="qwMsg" class="cloud-msg" aria-live="polite"></div>
        <div id="qwBox"></div>
      </div>
      <div class="cloud-sec">
        <div class="cloud-h">🧑‍🏫 我是老師</div>
        <p class="cloud-tip">認領班級碼、發布字表指派、追蹤全班完成度與弱字。</p>
        <button class="btn ghost" onclick="VDApp.go('teach')">進入老師後台</button>
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
        msg('syncMsg', `✅ 已上傳（含詞靈與城鎮）。記住這組碼：${code}`, true);
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

    el.querySelector('#qwPostBtn').onclick = async () => {
      const code = el.querySelector('#ccIn').value.trim();
      const nick = el.querySelector('#cnIn').value.trim();
      const word = el.querySelector('#qwWord').value.trim();
      const sentence = el.querySelector('#qwSentence').value.trim();
      if (!code) return msg('qwMsg', '請先在上方填班級碼', false);
      if (!nick) return msg('qwMsg', '請先在上方填你的暱稱', false);
      if (!word || !sentence) return msg('qwMsg', '單字和例句／口訣都要填喔', false);
      msg('qwMsg', '發布中…', true);
      try {
        await api('/api/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'post', code, nick, word, sentence }) });
        msg('qwMsg', '✅ 已發布！', true);
        el.querySelector('#qwWord').value = ''; el.querySelector('#qwSentence').value = '';
        if (window.VDSound) VDSound.coin();
        loadQuotes(code);
      } catch (e) { msg('qwMsg', friendly(e), false); }
    };
    el.querySelector('#qwLoadBtn').onclick = () => {
      const code = el.querySelector('#ccIn').value.trim();
      if (!code) return msg('qwMsg', '請先在上方填班級碼', false);
      loadQuotes(code);
    };
    if (cc) loadQuotes(cc);
  }

  /* 語錄牆列表：最新在前 */
  async function loadQuotes(code) {
    const box = el.querySelector('#qwBox');
    box.innerHTML = '<div class="cloud-msg">載入中…</div>';
    try {
      const r = await api('/api/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'list', code }) });
      const list = r.list || [];
      box.innerHTML = list.length
        ? `<div class="qw-list">${list.map(q => `
          <div class="qw-row">
            <div class="qw-word">${esc(q.word)}</div>
            <div class="qw-sentence">${esc(q.sentence)}</div>
            <div class="qw-nick">— ${esc(q.nick)}</div>
          </div>`).join('')}</div>`
        : '<div class="cloud-msg">還沒有人分享語錄，當第一個吧！</div>';
    } catch (e) {
      box.innerHTML = `<div class="cloud-msg err">${friendly(e)}</div>`;
    }
  }

  /* 班級榜三 tab：🏆 總量／⚡ 本週進步（weekMastered）／🔥 連續天數
     預設只展示前 3 名＋我的名次 ±2，其餘收在「展開全部」 */
  let boardSort = 'total';
  let boardExpand = false;
  async function loadBoard(code, me) {
    const box = el.querySelector('#boardBox');
    box.innerHTML = '<div class="cloud-msg">載入中…</div>';
    // 安心模式：不顯示名次表，只顯示自己的數字＋全班參與人數＋自我基準卡
    if (calm()) {
      try {
        const r = await api('/api/board?code=' + encodeURIComponent(code), {});
        const rows = r.rows || [];
        const mine = rows.find(x => x.name === me);
        box.innerHTML = `
          <div class="cloud-msg ok">🕊️ 安心模式開啟中——只跟自己比</div>
          ${mine ? `<div class="pg-hint">你目前：已掌握 <b>${mine.mastered}</b> 字・Lv${mine.level}・🔥 ${mine.streak} 天</div>` : ''}
          <div class="pg-hint">全班已有 <b>${rows.length}</b> 人上傳戰績</div>
          ${(window.VDStats && VDStats.selfCard) ? VDStats.selfCard() : ''}
          <div class="pg-hint">想看排名？到「英雄檔案 → 設定」關閉安心模式。</div>`;
      } catch (e) {
        box.innerHTML = `<div class="cloud-msg err">${friendly(e)}</div>`;
      }
      return;
    }
    try {
      const r = await api('/api/board?code=' + encodeURIComponent(code) + (boardSort === 'week' ? '&sort=week' : ''), {});
      let rows = r.rows || [];
      if (boardSort === 'streak') rows = rows.slice().sort((a, b) => (b.streak || 0) - (a.streak || 0) || b.mastered - a.mastered);
      const tab = (id, label) => `<button class="btn sm ${boardSort === id ? '' : 'ghost'}" data-btab="${id}">${label}</button>`;
      const tabs = `<div class="cloud-row">${tab('total', '🏆 總量榜')}${tab('week', '⚡ 本週進步榜')}${tab('streak', '🔥 連續天數榜')}</div>`;
      if (!rows.length) { box.innerHTML = tabs + '<div class="cloud-msg">這個班級還沒有人上傳，當第一個吧！</div>'; bindTabs(box, code, me); return; }
      const medal = (i) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
      const val = (x) => boardSort === 'week' ? (x.weekMastered || 0) : boardSort === 'streak' ? (x.streak || 0) : x.mastered;
      const mainTh = boardSort === 'week' ? '本週+' : boardSort === 'streak' ? '連續天' : '已掌握';
      // 決定要顯示哪些列：前 3 ＋ 我的名次 ±2；展開時全部
      const myIdx = rows.findIndex((x) => x.name === me);
      const show = new Set();
      if (boardExpand) rows.forEach((_, i) => show.add(i));
      else {
        [0, 1, 2].forEach((i) => i < rows.length && show.add(i));
        if (myIdx >= 0) for (let i = myIdx - 2; i <= myIdx + 2; i++) if (i >= 0 && i < rows.length) show.add(i);
      }
      let body = '', lastShown = -1;
      rows.forEach((x, i) => {
        if (!show.has(i)) return;
        if (i !== lastShown + 1) body += `<tr><td colspan="5" style="text-align:center;opacity:.5">⋯</td></tr>`;
        const asg = x.assign ? `<span class="cloud-tag" title="${esc(x.assign.name)}">📋 ${x.assign.done}/${x.assign.total}</span>` : '';
        body += `<tr class="${x.name === me ? 'me' : ''}"><td>${medal(i)}</td><td>${esc(x.name)}${asg}</td><td>${val(x)}</td><td>Lv${x.level}</td><td>${x.streak}</td></tr>`;
        lastShown = i;
      });
      const hidden = rows.length - show.size;
      box.innerHTML = `${tabs}
        <table class="board-tbl"><thead><tr><th>#</th><th>名字</th><th>${mainTh}</th><th>等級</th><th>🔥</th></tr></thead><tbody>${body}</tbody></table>
        ${hidden > 0 ? `<button class="btn ghost sm" id="boardExpBtn">展開全部（還有 ${hidden} 位）</button>` : ''}
        ${boardExpand && rows.length > 5 ? '<button class="btn ghost sm" id="boardColBtn">收合</button>' : ''}
        <div class="pg-hint">覺得排名有壓力？到「英雄檔案 → 設定」開啟 🕊️ 安心模式，只跟自己比。</div>`;
      bindTabs(box, code, me);
      const ex = box.querySelector('#boardExpBtn');
      if (ex) ex.onclick = () => { boardExpand = true; loadBoard(code, me); };
      const col = box.querySelector('#boardColBtn');
      if (col) col.onclick = () => { boardExpand = false; loadBoard(code, me); };
    } catch (e) {
      box.innerHTML = `<div class="cloud-msg err">${friendly(e)}</div>`;
    }
  }
  function bindTabs(box, code, me) {
    box.querySelectorAll('[data-btab]').forEach((b) => {
      b.onclick = () => { boardSort = b.dataset.btab; boardExpand = false; loadBoard(code, me); };
    });
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function friendly(e) {
    const m = String(e && e.message || e);
    if (/Failed to fetch|NetworkError|HTTP 5|500/.test(m)) return '雲端功能建置中（後端金鑰尚未設定），稍後再試。';
    return '出錯了：' + m;
  }

  /* 安心模式：隱藏排名比較，只跟自己比（display filter，資料照常上傳） */
  const calm = () => localStorage.getItem('vd_calm') === '1';

  /* 學生端自動領取老師指派：每天最多抓一次班級指派清單，字典比對後存進 VDStore；
     有 lock:1 且未過截止日的指派 → 設定範圍鎖 */
  async function fetchAssignments() {
    const cc = localStorage.getItem(LS.ccode);
    if (!cc) return;
    const day = new Date().toLocaleDateString('sv-SE');
    if (localStorage.getItem('vd_asg_day') === day) return;
    localStorage.setItem('vd_asg_day', day); // 先記日期：失敗也不重試轟炸，明天再來
    try {
      const r = await api('/api/class', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'get', code: cc }) });
      if (!r.ok || !Array.isArray(r.asgs)) return;
      const dict = new Map(VDApp.words().map(w => [w.word.toLowerCase(), w.word]));
      const today = day;
      let lockCode = null;
      for (const a of r.asgs) {
        const hit = a.words.map(lw => dict.get(lw)).filter(Boolean);
        if (!hit.length) continue;
        hit.forEach(w => VDStore.enroll(w));
        VDStore.addAssignment(a.id, a.name, hit, { due: a.due || '', lock: a.lock || 0, ts: a.ts });
        if (a.lock && (!a.due || today <= a.due)) lockCode = a.id;
      }
      if (lockCode && VDStore.lockAsg() !== lockCode) {
        VDStore.setLockAsg(lockCode);
        if (window.VDGame && VDGame.toast) VDGame.toast('📋 老師發布了新的指派範圍');
      }
    } catch (_) { /* 靜默，明天再抓 */ }
  }

  /* 班級弱字佇列上傳：store.js 答錯時累積在 vd_weakq，這裡批次送出（成功才清空） */
  async function flushWeak() {
    const cc = localStorage.getItem(LS.ccode);
    if (!cc) return;
    let q;
    try { q = JSON.parse(localStorage.getItem('vd_weakq') || '{}'); } catch { q = {}; }
    const entries = Object.entries(q);
    if (!entries.length) return;
    const words = Object.fromEntries(entries.slice(0, 50));
    try {
      const r = await api('/api/class', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'weakReport', code: cc, words }) });
      if (r.ok) localStorage.removeItem('vd_weakq');
    } catch (_) { /* 靜默，佇列留著下次再送 */ }
  }

  /* 自動上傳：存過班級碼／同步碼的玩家，返回主選單時自動備份（debounce ≥5 分鐘）
     失敗一律靜默；成功 toast 一天最多提示一次 */
  const AUTO_GAP = 5 * 60 * 1000;
  async function autoSync() {
    const now = Date.now();
    if (now - (+localStorage.getItem('vd_autoup_ts') || 0) < AUTO_GAP) return;
    fetchAssignments(); // 每日一次領老師指派（自帶日期戳，不受 5 分鐘節流影響頻率）
    flushWeak();        // 批次上傳錯字統計（佇列空就直接跳過）
    const sync = localStorage.getItem(LS.sync);
    const cc = localStorage.getItem(LS.ccode);
    const cn = localStorage.getItem(LS.cname);
    if (!sync && !(cc && cn)) return;
    localStorage.setItem('vd_autoup_ts', String(now)); // 先記時間，避免重複觸發
    let okAny = false;
    if (cc && cn) {
      try {
        await api('/api/board', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync', code: cc, name: cn, ...myStats() }) });
        okAny = true;
      } catch (_) { /* 靜默 */ }
    }
    if (sync) {
      try {
        await api('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: sync, blob: snapshot() }) });
        okAny = true;
      } catch (_) { /* 靜默 */ }
    }
    if (okAny) {
      const day = new Date().toLocaleDateString('sv-SE');
      if (localStorage.getItem('vd_autoup_day') !== day) {
        localStorage.setItem('vd_autoup_day', day);
        if (window.VDGame && VDGame.toast) VDGame.toast('☁️ 進度已自動備份');
      }
    }
  }
  // 掛在 VDApp.go 上：答題結算按「回主選單」時觸發（cloud.js 先於 app.js 載入，等 DOM ready 再包）
  document.addEventListener('DOMContentLoaded', () => {
    if (!window.VDApp || typeof VDApp.go !== 'function') return;
    const orig = VDApp.go;
    VDApp.go = function (name) { const r = orig.apply(this, arguments); if (name === 'menu') setTimeout(autoSync, 400); return r; };
  });

  return { start: render, myStats, autoSync, fetchAssignments, calm, api, API };
})();
window.VDCloud = VDCloud;
