/* 老師後台：認領班級（班級碼+PIN）→ 發布字表指派（可鎖範圍）→ 追蹤全班完成度與弱字
   無帳號系統：班級碼公開給學生、PIN 只有老師知道（存本機 vd_teach，伺服器端逐 op 驗證） */
const VDTeach = (() => {
  const LS = 'vd_teach';
  const SEATS_LS = 'vd_teach_seats'; // 座號本機標註（後端無座號欄位，僅老師端方便匯出/檢視用）
  let el = null;
  let lastRoster = [];              // 供 CSV 匯出重用，避免重打 /api/board
  let lastWeak = [];                // 供 CSV 匯出重用，避免重打 weakTop
  const detailCache = new Map();    // name → studentDetail 回應，展開過的就不用重抓

  const saved = () => { try { return JSON.parse(localStorage.getItem(LS)) || null; } catch { return null; } };
  const save = (t) => localStorage.setItem(LS, JSON.stringify(t));
  const seats = () => { try { return JSON.parse(localStorage.getItem(SEATS_LS)) || {}; } catch { return {}; } };
  const saveSeat = (name, seat) => { const s = seats(); if (seat) s[name] = seat; else delete s[name]; localStorage.setItem(SEATS_LS, JSON.stringify(s)); };
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cssId = (s) => 'n' + String(s).split('').map(c => c.charCodeAt(0).toString(36)).join('');
  const api = (body) => VDCloud.api('/api/class', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const msg = (id, t, ok) => { const m = el.querySelector('#' + id); if (m) { m.textContent = t; m.className = 'cloud-msg ' + (ok ? 'ok' : 'err'); } };

  /* CSV 下載（含 BOM 供 Excel 正確顯示中文），欄位以逗號分隔、必要時加引號跳脫 */
  function downloadCSV(filename, header, rows) {
    const cell = (v) => { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = '﻿' + [header, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function render(container) {
    el = container;
    const t = saved();
    if (!t) return renderLogin();
    renderPanel(t);
  }

  function renderLogin() {
    el.innerHTML = `
      <div class="cloud-sec">
        <div class="cloud-h">🧑‍🏫 認領班級</div>
        <p class="cloud-tip">設一組班級碼（給學生輸入的那組）＋一組只有你知道的 PIN。已認領過的班級直接輸入同一組登入。</p>
        <div class="cloud-row">
          <input id="tCode" class="cloud-input" maxlength="16" placeholder="班級碼（2–16 中英數字）">
          <input id="tPin" class="cloud-input" maxlength="8" inputmode="numeric" placeholder="PIN（4–8 位數字）">
        </div>
        <div class="cloud-row">
          <input id="tName" class="cloud-input" maxlength="20" placeholder="班級名稱（例：805 英文）">
        </div>
        <div class="cloud-row">
          <button class="btn" id="tClaim">🆕 認領新班級</button>
          <button class="btn ghost" id="tLogin">已有班級，直接登入</button>
        </div>
        <div id="tMsg" class="cloud-msg" aria-live="polite"></div>
      </div>
      <button class="btn ghost" onclick="VDApp.go('cloud')">← 回雲端頁</button>`;
    const read = () => ({ code: el.querySelector('#tCode').value.trim(), pin: el.querySelector('#tPin').value.trim(), name: el.querySelector('#tName').value.trim() });
    el.querySelector('#tClaim').onclick = async () => {
      const { code, pin, name } = read();
      if (!code || !pin || !name) return msg('tMsg', '班級碼、PIN、名稱都要填', false);
      msg('tMsg', '認領中…', true);
      try {
        const r = await api({ op: 'claim', code, pin, name });
        if (!r.ok) return msg('tMsg', r.error, false);
        save({ code, pin, name: r.name });
        render(el);
      } catch (e) { msg('tMsg', '出錯了：' + e.message, false); }
    };
    el.querySelector('#tLogin').onclick = async () => {
      const { code, pin } = read();
      if (!code || !pin) return msg('tMsg', '請輸入班級碼與 PIN', false);
      msg('tMsg', '驗證中…', true);
      try {
        // 用 weakTop（pin 驗證的最輕 op）確認 PIN 正確再存本機
        const r = await api({ op: 'weakTop', code, pin });
        if (!r.ok) return msg('tMsg', r.error, false);
        const g = await api({ op: 'get', code });
        save({ code, pin, name: (g.ok && g.name) || code });
        render(el);
      } catch (e) { msg('tMsg', '出錯了：' + e.message, false); }
    };
  }

  function renderPanel(t) {
    el.innerHTML = `
      <div class="cloud-sec">
        <div class="cloud-h">🏫 ${esc(t.name)}（班級碼：${esc(t.code)}）</div>
        <p class="cloud-tip">學生在「雲端／班級榜」輸入這組班級碼＋暱稱，上傳戰績後就會出現在名冊。</p>
        <button class="btn ghost sm" id="tLogout">登出／換班級</button>
      </div>

      <div class="cloud-sec">
        <div class="cloud-h">📋 發布字表指派</div>
        <div class="cloud-row"><input id="aName" class="cloud-input" maxlength="20" placeholder="指派名稱（例：第五課單字）"></div>
        <p class="cloud-tip">字表來源二選一：貼上單字清單（一行一個英文字），或用學段快速選字。</p>
        <textarea id="aWords" class="cloud-input" rows="4" style="width:100%" placeholder="apple&#10;banana&#10;…（一行一個英文字）"></textarea>
        <div class="cloud-row">
          <select id="aRange" class="cloud-input">
            <option value="">— 或從學段選字 —</option>
            <option value="E">國小 1200</option>
            <option value="J">國中 2000（含國小）</option>
            <option value="S1">高中 L1</option><option value="S2">高中 L2</option><option value="S3">高中 L3</option>
            <option value="S4">高中 L4</option><option value="S5">高中 L5</option><option value="S6">高中 L6</option>
          </select>
          <input id="aCount" class="cloud-input" type="number" min="8" max="200" value="20" title="選字數量">
          <button class="btn ghost sm" id="aFill">帶入</button>
        </div>
        <div class="cloud-row">
          <input id="aDue" class="cloud-input" type="date" title="截止日（選填）">
          <label class="cloud-tip" style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="aLock">鎖定練習範圍（截止日前學生只練這份字表）</label>
        </div>
        <div class="cloud-row"><button class="btn" id="aPost">📤 發布指派</button></div>
        <div id="aMsg" class="cloud-msg" aria-live="polite"></div>
        <div id="aList"></div>
      </div>

      <div class="cloud-sec">
        <div class="cloud-h">👀 全班名冊與完成度</div>
        <p class="cloud-tip">點「展開」看個人弱字與作答明細（若學生尚未上傳個人彙報，會顯示「該生尚未同步」）；座號欄純本機標註，只影響 CSV 匯出，不會上傳雲端。</p>
        <div class="cloud-row">
          <button class="btn ghost" id="rLoad">🔄 重新整理名冊</button>
          <button class="btn ghost sm" id="rExport">📥 匯出 CSV</button>
        </div>
        <div id="rBox"></div>
      </div>

      <div class="cloud-sec">
        <div class="cloud-h">🩺 全班弱字 Top 20</div>
        <p class="cloud-tip">學生答錯的字會自動匿名彙整到這裡（每人約 5 分鐘同步一批）。</p>
        <div class="cloud-row">
          <button class="btn ghost" id="wLoad">🔄 重新整理弱字</button>
          <button class="btn ghost sm" id="wExport">📥 匯出 CSV</button>
        </div>
        <div id="wBox"></div>
      </div>

      <div class="cloud-sec">
        <div class="cloud-h">📡 隨堂考</div>
        <div id="liveBox"><p class="cloud-tip">全班同步搶答（建議每週 ≤5 場，珍惜雲端額度）。</p></div>
      </div>
      <button class="btn ghost" onclick="VDApp.go('cloud')">← 回雲端頁</button>`;

    el.querySelector('#tLogout').onclick = () => { localStorage.removeItem(LS); render(el); };

    /* 學段快速選字：優先取「還沒被指派過」不重要，簡單取字母序前 N 個 */
    el.querySelector('#aFill').onclick = () => {
      const lv = el.querySelector('#aRange').value;
      if (!lv) return;
      const n = Math.max(8, Math.min(200, +el.querySelector('#aCount').value || 20));
      const ws = VDApp.words().filter(w => lv === 'E' ? w.level === 'E' : lv === 'J' ? (w.level === 'E' || w.level === 'J') : w.level === lv);
      el.querySelector('#aWords').value = ws.slice(0, n).map(w => w.word).join('\n');
    };

    el.querySelector('#aPost').onclick = async () => {
      const name = el.querySelector('#aName').value.trim();
      if (!name) return msg('aMsg', '請填指派名稱', false);
      const dict = new Map(VDApp.words().map(w => [w.word.toLowerCase(), w.word]));
      const lines = el.querySelector('#aWords').value.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean);
      const hit = [...new Set(lines)].filter(w => dict.has(w));
      const missN = new Set(lines).size - hit.length;
      if (hit.length < 1) return msg('aMsg', '沒有任何字在字庫裡，請確認清單', false);
      if (hit.length < 8 && el.querySelector('#aLock').checked) return msg('aMsg', '鎖定範圍至少需要 8 個字（太少會出不了誘答選項）', false);
      const asg = {
        id: Math.random().toString(36).slice(2, 8),
        name,
        words: hit.slice(0, 200),
        module: '',
        due: el.querySelector('#aDue').value || '',
        lock: el.querySelector('#aLock').checked ? 1 : 0,
      };
      msg('aMsg', '發布中…', true);
      try {
        const r = await api({ op: 'setAsg', code: t.code, pin: t.pin, asg });
        if (!r.ok) return msg('aMsg', r.error, false);
        msg('aMsg', `✅ 已發布「${name}」共 ${asg.words.length} 字${missN ? `（${missN} 字不在字庫已略過）` : ''}——學生明天前會自動收到`, true);
        listAsgs(t, r.asgs);
      } catch (e) { msg('aMsg', '出錯了：' + e.message, false); }
    };

    el.querySelector('#rLoad').onclick = () => loadRoster(t);
    el.querySelector('#rExport').onclick = () => exportRosterCSV(t);
    el.querySelector('#wExport').onclick = () => exportWeakCSV();
    el.querySelector('#wLoad').onclick = () => loadWeak(t);
    loadAsgs(t);
    loadRoster(t);
    loadWeak(t);
    if (window.VDLive && VDLive.teacherPanel) VDLive.teacherPanel(el.querySelector('#liveBox'), t);
  }

  async function loadAsgs(t) {
    try {
      const r = await api({ op: 'get', code: t.code });
      if (r.ok) listAsgs(t, r.asgs);
    } catch (_) { /* 靜默 */ }
  }
  function listAsgs(t, asgs) {
    const box = el.querySelector('#aList');
    if (!box) return;
    box.innerHTML = (asgs || []).length ? asgs.map(a => `
      <div class="qw-row">
        <div class="qw-word">${esc(a.name)} <span class="cloud-tag">${a.words.length} 字</span>
          ${a.lock ? '<span class="cloud-tag">🔒 鎖範圍</span>' : ''}${a.due ? `<span class="cloud-tag">⏰ ${a.due}</span>` : ''}</div>
        <div class="qw-sentence">${a.words.slice(0, 12).join(', ')}${a.words.length > 12 ? ' …' : ''}</div>
        <button class="btn ghost sm" data-del="${a.id}">刪除</button>
      </div>`).join('') : '<div class="cloud-msg">還沒有指派</div>';
    box.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = async () => {
        if (!confirm('確定刪除這份指派？')) return;
        try {
          const r = await api({ op: 'delAsg', code: t.code, pin: t.pin, id: b.dataset.del });
          if (r.ok) listAsgs(t, r.asgs);
        } catch (_) { /* 靜默 */ }
      };
    });
  }

  async function loadRoster(t) {
    const box = el.querySelector('#rBox');
    box.innerHTML = '<div class="cloud-msg">載入中…</div>';
    try {
      const r = await VDCloud.api('/api/board?code=' + encodeURIComponent(t.code), {});
      const rows = r.rows || [];
      lastRoster = rows;
      detailCache.clear();
      if (!rows.length) { box.innerHTML = '<div class="cloud-msg">還沒有學生上傳戰績</div>'; return; }
      const day = (ts) => ts ? new Date(ts).toLocaleDateString('sv-SE').slice(5) : '—';
      const sm = seats();
      box.innerHTML = `<table class="board-tbl">
        <thead><tr><th>座號</th><th>名字</th><th>已掌握</th><th>🔥</th><th>指派進度</th><th>最後同步</th><th>操作</th></tr></thead>
        <tbody>${rows.map(x => `<tr>
          <td><input class="cloud-input sm-seat" style="width:52px" data-seat="${esc(x.name)}" value="${esc(sm[x.name] || '')}" placeholder="座號"></td>
          <td>${esc(x.name)}</td><td>${x.mastered}</td><td>${x.streak}</td>
          <td>${x.assign ? `📋 ${x.assign.done}/${x.assign.total}` : '—'}</td>
          <td>${day(x.ts)}</td>
          <td><button class="btn ghost sm" data-expand="${esc(x.name)}">展開</button></td></tr>
        <tr class="qw-detail-row" data-detail="${esc(x.name)}" style="display:none"><td colspan="7"></td></tr>`).join('')}</tbody></table>
        <div class="pg-hint">共 ${rows.length} 人・指派進度＝學生最近一份指派的完成字數（熟悉度達第 1 盒）</div>`;
      box.querySelectorAll('[data-seat]').forEach(inp => {
        inp.onchange = () => saveSeat(inp.dataset.seat, inp.value.trim());
      });
      box.querySelectorAll('[data-expand]').forEach(b => {
        b.onclick = () => {
          const name = b.dataset.expand;
          const row = box.querySelector(`tr[data-detail="${CSS.escape(name)}"]`);
          if (!row) return;
          const opening = row.style.display === 'none';
          row.style.display = opening ? '' : 'none';
          b.textContent = opening ? '收合' : '展開';
          if (opening) renderDetail(t, name, row.querySelector('td'));
        };
      });
    } catch (e) {
      box.innerHTML = `<div class="cloud-msg err">載入失敗：${esc(e.message)}</div>`;
    }
  }

  /* 展開列：個人弱字 Top＋近期指派逐字對錯（資料尚未同步就顯示提示，不當作失敗）＋ IEP 個別調節表單 */
  async function renderDetail(t, name, cell) {
    cell.innerHTML = '<div class="cloud-msg">載入中…</div>';
    let detail = { synced: false, weak: [], logs: [], durable: null, learning: null };
    try {
      const r = await api({ op: 'studentDetail', code: t.code, pin: t.pin, name });
      if (r.ok) detail = r;
    } catch (_) { /* 靜默：detail 保持預設「尚未同步」樣式 */ }
    detailCache.set(name, detail);
    let acc = { extraTime: 1, maxItems: null, noTimer: false, bigFont: false, hideEconomy: false };
    try {
      const ra = await api({ op: 'getAcc', code: t.code, name });
      if (ra.ok && ra.acc) acc = ra.acc;
    } catch (_) { /* 靜默：套用預設值 */ }
    const id = cssId(name);
    cell.innerHTML = `
      <div class="qw-row">
        <div class="qw-word">🩺 個人弱字${detail.durable != null ? `　已鞏固 ${detail.durable}・複習中 ${detail.learning}` : ''}</div>
        ${detail.synced ? `
          <div class="qw-sentence">${(detail.weak || []).length ? detail.weak.slice(0, 15).map(w => `${esc(w.word)}(${w.n})`).join('、') : '目前沒有弱字'}</div>
          ${detail.logs.length ? `<div class="pg-hint">近期指派：${detail.logs.map(l => {
            const vals = Object.values(l.results); const okN = vals.filter(v => v).length;
            return `${esc(l.asgId)} ${okN}/${vals.length} 對`;
          }).join('・')}</div>` : ''}
        ` : '<div class="cloud-msg">該生尚未同步個別弱字資料</div>'}
      </div>
      <div class="qw-row">
        <div class="qw-word">⚙️ 個別調節（依暱稱套用，學生端下次同步生效）</div>
        <div class="cloud-row">
          <select class="cloud-input" id="accTime-${id}">
            <option value="1">正常時間</option><option value="1.5">1.5 倍時間</option><option value="2">2 倍時間</option>
          </select>
          <input class="cloud-input" id="accMax-${id}" type="number" min="1" max="200" placeholder="單次題數上限（空＝不限）">
        </div>
        <div class="cloud-row">
          <label class="cloud-tip" style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="accNoTimer-${id}">強制關計時</label>
          <label class="cloud-tip" style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="accBig-${id}">預設大字級</label>
          <label class="cloud-tip" style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="accHide-${id}">隱藏經濟層（商店/寵物/市場）</label>
        </div>
        <div class="cloud-row"><button class="btn ghost sm" id="accSave-${id}">💾 儲存調節</button></div>
        <div class="cloud-msg" id="accMsg-${id}" aria-live="polite"></div>
      </div>`;
    cell.querySelector(`#accTime-${id}`).value = String(acc.extraTime || 1);
    if (acc.maxItems) cell.querySelector(`#accMax-${id}`).value = acc.maxItems;
    cell.querySelector(`#accNoTimer-${id}`).checked = !!acc.noTimer;
    cell.querySelector(`#accBig-${id}`).checked = !!acc.bigFont;
    cell.querySelector(`#accHide-${id}`).checked = !!acc.hideEconomy;
    cell.querySelector(`#accSave-${id}`).onclick = async () => {
      const m = cell.querySelector(`#accMsg-${id}`);
      const newAcc = {
        extraTime: Number(cell.querySelector(`#accTime-${id}`).value) || 1,
        maxItems: cell.querySelector(`#accMax-${id}`).value ? +cell.querySelector(`#accMax-${id}`).value : null,
        noTimer: cell.querySelector(`#accNoTimer-${id}`).checked,
        bigFont: cell.querySelector(`#accBig-${id}`).checked,
        hideEconomy: cell.querySelector(`#accHide-${id}`).checked,
      };
      m.textContent = '儲存中…'; m.className = 'cloud-msg ok';
      try {
        const r = await api({ op: 'setAcc', code: t.code, pin: t.pin, name, acc: newAcc });
        if (!r.ok) { m.textContent = r.error; m.className = 'cloud-msg err'; return; }
        m.textContent = '✅ 已儲存，該生下次同步生效'; m.className = 'cloud-msg ok';
      } catch (e) { m.textContent = '出錯了：' + e.message; m.className = 'cloud-msg err'; }
    };
  }

  /* 名冊 CSV：座號/暱稱/已鞏固字數/複習中字數/指派完成度/個人弱字清單；展開過的用快取，沒展開過就補抓一次 */
  async function exportRosterCSV(t) {
    if (!lastRoster.length) return;
    const sm = seats();
    const header = ['座號', '暱稱', '已鞏固字數', '複習中字數', '指派完成度', '個人弱字清單'];
    const rows = [];
    for (const x of lastRoster) {
      let d = detailCache.get(x.name);
      if (!d) {
        try {
          const r = await api({ op: 'studentDetail', code: t.code, pin: t.pin, name: x.name });
          d = r.ok ? r : { synced: false, weak: [], durable: null, learning: null };
          detailCache.set(x.name, d);
        } catch (_) { d = { synced: false, weak: [], durable: null, learning: null }; }
      }
      rows.push([
        sm[x.name] || '',
        x.name,
        d.durable != null ? d.durable : '',
        d.learning != null ? d.learning : '',
        x.assign ? `${x.assign.done}/${x.assign.total}` : '',
        (d.weak || []).map(w => w.word).join('；'),
      ]);
    }
    downloadCSV(`名冊_${saved().code}_${new Date().toLocaleDateString('sv-SE')}.csv`, header, rows);
  }

  /* 弱字 CSV：排名/單字/意思/全班錯誤次數 */
  function exportWeakCSV() {
    if (!lastWeak.length) return;
    const zh = new Map(VDApp.words().map(w => [w.word.toLowerCase(), w.zh]));
    const header = ['排名', '單字', '意思', '全班錯誤次數'];
    const rows = lastWeak.map((x, i) => [i + 1, x.word, zh.get(x.word) || '', x.n]);
    downloadCSV(`弱字_${new Date().toLocaleDateString('sv-SE')}.csv`, header, rows);
  }

  async function loadWeak(t) {
    const box = el.querySelector('#wBox');
    box.innerHTML = '<div class="cloud-msg">載入中…</div>';
    try {
      const r = await api({ op: 'weakTop', code: t.code, pin: t.pin });
      if (!r.ok) { box.innerHTML = `<div class="cloud-msg err">${esc(r.error)}</div>`; return; }
      const list = (r.list || []).slice(0, 20);
      lastWeak = list;
      if (!list.length) { box.innerHTML = '<div class="cloud-msg">還沒有弱字資料——學生開始答題後就會出現</div>'; return; }
      const zh = new Map(VDApp.words().map(w => [w.word.toLowerCase(), w.zh]));
      box.innerHTML = `<table class="board-tbl">
        <thead><tr><th>#</th><th>單字</th><th>意思</th><th>全班錯誤次數</th></tr></thead>
        <tbody>${list.map((x, i) => `<tr><td>${i + 1}</td><td><b>${esc(x.word)}</b></td><td>${esc(zh.get(x.word) || '—')}</td><td>${x.n}</td></tr>`).join('')}</tbody></table>
        <button class="btn ghost sm" id="wToAsg">📋 把這 ${list.length} 個字做成指派</button>`;
      el.querySelector('#wToAsg').onclick = () => {
        el.querySelector('#aWords').value = list.map(x => x.word).join('\n');
        el.querySelector('#aName').value = '全班弱字補強';
        el.querySelector('#aName').scrollIntoView({ behavior: 'smooth' });
      };
    } catch (e) {
      box.innerHTML = `<div class="cloud-msg err">載入失敗：${esc(e.message)}</div>`;
    }
  }

  return { start: render };
})();
window.VDTeach = VDTeach;
