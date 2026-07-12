/* 單字回報：發音／解釋有問題時，一鍵送到老師 Telegram。跟 VDCloud 走同一組 API 網址判斷 */
const VDReport = (() => {
  const API = location.hostname.includes('vercel.app') || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? '' : 'https://vocab-duel.vercel.app';
  const esc = (s) => (window.VDGame && VDGame.esc) ? VDGame.esc(s) : String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* 產生一顆回報鈕，緊跟在發音鈕旁 */
  function btn(text) {
    if (!text) return '';
    return `<button class="rpt-btn" data-w="${encodeURIComponent(text)}"
      onclick="event.stopPropagation();VDReport.open(decodeURIComponent(this.dataset.w))"
      aria-label="回報這個單字的發音或解釋有問題" title="回報錯誤">🚩</button>`;
  }

  function open(word) {
    document.querySelectorAll('.rpt-modal').forEach(m => m.remove());
    const box = document.createElement('div');
    box.className = 'av-modal rpt-modal';
    box.innerHTML = `<div class="av-panel" role="dialog" aria-modal="true">
      <div class="av-title">🚩 回報錯誤</div>
      <p style="text-align:center;margin-bottom:10px">單字／內容：<b>${esc(word)}</b></p>
      <select id="rptKind" class="cloud-input" style="width:100%;margin-bottom:10px">
        <option value="pron">🔊 發音不對</option>
        <option value="mean">📖 中文解釋不對</option>
        <option value="other">❓ 其他問題</option>
      </select>
      <textarea id="rptNote" class="cloud-input" style="width:100%;min-height:60px;margin-bottom:10px" maxlength="200" placeholder="想補充說明嗎？（選填）"></textarea>
      <div id="rptMsg" style="text-align:center;min-height:18px;font-size:13px;color:#888"></div>
      <button class="btn" id="rptGo" style="width:100%">送出回報</button>
      <button class="btn ghost" id="rptNo" style="width:100%;margin-top:8px">取消</button></div>`;
    document.body.appendChild(box);
    box.onclick = e => { if (e.target === box) box.remove(); };
    box.querySelector('#rptNo').onclick = () => box.remove();
    box.querySelector('#rptGo').onclick = async () => {
      const goBtn = box.querySelector('#rptGo');
      const msg = box.querySelector('#rptMsg');
      goBtn.disabled = true;
      msg.textContent = '送出中…';
      try {
        const r = await fetch(API + '/api/report', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            word, kind: box.querySelector('#rptKind').value,
            note: box.querySelector('#rptNote').value,
          }),
        });
        const body = await r.json().catch(() => ({}));
        if (body.ok) {
          msg.style.color = '#2a8f4a';
          msg.textContent = '已送出，謝謝回報！';
          setTimeout(() => box.remove(), 1200);
        } else {
          msg.style.color = '#c0392b';
          msg.textContent = body.error || '送出失敗，請稍後再試';
          goBtn.disabled = false;
        }
      } catch {
        msg.style.color = '#c0392b';
        msg.textContent = '網路異常，請稍後再試';
        goBtn.disabled = false;
      }
    };
  }

  return { btn, open };
})();
if (typeof window !== 'undefined') window.VDReport = VDReport;
