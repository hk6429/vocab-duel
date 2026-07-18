/* Pre-A 解碼層（P1）：26 字母大小寫辨識 → 字母音 → 5 個短母音 CVC 家族（-at/-en/-ig/-op/-un）解碼小遊戲。
   字取自既有字庫（words.json）子集，皆為安全常見字（bat/cat/hat.../hen/pen/ten/big/dig/pig/wig/hop/mop/pop/top/bun/fun/gun/run/sun）。
   過關記錄存 localStorage，供日後「過解碼層才解鎖閃卡」判斷（本模組只做記錄，不強制 gate）。
   自足模組：自建全螢幕 modal，唯讀呼叫 VDSpeak / VDApp.words。 */
const VDPhonics = (() => {
  const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
  // 常見易混淆字母組，作為案例辨識的干擾選項來源
  const CONFUSABLE = { b: 'dpq', d: 'bpq', p: 'bdq', q: 'bdp', m: 'wn', w: 'mvu', n: 'mu', u: 'vnw', v: 'uwy' };
  const SOUND_SET = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'm', 'p', 's', 't']; // 字母音關卡取常見子集
  const FAMILIES = [
    { rime: 'at', words: ['bat', 'cat', 'hat', 'mat', 'rat', 'fat', 'pat'] },
    { rime: 'en', words: ['hen', 'pen', 'ten'] },
    { rime: 'ig', words: ['big', 'dig', 'pig', 'wig'] },
    { rime: 'op', words: ['hop', 'mop', 'pop', 'top'] },
    { rime: 'un', words: ['bun', 'fun', 'gun', 'run', 'sun'] }
  ];
  const KEY = 'vd_phonics';

  let allWords = [], wordMap = {}, stage = null, queue = [], qi = 0, cur = null, locked = false;
  let progress = { letters: false, sounds: false, families: {} };
  let host = null; // start() 傳入的容器：overlay 掛在它底下，離開頁面（#app 重繪）時一併移除，不殘留

  function ensureOverlay() {
    let ov = document.getElementById('vd-phonics-ov');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'vd-phonics-ov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);' +
      'display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto';
    (host || document.body).appendChild(ov);
    return ov;
  }
  function panel() {
    const ov = ensureOverlay();
    ov.innerHTML = '<div class="card" style="max-width:480px;width:100%;background:var(--card-bg,#fff);' +
      'border-radius:14px;padding:20px;max-height:90vh;overflow:auto"></div>';
    return ov.firstElementChild;
  }
  function close() {
    const ov = document.getElementById('vd-phonics-ov');
    if (ov) ov.remove();
    if (window.VDApp && typeof VDApp.go === 'function') VDApp.go('menu'); // 關閉後回主選單，不留空白頁
  }

  function loadProgress() {
    try { return Object.assign({ letters: false, sounds: false, families: {} }, JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch { return { letters: false, sounds: false, families: {} }; }
  }
  function saveProgress() { localStorage.setItem(KEY, JSON.stringify(progress)); }

  async function loadWords() {
    if (window.VDApp && typeof VDApp.words === 'function') {
      const w = VDApp.words();
      if (w && w.length) return w;
    }
    try { const res = await fetch('data/words.json'); return await res.json(); }
    catch { return []; }
  }

  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function sample(arr, n, excludeSet) {
    return shuffle(arr.filter(x => !excludeSet || !excludeSet.has(x))).slice(0, n);
  }

  async function start(el) {
    host = el || null;
    allWords = await loadWords();
    wordMap = {};
    allWords.forEach(w => { wordMap[w.word] = w; });
    progress = loadProgress();
    menu();
  }

  function menu() {
    const box = panel();
    box.innerHTML = `
      <h2>🔤 Pre-A 解碼層</h2>
      <p>從字母認讀，一路練到短母音家族拼讀。</p>
      <button class="btn" id="l1">1️⃣ 字母大小寫 ${progress.letters ? '✅' : ''}</button>
      <button class="btn" id="l2">2️⃣ 字母音 ${progress.sounds ? '✅' : ''}</button>
      ${FAMILIES.map((f, i) => `<button class="btn" data-f="${f.rime}">3.${i + 1} -${f.rime} 家族 ${progress.families[f.rime] ? '✅' : ''}</button>`).join('')}
      <button class="btn ghost" id="x">關閉</button>`;
    box.querySelector('#l1').onclick = () => runLetters();
    box.querySelector('#l2').onclick = () => runSounds();
    box.querySelectorAll('[data-f]').forEach(b => b.onclick = () => runFamily(b.dataset.f));
    box.querySelector('#x').onclick = close;
  }

  /* ---- 關卡一：字母大小寫辨識 ---- */
  function runLetters() {
    stage = 'letters';
    queue = shuffle(LETTERS);
    qi = 0; locked = false;
    nextLetterQ();
  }
  function nextLetterQ() {
    if (qi >= queue.length) return doneStage('letters');
    const target = queue[qi];
    const upper = Math.random() < 0.5;
    const shown = upper ? target.toUpperCase() : target;
    const askOther = upper ? target : target.toUpperCase(); // 要找的是相反大小寫的同一字母
    const confusePool = (CONFUSABLE[target] || 'xyz').split('');
    const distractors = sample(confusePool.length >= 3 ? confusePool : LETTERS.filter(l => l !== target), 3, new Set([target]))
      .map(l => upper ? l : l.toUpperCase());
    const options = shuffle([askOther, ...distractors]);
    cur = { ans: askOther, prompt: shown };
    locked = false;
    const box = panel();
    box.innerHTML = `
      <div class="quiz-sub">字母大小寫　第 ${qi + 1}／${queue.length} 題</div>
      <div class="quiz-prompt" style="font-size:3rem">${shown}</div>
      <div class="quiz-sub">請找出對應的大小寫</div>
      <div class="quiz-opts">${options.map((o, i) =>
        `<button class="btn opt" data-v="${encodeURIComponent(o)}"><span class="opt-key">${'ABCD'[i]}</span><span class="opt-text">${o}</span></button>`).join('')}</div>
      <button class="btn ghost" id="x">中止</button>`;
    box.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      if (locked) return;
      locked = true;
      qi++;
      setTimeout(nextLetterQ, 200);
    });
    box.querySelector('#x').onclick = menu;
  }

  /* ---- 關卡二：字母音 ---- */
  function runSounds() {
    stage = 'sounds';
    queue = shuffle(SOUND_SET);
    qi = 0; locked = false;
    nextSoundQ();
  }
  function nextSoundQ() {
    if (qi >= queue.length) return doneStage('sounds');
    const target = queue[qi];
    const distractors = sample(SOUND_SET, 3, new Set([target]));
    const options = shuffle([target, ...distractors]).map(l => l.toUpperCase());
    cur = { ans: target.toUpperCase() };
    locked = false;
    const box = panel();
    box.innerHTML = `
      <div class="quiz-sub">字母音　第 ${qi + 1}／${queue.length} 題</div>
      <button class="btn" id="play">🔊 播放字母音</button>
      <div class="quiz-sub">剛剛唸的是哪個字母？</div>
      <div class="quiz-opts">${options.map((o, i) =>
        `<button class="btn opt" data-v="${encodeURIComponent(o)}"><span class="opt-key">${'ABCD'[i]}</span><span class="opt-text">${o}</span></button>`).join('')}</div>
      <button class="btn ghost" id="x">中止</button>`;
    box.querySelector('#play').onclick = () => VDSpeak.say(target);
    VDSpeak.say(target);
    box.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      if (locked) return;
      locked = true;
      qi++;
      setTimeout(nextSoundQ, 200);
    });
    box.querySelector('#x').onclick = menu;
  }

  /* ---- 關卡三：CVC 家族解碼（聽音辨字，同家族互為誘答） ---- */
  function runFamily(rime) {
    const fam = FAMILIES.find(f => f.rime === rime);
    if (!fam) return menu();
    stage = 'family:' + rime;
    queue = shuffle(fam.words);
    qi = 0; locked = false;
    runFamily._fam = fam;
    nextFamilyQ();
  }
  function nextFamilyQ() {
    const fam = runFamily._fam;
    if (qi >= queue.length) return doneStage('family:' + fam.rime, fam.rime);
    const target = queue[qi];
    const others = fam.words.filter(w => w !== target);
    const distractors = sample(others, Math.min(3, others.length));
    const options = shuffle([target, ...distractors]);
    cur = { ans: target };
    locked = false;
    const box = panel();
    const w = wordMap[target];
    box.innerHTML = `
      <div class="quiz-sub">-${fam.rime} 家族　第 ${qi + 1}／${queue.length} 題</div>
      <button class="btn" id="play">🔊 聽發音</button>
      <div class="quiz-sub">聽到的是哪個字？</div>
      <div class="quiz-opts">${options.map((o, i) =>
        `<button class="btn opt" data-v="${encodeURIComponent(o)}"><span class="opt-key">${'ABCD'[i]}</span><span class="opt-text">${o}</span></button>`).join('')}</div>
      ${w ? `<div class="quiz-sub" id="hint" style="visibility:hidden">（${w.zh}）</div>` : ''}
      <button class="btn ghost" id="x">中止</button>`;
    box.querySelector('#play').onclick = () => VDSpeak.say(target);
    VDSpeak.say(target);
    box.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      if (locked) return;
      locked = true;
      const correct = decodeURIComponent(b.dataset.v) === cur.ans;
      const hint = box.querySelector('#hint');
      if (hint) hint.style.visibility = 'visible';
      b.style.outline = correct ? '3px solid #2ecc71' : '3px solid #e74c3c';
      qi++;
      setTimeout(nextFamilyQ, correct ? 500 : 900);
    });
    box.querySelector('#x').onclick = menu;
  }

  function doneStage(key, familyRime) {
    if (familyRime) progress.families[familyRime] = true;
    else progress[key] = true;
    saveProgress();
    const box = panel();
    box.innerHTML = `
      <h2>🎉 過關！</h2>
      <p>這一關練完了，回主選單挑下一關吧。</p>
      <button class="btn" id="ok">回選單</button>`;
    box.querySelector('#ok').onclick = menu;
  }

  /* 是否全數過關（供日後「過解碼層才解鎖閃卡」判斷使用） */
  function allDone() {
    return progress.letters && progress.sounds && FAMILIES.every(f => progress.families[f.rime]);
  }

  return { start, allDone };
})();
if (typeof window !== 'undefined') window.VDPhonics = VDPhonics;
