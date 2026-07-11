/* 發音：瀏覽器內建 Web Speech API，免費零外部資源。單字／例句朗讀，可切美/英腔 */
const VDSpeak = (() => {
  const KEY = 'vd_accent';
  const ok = typeof window !== 'undefined' && 'speechSynthesis' in window;
  let lang = localStorage.getItem(KEY) || 'en-US';
  let voice = null;

  function pick() {
    if (!ok) return;
    const vs = speechSynthesis.getVoices();
    voice = vs.find(v => v.lang === lang)
      || vs.find(v => v.lang && v.lang.replace('_', '-').startsWith(lang.slice(0, 2)))
      || null;
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
    return `<button class="spk ${extra || ''}" data-t="${encodeURIComponent(text)}"
      onclick="event.stopPropagation();VDSpeak.say(decodeURIComponent(this.dataset.t))"
      aria-label="發音" title="發音">🔊</button>`;
  }

  return { say, btn, setAccent, accent, supported };
})();
if (typeof window !== 'undefined') window.VDSpeak = VDSpeak;
