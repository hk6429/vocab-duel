/* 詞彙深度資料（英英定義＋搭配詞）：sidecar 檔懶載入，有才顯示，缺則靜默略過 */
const VDEnrich = (() => {
  let map = null;         // { word: { def_en, collo:[...] } }
  let loading = null;

  async function ensure() {
    if (map) return map;
    if (!loading) loading = fetch('data/enrich.json')
      .then(r => r.ok ? r.json() : {})
      .then(j => (map = j || {}))
      .catch(() => (map = {}));
    return loading;
  }

  function get(word) { return (map && map[word]) || null; }

  /* 回傳「英英定義＋搭配詞」的 HTML 區塊；無資料回空字串 */
  function block(word) {
    const e = get(word);
    if (!e || (!e.def_en && !(e.collo && e.collo.length))) return '';
    const def = e.def_en ? `<div class="en-def">📘 ${e.def_en}</div>` : '';
    const col = (e.collo && e.collo.length)
      ? `<div class="en-collo">${e.collo.map(c => `<span class="en-chip">${c}</span>`).join('')}</div>` : '';
    return `<div class="en-deep">${def}${col}</div>`;
  }

  return { ensure, get, block };
})();
window.VDEnrich = VDEnrich;
