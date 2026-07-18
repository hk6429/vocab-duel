/* 精簡/專注模式 + IEP 個別化調節：單一真相來源。
   對外：VDMode.simplified() / VDMode.acc(key) / VDMode.fontScale() / setter 們。
   套用時機：init 與每次切換，對 <body> 加/移 class：
   simplified / iep-notimer / fs-large / fs-xlarge / dyslexia / high-contrast */
const VDMode = (() => {
  const LS = {
    simplified: 'vd_simplified',
    fontscale: 'vd_fontscale',   // 'normal' | 'large' | 'xlarge'（沿用既有 key，擴充第三段）
    dyslexia: 'vd_dyslexia',
    contrast: 'vd_contrast',
    noTimer: 'vd_notimer',
    extraTime: 'vd_extratime',   // 1 | 1.5 | 2
    timerDur: 'vd_timerdur',     // 60 | 90 | 120（sprint 用）
  };

  // 若雲端／老師端已同步下發個別化調節資料（IEP），優先讀它；沒有就只讀本機開關。
  // 不強制要求 VDStore/VDCloud 提供此介面，沒有就靜靜跳過。
  function iepAcc() {
    try {
      if (window.VDStore && typeof VDStore.iepAcc === 'function') return VDStore.iepAcc() || null;
    } catch { /* 忽略 */ }
    try {
      if (window.VDCloud && typeof VDCloud.iepAcc === 'function') return VDCloud.iepAcc() || null;
    } catch { /* 忽略 */ }
    return null;
  }

  function simplified() { return localStorage.getItem(LS.simplified) === '1'; }
  function setSimplified(on) {
    if (on) localStorage.setItem(LS.simplified, '1'); else localStorage.removeItem(LS.simplified);
    apply();
  }

  function fontScale() {
    const v = localStorage.getItem(LS.fontscale);
    return (v === 'large' || v === 'xlarge') ? v : 'normal';
  }
  function setFontScale(v) { localStorage.setItem(LS.fontscale, v); apply(); }
  function cycleFontScale() {
    const order = ['normal', 'large', 'xlarge'];
    const next = order[(order.indexOf(fontScale()) + 1) % order.length];
    setFontScale(next);
    return next;
  }

  function dyslexia() { return localStorage.getItem(LS.dyslexia) === '1'; }
  function setDyslexia(on) {
    if (on) localStorage.setItem(LS.dyslexia, '1'); else localStorage.removeItem(LS.dyslexia);
    apply();
  }

  function contrast() { return localStorage.getItem(LS.contrast) === '1'; }
  function setContrast(on) {
    if (on) localStorage.setItem(LS.contrast, '1'); else localStorage.removeItem(LS.contrast);
    apply();
  }

  function noTimerRaw() { return localStorage.getItem(LS.noTimer) === '1'; }
  function setNoTimer(on) {
    if (on) localStorage.setItem(LS.noTimer, '1'); else localStorage.removeItem(LS.noTimer);
    apply();
  }

  function timerDur() {
    const v = parseInt(localStorage.getItem(LS.timerDur), 10);
    return [60, 90, 120].includes(v) ? v : 60;
  }
  function setTimerDur(v) { localStorage.setItem(LS.timerDur, String(v)); apply(); }

  /* 個別化調節：IEP 下發資料優先，其次本機開關 */
  function acc(key) {
    const iep = iepAcc();
    if (iep && Object.prototype.hasOwnProperty.call(iep, key)) return iep[key];
    switch (key) {
      case 'extraTime': {
        const v = parseFloat(localStorage.getItem(LS.extraTime));
        return [1, 1.5, 2].includes(v) ? v : 1;
      }
      case 'noTimer': return noTimerRaw();
      case 'maxItems': return null; // 沒有本機設定，留給 IEP 下發資料
      case 'bigFont': return fontScale() !== 'normal';
      case 'dyslexia': return dyslexia();
      case 'hideEconomy': return simplified();
      case 'timerDur': return timerDur();
      default: return null;
    }
  }

  function apply() {
    const b = document.body;
    if (!b) return;
    b.classList.toggle('simplified', simplified());
    b.classList.toggle('iep-notimer', !!acc('noTimer'));
    const fs = fontScale();
    b.classList.toggle('fs-large', fs === 'large');
    b.classList.toggle('fs-xlarge', fs === 'xlarge');
    b.classList.toggle('dyslexia', dyslexia());
    b.classList.toggle('high-contrast', contrast());
  }

  function init() { apply(); }
  if (document.body) apply(); else document.addEventListener('DOMContentLoaded', init);

  return {
    simplified, setSimplified,
    fontScale, setFontScale, cycleFontScale,
    dyslexia, setDyslexia,
    contrast, setContrast,
    noTimer: () => !!acc('noTimer'), setNoTimer,
    timerDur, setTimerDur,
    acc, apply, init,
  };
})();
window.VDMode = VDMode;
