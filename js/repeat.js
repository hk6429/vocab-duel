/* 跟我讀 MVP（P1）：播範音 → 學生錄一次 → 寬鬆比對是否唸對目標字，只給「唸對了／再試一次」二元回饋。
   裝置不支援 SpeechRecognition 時，改用「跟讀三次」節奏引導（播音→提示跟讀→重複）。
   自足模組：自建全螢幕 modal，唯讀呼叫 VDSpeak / VDApp.scopeWords。 */
const VDRepeat = (() => {
  const N = 10; // 每次跟讀題數

  let words = [], idx = 0, recognizer = null, supported = false;

  let host = null; // start() 傳入的容器：overlay 掛它底下，離開頁面（#app 重繪）一併移除，不殘留攔點擊
  function ensureOverlay() {
    let ov = document.getElementById('vd-repeat-ov');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'vd-repeat-ov';
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
    if (recognizer) { try { recognizer.onresult = null; recognizer.onerror = null; recognizer.abort(); } catch { /* noop */ } }
    const ov = document.getElementById('vd-repeat-ov');
    if (ov) ov.remove();
    if (window.VDApp && typeof VDApp.go === 'function') VDApp.go('menu');
  }

  function pickWords() {
    const all = (window.VDApp && typeof VDApp.scopeWords === 'function') ? VDApp.scopeWords()
      : (window.VDApp && typeof VDApp.words === 'function' ? VDApp.words() : []);
    // 單字／短片語層級：跳過含逗號句子、超長片語
    const pool = all.filter(w => /^[a-zA-Z' -]+$/.test(w.word) && w.word.split(' ').length <= 3);
    const shuffled = pool.slice().sort(() => Math.random() - 0.5);
    return shuffled.slice(0, N);
  }

  function start(el) {
    host = el || null;
    words = pickWords();
    idx = 0;
    if (!words.length) { alert('題庫尚未載入，稍後再試一次'); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    supported = !!SR;
    if (supported) {
      recognizer = new SR();
      recognizer.lang = 'en-US';
      recognizer.maxAlternatives = 3;
      recognizer.interimResults = false;
    }
    intro();
  }

  function intro() {
    const box = panel();
    box.innerHTML = `
      <h2>🎙️ 跟我讀</h2>
      <p>聽範音後跟著唸一次，我幫你聽聽有沒有唸對。${supported ? '' : '（此裝置沒有語音辨識，改用跟讀三次的節奏練習）'}</p>
      <button class="btn" id="go">開始</button>
      <button class="btn ghost" id="x">先不練</button>`;
    box.querySelector('#go').onclick = next;
    box.querySelector('#x').onclick = close;
  }

  function next() {
    if (idx >= words.length) return finish();
    renderWord();
  }

  function renderWord() {
    const w = words[idx];
    const box = panel();
    box.innerHTML = `
      <div class="quiz-sub">第 ${idx + 1}／${words.length} 題</div>
      <div class="quiz-prompt">${w.word}</div>
      <div class="quiz-sub">${w.zh || ''}</div>
      <button class="btn" id="play">🔊 聽範音</button>
      ${supported
        ? '<button class="btn" id="rec">🎤 開始跟讀</button><div id="fb" class="quiz-sub"></div>'
        : '<div class="quiz-sub">跟讀三次：聽 → 跟著唸 → 再聽一次確認</div><button class="btn" id="rep">▶️ 開始跟讀三次</button>'}
      <button class="btn ghost" id="skip">跳過</button>`;
    box.querySelector('#play').onclick = () => VDSpeak.say(w.word);
    box.querySelector('#skip').onclick = () => { idx++; next(); };
    if (supported) box.querySelector('#rec').onclick = () => listen(w, box);
    else box.querySelector('#rep').onclick = () => fallbackCycle(w, box, 0);
  }

  /* 寬鬆比對：忽略大小寫/標點、前後綴容差（單複數、現在式等） */
  function norm(s) { return String(s).toLowerCase().replace(/[^a-z' ]/g, '').trim(); }
  function stripSuffix(s) { return s.replace(/(ies|es|ed|ing|s)$/, ''); }
  function matches(heard, target) {
    const h = norm(heard), t = norm(target);
    if (!h) return false;
    if (h === t || h.includes(t) || t.includes(h)) return true;
    return stripSuffix(h) === stripSuffix(t);
  }

  function listen(w, box) {
    const fb = box.querySelector('#fb');
    fb.textContent = '🎤 請說...';
    let handled = false;
    recognizer.onresult = (e) => {
      handled = true;
      const text = (e.results && e.results[0] && e.results[0][0]) ? e.results[0][0].transcript : '';
      if (matches(text, w.word)) {
        fb.textContent = '✅ 唸對了！';
        if (window.VDGame && VDGame.onAnswer) VDGame.onAnswer(true, 'repeat', 0);
        setTimeout(() => { idx++; next(); }, 700);
      } else {
        fb.textContent = `再試一次（聽到：「${text}」）`;
      }
    };
    recognizer.onerror = (e) => {
      if (e && (e.error === 'not-allowed' || e.error === 'permission-denied' || e.error === 'service-not-allowed')) {
        fb.textContent = '⚠️ 麥克風權限被拒絕，請到瀏覽器設定允許麥克風後再試一次。';
      } else if (!handled) {
        fb.textContent = '沒聽清楚，再按一次麥克風試試。';
      }
    };
    try { recognizer.start(); }
    catch {
      fb.textContent = '🎤 錄音啟動失敗，改用跟讀三次模式。';
      supported = false;
      setTimeout(renderWord, 900);
    }
  }

  function fallbackCycle(w, box, n) {
    if (n >= 3) { idx++; setTimeout(next, 300); return; }
    VDSpeak.say(w.word);
    const btn = box.querySelector('#rep');
    if (btn) btn.textContent = `▶️ 第 ${n + 1}／3 次：跟著唸`;
    setTimeout(() => fallbackCycle(w, box, n + 1), 1600);
  }

  function finish() {
    const box = panel();
    box.innerHTML = `
      <h2>🎉 跟讀完成</h2>
      <p>本輪練習了 ${words.length} 個字／片語。</p>
      <button class="btn" id="ok">完成</button>`;
    box.querySelector('#ok').onclick = close;
  }

  return { start };
})();
if (typeof window !== 'undefined') window.VDRepeat = VDRepeat;
