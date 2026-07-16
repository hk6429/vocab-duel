/* 統一弱字本：把「答錯過」「假熟練」「低信任」三種訊號聚合成一頁，一站補強
   資料全來自 VDStore（meta.wrong / isFakeMastery / trustScore），純前端零後端 */
const VDWeak = (() => {

  /* 弱字清單：scope 內三類聯集，每字附原因標籤 */
  function build(words) {
    const out = [];
    for (const w of words) {
      const reasons = [];
      if (VDStore.isWrong(w.word)) reasons.push('錯過');
      if (VDStore.isFakeMastery(w.word)) reasons.push('假熟練');
      else {
        const b = VDStore.box(w.word);
        if (b >= 0 && b < 3 && VDStore.trustScore(w.word) < 0.7) reasons.push('低信任');
      }
      if (reasons.length) out.push({ w, reasons });
    }
    // 排序：原因多的優先，再依盒位低的優先
    return out.sort((a, b) => b.reasons.length - a.reasons.length || VDStore.box(a.w.word) - VDStore.box(b.w.word));
  }

  const count = (words) => build(words).length;

  function boxPips(word) {
    const b = VDStore.box(word);
    return `<span class="af-pos" title="熟悉度第 ${Math.max(0, b)} 盒">${'●'.repeat(Math.max(0, b))}${'○'.repeat(5 - Math.max(0, b))}</span>`;
  }

  function start(words, el) {
    const list = build(words);
    if (!list.length) {
      el.innerHTML = `<div class="card-done"><div class="big">🎉</div>
        <p>目前沒有任何弱字——錯題、假熟練、低信任通通清空，讚！</p>
        <button class="btn ghost" onclick="VDApp.go('menu')">回主選單</button></div>`;
      return;
    }
    const tag = (r) => `<span class="cloud-tag">${r === '錯過' ? '🩹' : r === '假熟練' ? '🎭' : '🌫️'} ${r}</span>`;
    el.innerHTML = `
      <div class="wc-card"><div class="wc-card-body">
        <div class="hero-sec">🩺 你的弱字（${list.length} 個）</div>
        <p class="pg-hint">來源：答錯過的字＋「看起來會了但其實可疑」的假熟練字＋作答訊號不穩的低信任字。</p>
        <div class="cloud-row">
          <button class="btn" id="wkQuiz">✍️ 全部自測</button>
          <button class="btn ghost" id="wkFlash">🃏 閃卡複習</button>
        </div>
      </div></div>
      <div class="qw-list">${list.map(({ w, reasons }) => `
        <div class="qw-row">
          <div class="qw-word"><b>${w.word}</b> ${VDSpeak.btn(w.word)} ${boxPips(w.word)}
            <button class="mini-star ${VDStore.isStar(w.word) ? 'on' : ''}" onclick="VDApp.starClick(this,'${w.word}')">${VDStore.isStar(w.word) ? '⭐' : '☆'}</button></div>
          <div class="qw-sentence">${w.zh}　${reasons.map(tag).join('')}</div>
        </div>`).join('')}</div>
      <button class="btn ghost wide" onclick="VDApp.go('menu')">回主選單</button>`;
    const targets = list.map(x => x.w);
    el.querySelector('#wkQuiz').onclick = () => {
      el.innerHTML = '<div id="wkMod"></div>';
      VDQuiz.startWith(targets, el.querySelector('#wkMod'), VDApp.scopeWords(true));
    };
    el.querySelector('#wkFlash').onclick = () => {
      el.innerHTML = '<div id="wkMod"></div>';
      VDFlash.start(targets, el.querySelector('#wkMod'), { raw: true, wrong: true });
    };
  }

  return { start, count };
})();
window.VDWeak = VDWeak;
