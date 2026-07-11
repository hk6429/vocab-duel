/* 閃卡模組：Leitner 五盒，一場 20 張（到期優先、其次新字）；支援 英→中／中→英 雙向與發音 */
const VDFlash = (() => {
  const SESSION_SIZE = 20;
  let queue = [], idx = 0, flipped = false, doneCount = 0;
  let dir = localStorage.getItem('vd_flashdir') || 'e2z'; // e2z=看英想中, z2e=看中想英

  function buildQueue(words) {
    const due = words.filter(w => VDStore.isDue(w.word));
    due.sort((a, b) => VDStore.box(a.word) - VDStore.box(b.word));
    const fresh = words.filter(w => !VDStore.isSeen(w.word));
    shuffle(fresh);
    return due.concat(fresh).slice(0, SESSION_SIZE);
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }

  let curEl = null;
  function start(words, el, opts) {
    curEl = el;
    // raw=true（錯題複習）：不套到期/新字篩選，直接用傳入的字
    queue = opts && opts.raw ? (shuffle(words = words.slice()), words.slice(0, SESSION_SIZE)) : buildQueue(words);
    idx = 0; doneCount = 0;
    render(el);
  }

  function toggleDir() {
    dir = dir === 'e2z' ? 'z2e' : 'e2z';
    localStorage.setItem('vd_flashdir', dir);
    render(curEl);
  }
  function toggleAccent() {
    VDSpeak.setAccent(VDSpeak.accent() === 'en-US' ? 'en-GB' : 'en-US');
    render(curEl);
  }

  function render(el) {
    if (!queue.length) {
      el.innerHTML = `<div class="card-done"><div class="big">🎉</div><p>目前沒有到期或新的字！</p><button class="btn" onclick="VDApp.go('menu')">回主選單</button></div>`;
      return;
    }
    if (idx >= queue.length) {
      el.innerHTML = `<div class="card-done"><div class="big">✅</div><p>本回合完成，共複習 ${doneCount} 張！</p>
        <button class="btn" onclick="VDApp.go('flash')">再來一回合</button>
        <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button></div>`;
      return;
    }
    const w = queue[idx];
    flipped = false;
    const boxNum = VDStore.box(w.word);
    const acc = VDSpeak.supported() ? (VDSpeak.accent() === 'en-US' ? '🇺🇸 美' : '🇬🇧 英') : '';
    const front = dir === 'e2z'
      ? `<div class="flash-word">${w.word} ${VDSpeak.btn(w.word)}</div><div class="flash-hint">點卡片看中文</div>`
      : `<div class="flash-zh big">${w.zh}</div><div class="flash-pos">${w.pos.join(', ')}</div><div class="flash-hint">點卡片看英文</div>`;
    el.innerHTML = `
      <div class="flash-progress">${idx + 1} / ${queue.length}　${boxNum >= 0 ? '盒 ' + boxNum : '新字'}</div>
      <div class="flash-ctrl">
        <button class="chip" id="dirBtn">${dir === 'e2z' ? '英→中' : '中→英'} 🔄</button>
        ${acc ? `<button class="chip" id="accBtn">${acc}腔</button>` : ''}
      </div>
      <div class="flash-card" id="flashCard" role="button" tabindex="0" aria-label="翻卡（Enter 或空白鍵）">
        <div class="flash-front">${front}</div>
        <div class="flash-back hidden">
          <div class="flash-word small">${w.word} ${VDSpeak.btn(w.word)}</div>
          <div class="flash-pos">${w.pos.join(', ')}</div>
          <div class="flash-zh">${w.zh}</div>
          <div class="flash-ex">${w.example} ${VDSpeak.btn(w.example)}<br><span class="ex-zh">${w.example_zh}</span></div>
        </div>
      </div>
      <div class="flash-btns hidden" id="flashBtns">
        <button class="btn no" id="btnNo">😵 不熟</button>
        <button class="btn yes" id="btnYes">😎 我會</button>
      </div>`;
    el.querySelector('#dirBtn').onclick = toggleDir;
    const accBtn = el.querySelector('#accBtn');
    if (accBtn) accBtn.onclick = toggleAccent;
    const card = el.querySelector('#flashCard');
    const flip = () => {
      if (flipped) return;
      flipped = true;
      card.querySelector('.flash-front').classList.add('hidden');
      card.querySelector('.flash-back').classList.remove('hidden');
      el.querySelector('#flashBtns').classList.remove('hidden');
    };
    card.onclick = flip;
    card.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } };
    el.querySelector('#btnYes').onclick = () => answer(true, el, w);
    el.querySelector('#btnNo').onclick = () => answer(false, el, w);
  }

  function answer(correct, el, w) {
    VDStore.record(w.word, correct);
    doneCount++;
    idx++;
    render(el);
  }

  return { start };
})();
