/* 發音：瀏覽器內建 Web Speech API，免費零外部資源。單字／例句朗讀，可切美/英腔 */
const VDSpeak = (() => {
  const KEY = 'vd_accent';
  const ok = typeof window !== 'undefined' && 'speechSynthesis' in window;
  let lang = localStorage.getItem(KEY) || 'en-US';
  let voice = null;

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
    const vs = speechSynthesis.getVoices()
      .filter(v => v.lang && v.lang.replace('_', '-').toLowerCase().startsWith('en'));
    voice = vs.sort((a, b) => score(b) - score(a))[0] || null;
    if (voice && score(voice) < 0) voice = null;       // 全是玩具聲就交給系統預設
  }
  if (ok) { pick(); speechSynthesis.onvoiceschanged = pick; }

  function say(text) {
    if (!ok || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = lang; if (voice) u.voice = voice; u.rate = 0.9;
    speechSynthesis.speak(u);
  }
  function setAccent(l) { lang = l; localStorage.setItem(KEY, l); pick(); }
  function accent() { return lang; }
  function supported() { return ok; }

  /* 產生一顆發音鈕（阻止冒泡，避免觸發卡片翻面等父層事件） */
  function btn(text, extra) {
    if (!ok || !text) return '';
    const brief = String(text).slice(0, 40);
    const lab = '發音 ' + ((window.VDGame && VDGame.esc) ? VDGame.esc(brief)
      : brief.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
    return `<button class="spk ${extra || ''}" data-t="${encodeURIComponent(text)}"
      onclick="event.stopPropagation();VDSpeak.say(decodeURIComponent(this.dataset.t))"
      aria-label="${lab}" title="發音">🔊</button>`;
  }

  return { say, btn, setAccent, accent, supported };
})();
if (typeof window !== 'undefined') window.VDSpeak = VDSpeak;
