/* 字幣商店：字幣的消費出口——頭像框（永久＋可裝備）與消耗品（護盾／復活羽毛） */
const VDShop = (() => {
  let el = null;

  function render(container) {
    el = container;
    const g = VDGame;
    const items = g.SHOP.map(it => {
      const owned = it.kind === 'frame' && g.owned.includes(it.id);
      const equipped = owned && g.frame === it.id;
      const count = it.id === 'shield' ? g.shield : it.id === 'revive' ? g.revive : 0;
      let action;
      if (equipped) action = '<span class="shop-tag on">已裝備</span>';
      else if (owned) action = `<button class="btn ghost sm" data-equip="${it.id}">裝備</button>`;
      else action = `<button class="btn sm" data-buy="${it.id}">🪙 ${it.price}</button>`;
      return `<div class="shop-item ${owned ? 'owned' : ''}">
        <span class="shop-ico ${it.kind === 'frame' ? 'fr-' + it.id : ''}"><img class="shop-ico-img" src="img/ui/shop_${it.id}.png" alt="" onerror="this.replaceWith(document.createTextNode('${it.ico}'))"></span>
        <span class="shop-body">
          <span class="shop-name">${it.name}${count ? `　<b class="shop-count">×${count}</b>` : ''}</span>
          <span class="shop-desc">${it.desc}</span>
        </span>
        ${action}
      </div>`;
    }).join('');
    el.innerHTML = `
      <div class="wc-card">
        <img class="wc-card-img" src="img/ui/h_shop.png" alt="" onerror="this.remove()">
        <div class="wc-card-body">
          <div class="hero-sec">字幣商店　<b class="shop-wallet">🪙 ${g.coins}</b></div>
          <div class="shop-list">${items}</div>
          <div class="hero-shieldhint">頭像框買一次永久擁有；護盾與羽毛是消耗品，用掉再補。</div>
          ${g.frame ? '<button class="btn ghost sm" id="unframe">卸下頭像框</button>' : ''}
        </div>
      </div>
      ${VDGame.milestoneHtml()}
      <button class="btn ghost wide" onclick="VDApp.go('menu')">回主選單</button>`;
    el.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
      const r = VDGame.buy(b.dataset.buy);
      if (!r.ok) VDGame.toast(`💰 ${r.msg}`);
      render(el);
    });
    el.querySelectorAll('[data-equip]').forEach(b => b.onclick = () => { VDGame.setFrame(b.dataset.equip); render(el); });
    const un = el.querySelector('#unframe');
    if (un) un.onclick = () => { VDGame.setFrame(''); render(el); };
  }

  return { render };
})();
window.VDShop = VDShop;
