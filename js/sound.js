/* 音效：Web Audio 即時合成，零素材零成本。可靜音（localStorage vd_sound） */
const VDSound = (() => {
  let ctx = null;
  let on = localStorage.getItem('vd_sound') !== 'off';

  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type, vol, when) {
    const c = ac(); if (!c || !on) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    const t = c.currentTime + (when || 0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol || 0.15, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const correct = () => { tone(660, 0.12, 'sine', 0.18); tone(990, 0.14, 'sine', 0.13, 0.08); };
  const wrong = () => { tone(200, 0.18, 'sawtooth', 0.12); tone(150, 0.22, 'sawtooth', 0.1, 0.05); };
  const combo = n => { const b = 520 + Math.min(n, 8) * 55; tone(b, 0.1, 'square', 0.12); tone(b * 1.5, 0.1, 'square', 0.08, 0.05); };
  const coin = () => { tone(880, 0.05, 'square', 0.1); tone(1320, 0.09, 'square', 0.1, 0.05); };
  const levelup = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.16, i * 0.09));
  const click = () => tone(440, 0.04, 'sine', 0.05);
  const tick = () => tone(1200, 0.03, 'square', 0.05);
  const setOn = v => { on = v; localStorage.setItem('vd_sound', v ? 'on' : 'off'); if (v) coin(); };

  return { correct, wrong, combo, coin, levelup, click, tick, setOn, get on() { return on; }, unlock: ac };
})();
window.VDSound = VDSound;
