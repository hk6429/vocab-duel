/* 發音：單字／短片語走有道 dictvoice 真人 mp3（免金鑰，美/英腔），
   例句或音檔抓失敗時退回瀏覽器內建 Web Speech API（有道對整句會回 500） */
const VDSpeak = (() => {
  const KEY = 'vd_accent';
  const ok = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const okAudio = typeof Audio !== 'undefined';
  let lang = localStorage.getItem(KEY) || 'en-US';
  let voice = null;
  let cur = null;                                      // 正在播的有道音檔
  let voicesLoaded = false, warned = false;            // TTS 語音清單是否載入、是否已提示過缺語音
  const cache = {};

  /* 選聲：依品質排序，避免抓到系統的玩具音（Albert/Bells/Zarvox…完全聽不懂） */
  const GOOD = ['google us english', 'google uk english female', 'google uk english male',
    'samantha', 'ava', 'allison', 'susan', 'zoe', 'evan', 'nathan', 'joelle',
    'daniel', 'kate', 'serena', 'stephanie', 'jamie', 'oliver',
    'microsoft aria', 'microsoft jenny', 'microsoft guy', 'microsoft zira',
    'microsoft sonia', 'microsoft libby', 'microsoft ryan', 'karen', 'moira', 'tessa'];
  const BAD = ['albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos',
    'deranged', 'good news', 'jester', 'organ', 'superstar', 'trinoids', 'whisper',
    'wobble', 'zarvox', 'grandma', 'grandpa', 'junior', 'ralph', 'fred', 'kathy',
    'eddy', 'flo', 'reed', 'rocko', 'sandy', 'shelley', 'grandpa', 'novelty'];
  function score(v) {
    const n = v.name.toLowerCase();
    if (BAD.some(b => n.includes(b))) return -1;
    let s = 0;
    const gi = GOOD.findIndex(g => n.includes(g));
    if (gi >= 0) s += 1000 - gi;                       // 已知好聲優先
    if (/natural|neural|premium|enhanced/.test(n)) s += 500;
    if (v.lang.replace('_', '-') === lang) s += 100;   // 完全符合腔調
    if (v.default) s += 10;
    if (v.localService) s += 5;
    return s;
  }
  function pick() {
    if (!ok) return;
    if (speechSynthesis.getVoices().length) voicesLoaded = true;
    const vs = speechSynthesis.getVoices()
      .filter(v => v.lang && v.lang.replace('_', '-').toLowerCase().startsWith('en'));
    voice = vs.sort((a, b) => score(b) - score(a))[0] || null;
    if (voice && score(voice) < 0) voice = null;       // 全是玩具聲就交給系統預設
  }
  // 有些裝置本來就沒語音、且不會觸發 onvoiceschanged，1.5s 後仍空就當作載完（好偵測「真的沒語音」）
  if (ok) { pick(); speechSynthesis.onvoiceschanged = pick; setTimeout(() => { voicesLoaded = true; }, 1500); }

  /* 裝置是否有可用的英語 TTS 語音；沒有的話「聽句選義」與例句朗讀會無聲 */
  function hasVoice() {
    return ok && speechSynthesis.getVoices().some(v => /^en/i.test((v.lang || '').replace('_', '-')));
  }
  /* 'ok' | 'no-voice' | 'unknown'（清單尚未載入完，先別誤報） | 'unsupported' */
  function ttsStatus() {
    if (!ok) return 'unsupported';
    if (!voicesLoaded) return 'unknown';
    return hasVoice() ? 'ok' : 'no-voice';
  }
  function maybeWarnNoVoice() {
    if (warned || ttsStatus() !== 'no-voice') return;
    warned = true;
    if (window.VDGame && VDGame.toast)
      VDGame.toast('🔇 你的裝置偵測不到英語語音，朗讀會沒聲音。到「設定 → 朗讀內容／文字轉語音」安裝一個英文語音就好。');
  }

  function tts(spoken) {
    if (!ok) return;
    const u = new SpeechSynthesisUtterance(spoken);
    u.lang = lang; if (voice) u.voice = voice; u.rate = 0.9;
    speechSynthesis.speak(u);      // 一律盡力播（避開清單載入競態）
    maybeWarnNoVoice();            // 但若確定沒英語語音，提示一次安裝
  }
  /* 有道真人音：抓失敗（斷網/被擋/整句 500）就交給 onFail 退回 TTS */
  function playUrl(spoken, onFail) {
    const type = lang === 'en-GB' ? 1 : 2;
    const key = type + '|' + spoken;
    let a = cache[key];
    if (!a) {
      a = new Audio('https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(spoken) + '&type=' + type);
      cache[key] = a;
    }
    a.onerror = () => { delete cache[key]; cur = null; onFail(); };
    cur = a; a.currentTime = 0;
    const p = a.play();
    if (p && p.catch) p.catch(() => { delete cache[key]; cur = null; onFail(); });
  }
  function say(text) {
    if (!text) return;
    if (cur) { cur.pause(); cur = null; }
    if (ok) speechSynthesis.cancel();
    const raw = String(text).trim();
    /* 全大寫縮寫（2–5 字母）逐字母唸，避免 MRT/TV/CD 被唸成一團 */
    const spoken = /^[A-Z]{2,5}$/.test(raw) ? raw.split('').join(' ') : raw;
    const isShort = !/[.?!,;:！？。，]/.test(raw) && raw.split(/\s+/).length <= 4 && raw.length <= 40;
    if (okAudio && isShort) playUrl(spoken, () => tts(spoken));
    else tts(spoken);
  }
  function setAccent(l) { lang = l; localStorage.setItem(KEY, l); pick(); }
  function accent() { return lang; }
  function supported() { return ok || okAudio; }

  /* 產生一顆發音鈕（阻止冒泡，避免觸發卡片翻面等父層事件），旁邊固定跟一顆回報鈕 */
  function btn(text, extra) {
    if (!(ok || okAudio) || !text) return '';
    const brief = String(text).slice(0, 40);
    const lab = '發音 ' + ((window.VDGame && VDGame.esc) ? VDGame.esc(brief)
      : brief.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
    const spk = `<button class="spk ${extra || ''}" data-t="${encodeURIComponent(text)}"
      onclick="event.stopPropagation();VDSpeak.say(decodeURIComponent(this.dataset.t))"
      aria-label="${lab}" title="發音">🔊</button>`;
    const rpt = (window.VDReport && VDReport.btn) ? VDReport.btn(text) : '';
    return spk + rpt;
  }

  return { say, btn, setAccent, accent, supported, hasVoice, ttsStatus };
})();
if (typeof window !== 'undefined') window.VDSpeak = VDSpeak;
