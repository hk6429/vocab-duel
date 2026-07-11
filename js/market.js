/* 裝備市場 VDMarket：全站掛單交易（只交易裝備，寵物不賣）。
   上架＝從背包挑一件＋定價（各階有價格帶）；買到直接進背包；賣出領貨款抽 10% 稅。
   claimKey 存本機 vd_market_claims，憑券下架／領款。 */
const VDMarket = (() => {
  const CKEY = 'vd_market_claims';
  const BAND = { common: [10, 50], rare: [40, 200], legendary: [150, 800] };
  const TIER_N = { common: '普通', rare: '稀有', legendary: '傳說' };
  let el = null;

  const claims = () => { try { return JSON.parse(localStorage.getItem(CKEY)) || []; } catch { return []; } };
  const saveClaims = (c) => localStorage.setItem(CKEY, JSON.stringify(c));

  async function api(body) {
    try {
      const r = await fetch('api/market', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return await r.json();
    } catch { return null; }
  }

  const itemLine = (it) => `${it.ico} ${it.name}　${it.atk ? '⚔️+' + it.atk : '❤️+' + it.hp}${it.perk ? '・' + VDPets.PERKS[it.perk].ico + VDPets.PERKS[it.perk].name : ''}`;

  async function render(container) {
    el = container;
    el.innerHTML = '<div class="loading">開市中…</div>';
    await VDPets.init();
    const r = await api({ op: 'list' });
    if (!r) {
      el.innerHTML = `<div class="card-done"><div class="big">📡</div><p>連不上市場伺服器（本機模式沒有後端）。</p>
        <button class="btn ghost" onclick="VDApp.go('petbattle')">← 回競技場</button></div>`;
      return;
    }
    const list = (r.list || []);
    const myClaims = claims();
    el.innerHTML = `
      <div class="wc-card">
        <div class="wc-card-body">
          <div class="hero-sec">🏪 裝備市場　<b class="shop-wallet">💰 ${VDGame.raw.coins}</b></div>
          <div class="pg-hint">寵物是夥伴不是商品——市場只交易裝備。每日限購 3 件，成交抽 10% 稅。</div>
          ${list.length ? `<div class="mk-list">${list.map(x => `
            <div class="shop-item">
              <span class="shop-body">
                <span class="shop-name">${itemLine(x.item)}</span>
                <span class="shop-desc">賣家：${x.seller}</span>
              </span>
              <button class="btn sm" data-buy="${x.id}" data-p="${x.price}">🪙 ${x.price}</button>
            </div>`).join('')}</div>` : '<div class="pg-hint">市場空空——當第一個上架的人！</div>'}

          <div class="pg-sub">📤 我要上架（從背包挑一件）</div>
          <div id="mk-sell"></div>

          ${myClaims.length ? `<div class="pg-sub">🧾 我的掛單</div>
          <div id="mk-mine">${myClaims.map((c, i) => `
            <div class="shop-item">
              <span class="shop-body">
                <span class="shop-name">${itemLine(c.item)}　🪙 ${c.price}</span>
                <span class="shop-desc" id="mk-st-${i}">狀態未知——按檢查</span>
              </span>
              <button class="btn sm ghost" data-chk="${i}">檢查</button>
            </div>`).join('')}</div>` : ''}
        </div>
      </div>
      <button class="btn ghost" onclick="VDApp.go('petbattle')">← 回競技場</button>`;
    renderSell();
    bind();
  }

  function renderSell() {
    const box = el.querySelector('#mk-sell');
    const bag = VDPets.bag();
    if (!bag.length) { box.innerHTML = '<div class="pg-hint">背包沒有裝備——先去野生試煉打寶。</div>'; return; }
    box.innerHTML = `
      <div class="pet-equips">${bag.map((it, i) => `
        <button class="pet-eq t-${it.tier} mk-pick" data-i="${i}">${it.ico} ${it.name}<i>${it.atk ? '⚔️+' + it.atk : '❤️+' + it.hp}</i></button>`).join('')}
      </div>
      <div class="pet-actrow" id="mk-price-row" hidden>
        <span class="pg-hint" id="mk-band"></span>
        <input class="rt-join-in" id="mk-price" inputmode="numeric" placeholder="定價">
        <button class="btn small" id="mk-post">上架</button>
      </div>`;
    let picked = -1;
    box.querySelectorAll('.mk-pick').forEach(b => {
      b.onclick = () => {
        picked = +b.dataset.i;
        box.querySelectorAll('.mk-pick').forEach(x => x.classList.remove('sel'));
        b.classList.add('sel');
        const it = VDPets.bag()[picked];
        const [lo, hi] = BAND[it.tier];
        const row = box.querySelector('#mk-price-row');
        row.hidden = false;
        box.querySelector('#mk-band').textContent = `${TIER_N[it.tier]}價格帶 ${lo}–${hi}`;
        box.querySelector('#mk-price').value = lo;
      };
    });
    box.querySelector('#mk-post') && (box.querySelector('#mk-post').onclick = async () => {
      if (picked < 0) return;
      const it = VDPets.bag()[picked];
      const price = Math.round(+box.querySelector('#mk-price').value || 0);
      const r = await api({ op: 'post', item: it, price, seller: VDGame.heroName() });
      if (!r || !r.ok) return VDGame.toast(r ? r.error : '連線失敗');
      VDPets.dropBag(picked);
      const c = claims(); c.push({ id: r.id, claimKey: r.claimKey, item: it, price }); saveClaims(c);
      VDGame.toast('📤 已上架！賣出後回來領貨款');
      render(el);
    });
  }

  function bind() {
    el.querySelectorAll('[data-buy]').forEach(b => {
      b.onclick = async () => {
        const price = +b.dataset.p;
        if (VDGame.raw.coins < price) return VDGame.toast(`字幣不足，還差 ${price - VDGame.raw.coins}`);
        const r = await api({ op: 'buy', id: b.dataset.buy, nick: VDGame.heroName(), haggle: 1 });
        if (!r || !r.ok) return VDGame.toast(r ? r.error : '連線失敗');
        VDGame.raw.coins -= r.price;
        localStorage.setItem('vd_game', JSON.stringify(VDGame.raw));
        const add = VDPets.addToBag(r.item);
        const cut = r.disc ? `殺價成功 −${r.disc}%，只花 ${r.price}！` : '';
        VDGame.toast(add.ok ? `🎉 買到 ${r.item.name}！${cut}已入背包` : `買到了，但${add.msg}`);
        render(el);
      };
    });
    el.querySelectorAll('[data-chk]').forEach(b => {
      b.onclick = async () => {
        const i = +b.dataset.chk;
        const c = claims()[i];
        const st = el.querySelector(`#mk-st-${i}`);
        const r = await api({ op: 'claim', id: c.id, claimKey: c.claimKey });
        if (!r) return VDGame.toast('連線失敗');
        if (r.ok) {
          VDGame.raw.coins += r.coins;
          localStorage.setItem('vd_game', JSON.stringify(VDGame.raw));
          const cs = claims(); cs.splice(i, 1); saveClaims(cs);
          VDGame.toast(`💰 賣出！扣稅後入帳 ${r.coins} 字幣`);
          render(el);
        } else if (r.sold === 0) {
          st.textContent = '還沒賣出';
          st.insertAdjacentHTML('beforeend', `　<button class="btn small ghost" id="mk-cxl-${i}">下架拿回</button>`);
          el.querySelector(`#mk-cxl-${i}`).onclick = async () => {
            const r2 = await api({ op: 'cancel', id: c.id, claimKey: c.claimKey });
            if (!r2 || !r2.ok) return VDGame.toast(r2 ? r2.error : '連線失敗');
            VDPets.addToBag(r2.item);
            const cs = claims(); cs.splice(i, 1); saveClaims(cs);
            VDGame.toast('已下架，裝備回背包');
            render(el);
          };
        } else {
          st.textContent = r.error || '狀態異常';
          if ((r.error || '').includes('找不到') || (r.error || '').includes('領過')) {
            const cs = claims(); cs.splice(i, 1); saveClaims(cs);
          }
        }
      };
    });
  }

  return { render };
})();
window.VDMarket = VDMarket;
