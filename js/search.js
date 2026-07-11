/* 查單字：輸入英文或中文即時搜尋，看字義／例句／發音／英英定義，一鍵加星收藏或加閃卡 */
const VDSearch = (() => {
  let el = null, all = [];

  function start(container) {
    el = container;
    all = VDApp.words();
    el.innerHTML = `
      <div class="sr-box">
        <input id="srIn" class="sr-in" type="search" autocomplete="off" placeholder="🔍 打英文或中文查單字…" aria-label="搜尋單字">
      </div>
      <div class="sr-hint">上課遇到的字，馬上查、馬上收藏。</div>
      <div id="srList"></div>`;
    const input = el.querySelector('#srIn');
    input.focus();
    input.oninput = () => renderList(input.value.trim().toLowerCase());
  }

  function renderList(q) {
    const box = el.querySelector('#srList');
    if (!q) { box.innerHTML = ''; return; }
    const hits = all.filter(w => w.word.toLowerCase().includes(q) || w.zh.includes(q)).slice(0, 40);
    if (!hits.length) { box.innerHTML = `<div class="sr-empty">查無「${q}」，換個字試試。</div>`; return; }
    box.innerHTML = hits.map(w => card(w)).join('');
    box.querySelectorAll('.sr-card').forEach(c => bind(c, hits.find(w => w.word === c.dataset.w)));
  }

  function card(w) {
    const star = VDStore.isStar(w.word);
    return `<div class="sr-card" data-w="${w.word}">
      <div class="sr-top">
        <span class="sr-word">${w.word} ${VDSpeak.btn(w.word)}</span>
        <button class="sr-star ${star ? 'on' : ''}" title="加星收藏">${star ? '⭐' : '☆'}</button>
      </div>
      <div class="sr-pos">${w.pos.join('・')}　${w.zh}</div>
      <div class="sr-ex">${w.example} ${VDSpeak.btn(w.example)}<br><span class="ex-zh">${w.example_zh}</span></div>
      ${VDEnrich.block(w.word)}
      <button class="btn ghost sm sr-add">🃏 加入閃卡</button>
    </div>`;
  }

  function bind(c, w) {
    if (!w) return;
    c.querySelector('.sr-star').onclick = e => {
      const on = VDStore.toggleStar(w.word);
      e.target.textContent = on ? '⭐' : '☆';
      e.target.classList.toggle('on', on);
      if (window.VDSound) VDSound.click();
      VDGame.toast(on ? `⭐ 收藏「${w.word}」` : `取消收藏「${w.word}」`);
    };
    c.querySelector('.sr-add').onclick = () => {
      const added = VDStore.enroll(w.word);
      VDGame.toast(added ? `🃏「${w.word}」已加入閃卡` : `「${w.word}」已在閃卡裡`);
    };
  }

  return { start };
})();
window.VDSearch = VDSearch;
