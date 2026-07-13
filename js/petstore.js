/* 詞靈純邏輯層 VDPets：狀態(vd_pets)、詞源之力、屬性/經濟計算、裝備、積分。零 DOM。 */
const VDPets = (() => {
  const KEY = 'vd_pets';
  const KIND = { p: 'prefixes', s: 'suffixes', r: 'roots' };
  const SLOTS = ['weapon', 'armor', 'trinket', 'crest'];
  const SLOT_NAME = { weapon: '武器', armor: '護甲', trinket: '飾品', crest: '紋章' };
  /* 裝備階梯：傳說之上再加 10 階，越高階數值放大越多、鍛造也越難（見 forgeReq） */
  const TIERS = ['common', 'rare', 'legendary', 'mythic', 'celestial', 'emperor', 'eternal', 'genesis', 'stellar', 'cosmic', 'primordial', 'transcendent', 'supreme'];
  const TIER_NAME = ['普通', '稀有', '傳說', '神話', '天位', '帝皇', '永恆', '創世', '星辰', '宇宙', '太初', '超凡', '至尊'];
  const TIER_ICO = ['🎁', '💠', '👑', '🔮', '🌠', '🐲', '♾️', '🌋', '✨', '🌌', '🌑', '🕊️', '🏆'];
  const TIER_RANGE = (() => {
    const out = { common: [2, 4], rare: [5, 8], legendary: [10, 15] };
    let [lo, hi] = out.legendary;
    for (let i = 3; i < TIERS.length; i++) { lo = Math.round(lo * 1.8); hi = Math.round(hi * 1.8); out[TIERS[i]] = [lo, hi]; }
    return out;
  })();
  const tierIdx = t => TIERS.indexOf(t);
  const tierName = t => TIER_NAME[tierIdx(t)] || '';
  const tierUp = t => { const i = tierIdx(t); return i >= 0 && i < TIERS.length - 1 ? TIERS[i + 1] : t; };
  /* 鍛造門檻：目標階序位 step=1(稀有)…12(至尊)；材料件數 4→15、成功率傳說以下必成、之後遞減到 20%、字幣成本每階倍增以上 */
  function forgeReq(tier) {
    const step = tierIdx(tier) + 1;
    if (step <= 0 || step >= TIERS.length) return null;
    const items = 3 + step;
    const chance = step <= 2 ? 1 : Math.max(0.2, 0.9 - 0.07 * (step - 2));
    const cost = step === 1 ? 50 : step === 2 ? 150 : Math.round(300 * Math.pow(1.85, step - 3) / 10) * 10;
    return { items, chance: Math.round(chance * 100) / 100, cost, into: TIERS[step] };
  }
  const DECOS = ['', '🎀', '👑', '🧣', '👓', '🌸', '⭐'];
  const MAX_LV = 25;
  /* 背包容量：20 件起，花字幣一階一階擴充到 500 件（25 階） */
  const BAG_STEP = 20, BAG_LV_MAX = 24;
  const bagMax = () => BAG_STEP * ((g.bagLv || 0) + 1);
  function bagUpgradeCost() {
    const lv = g.bagLv || 0;
    return lv >= BAG_LV_MAX ? null : 80 + lv * 60;
  }
  function upgradeBag() {
    const cost = bagUpgradeCost();
    if (cost == null) return { ok: false, msg: '背包已是最大容量' };
    if (VDGame.raw.coins < cost) return { ok: false, msg: `字幣不足，需要 ${cost}` };
    VDGame.raw.coins -= cost;
    localStorage.setItem('vd_game', JSON.stringify(VDGame.raw));
    g.bagLv = (g.bagLv || 0) + 1;
    save();
    return { ok: true, max: bagMax() };
  }

  let data = null;   // pets.json
  let affixData = null;
  let g = null;      // 玩家狀態
  let wordsOfPet = {};   // petId → Set(word)：家族全部單字（小寫）

  const DEFAULT = () => ({ owned: {}, active: '', rating: 0, wildFloor: 1, bag: [], eqdex: {}, fusions: [], seed: 13, bagLv: 0 });

  function load() {
    try { g = Object.assign(DEFAULT(), JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch { g = DEFAULT(); }
    if (!Array.isArray(g.bag)) g.bag = [];
    if (!g.eqdex || typeof g.eqdex !== 'object') g.eqdex = {};
    if (!Array.isArray(g.fusions)) g.fusions = [];
    // 舊存檔容錯：lifetime（累計勝場積分，只增不減）用 rating 與城鎮已兌換積分較大者補齊，避免老玩家兌換權縮水
    if (typeof g.lifetime !== 'number') {
      let redeemed = 0;
      try { redeemed = (JSON.parse(localStorage.getItem('vd_town')) || {}).redeemedRating || 0; } catch { /* 無城鎮存檔 */ }
      g.lifetime = Math.max(g.rating || 0, redeemed);
    }
  }
  load(); // 同步先載：perk 查詢（閃卡/衝刺/錯題）不必等 init
  const save = () => localStorage.setItem(KEY, JSON.stringify(g));

  async function init() {
    if (data) return;
    load();
    [data, affixData] = await Promise.all([
      (await fetch('data/pets.json')).json(),
      (await fetch('data/affixes.json')).json()
    ]);
    // 預計算每寵家族單字集合（同 form 的重複條目一併納入）
    for (const p of data.pets) {
      const set = new Set();
      for (const a of p.affixes)
        for (const ax of affixData[KIND[a.k]].filter(x => x.form === a.f))
          for (const m of ax.members) set.add(m.toLowerCase());
      wordsOfPet[p.id] = set;
    }
    // 幼靈家族＝雙親聯集
    for (const f of g.fusions) rebuildFusionWords(f);
  }
  function rebuildFusionWords(f) {
    const set = new Set();
    for (const pid of f.parents) for (const w of (wordsOfPet[pid] || [])) set.add(w);
    wordsOfPet[f.id] = set;
  }

  /* ── 詞源之力：家族已學字比例（box>=0 算已學） ── */
  function power(id) {
    const set = wordsOfPet[id];
    if (!set || !set.size) return 0;
    let learned = 0;
    for (const w of set) if (VDStore.box(w) >= 0) learned++;
    return learned / set.size;
  }
  function familyStats(id) {
    const set = wordsOfPet[id] || new Set();
    let learned = 0, mastered = 0;
    for (const w of set) { const b = VDStore.box(w); if (b >= 0) learned++; if (b >= 3) mastered++; }
    return { learned, mastered, total: set.size };
  }

  /* ── 屬性 ── */
  const stageOf = lv => lv >= MAX_LV ? 3 : lv >= 10 ? 2 : 1;
  function equipSum(id, key) {
    const eq = (g.owned[id] || {}).equip || {};
    return SLOTS.reduce((s, sl) => s + ((eq[sl] || {})[key] || 0), 0);
  }
  const lvOf = id => (g.owned[id] || {}).lv || 0;
  const atk = id => Math.round((10 + 2 * lvOf(id)) * (1 + power(id))) + equipSum(id, 'atk');
  const hp = id => 100 + 6 * lvOf(id) + equipSum(id, 'hp');

  /* ── 領養／升級（花字幣，走 VDGame.raw 直接扣） ── */
  const ownedCount = () => data
    ? data.pets.filter(p => g.owned[p.id]).length
    : Object.keys(g.owned).filter(id => !id.startsWith('fu_')).length;
  const adoptCost = () => ownedCount() === 0 ? 0 : 100 + 50 * (ownedCount() - 1);
  function adopt(id) {
    if (g.owned[id]) return { ok: false, msg: '已領養' };
    if (!data.pets.some(p => p.id === id)) return { ok: false, msg: '沒有這隻詞靈' };
    const cost = adoptCost();
    if (VDGame.raw.coins < cost) return { ok: false, msg: `字幣不足，需要 ${cost}` };
    VDGame.raw.coins -= cost;
    g.owned[id] = { lv: 1, equip: {}, deco: '' };
    if (!g.active) g.active = id;
    save(); localStorage.setItem('vd_game', JSON.stringify(VDGame.raw));
    return { ok: true, cost };
  }
  const levelCost = lv => 20 + 10 * lv;
  function levelUp(id) {
    const o = g.owned[id];
    if (!o) return { ok: false, msg: '尚未領養' };
    if (o.lv >= MAX_LV) return { ok: false, msg: '已滿級' };
    // 學習門檻：詞源之力（家族已學比例）要跟得上等級——升級的正道是學字
    const pw = Math.round(power(id) * 100), need = o.lv * 3;
    if (pw < need) return { ok: false, needStudy: true, msg: `先學會這家族更多字（現在 ${pw}%，需要 ${need}%）` };
    const cost = levelCost(o.lv);
    if (VDGame.raw.coins < cost) return { ok: false, msg: `字幣不足，需要 ${cost}` };
    const before = stageOf(o.lv);
    VDGame.raw.coins -= cost;
    o.lv++;
    save(); localStorage.setItem('vd_game', JSON.stringify(VDGame.raw));
    const after = stageOf(o.lv);
    return { ok: true, lv: o.lv, evolved: after > before ? after : 0 };
  }

  /* ── 裝備 ── */
  /* 偽隨機 seed 併入 g 持久化（比照 vd_game 的 seed 做法）——重整不重置，杜絕刷裝備/鍛造 */
  function rand() {
    if (typeof g.seed !== 'number') g.seed = 13;
    g.seed = (g.seed * 9301 + 49297 + (VDGame.raw.xp || 0)) % 233280;
    save();
    return g.seed / 233280;
  }
  const POOL = {
    weapon: ['羽毫劍', '斷句斧', '音節弓', '詞鋒匕'], armor: ['紙鎧', '墨紋盾甲', '綴皮氅', '疊字重甲'],
    trinket: ['字符鈴', '綴玉墜', '詞露瓶', '音標戒'], crest: ['字首紋章', '字尾徽記', '字根圖騰', '詞源印']
  };
  /* 學習詞條：稀有 50%／傳說必帶一條，掛在出戰詞靈身上全站生效 */
  const PERKS = {
    xp10: { ico: '✨', name: '閃卡 XP +10%' },
    sprint5: { ico: '⏱️', name: '衝刺 +5 秒' },
    wrong2: { ico: '🩹', name: '錯題複習字幣 ×2' }
  };
  function rollDrop(tier) {
    const slot = SLOTS[Math.floor(rand() * SLOTS.length)];
    const [lo, hi] = TIER_RANGE[tier] || TIER_RANGE.common;
    const v = lo + Math.floor(rand() * (hi - lo + 1));
    const isAtk = slot === 'weapon' || slot === 'crest' ? true : slot === 'armor' ? false : rand() < 0.5;
    const names = POOL[slot];
    const base = names[Math.floor(rand() * names.length)];
    const idx = tierIdx(tier);
    let perk = '';
    if (idx >= 2 || (idx === 1 && rand() < 0.5)) {
      const keys = Object.keys(PERKS);
      perk = keys[Math.floor(rand() * keys.length)];
    }
    return {
      slot, tier, base, name: `${idx > 0 ? tierName(tier) : ''}${base}`,
      ico: { weapon: '⚔️', armor: '🛡️', trinket: '📿', crest: '🏵️' }[slot],
      atk: isAtk ? v : 0, hp: isAtk ? 0 : v * 3, perk
    };
  }
  function equip(id, item) {
    const o = g.owned[id];
    if (!o) return false;
    recordDex(item);
    o.equip[item.slot] = item; save(); return true;
  }
  function unequip(id, slot) {
    const o = g.owned[id];
    if (!o || !o.equip[slot]) return { ok: false, msg: '沒有裝備' };
    if (g.bag.length >= bagMax()) return { ok: false, msg: `背包滿了（上限 ${bagMax()} 件），放不下` };
    g.bag.push(o.equip[slot]); delete o.equip[slot]; save();
    return { ok: true };
  }

  /* ── 背包／鍛造／裝備圖鑑 ── */
  function recordDex(item) { g.eqdex[`${item.tier}:${item.base || item.name}`] = 1; }
  function addToBag(item) {
    recordDex(item);
    if (g.bag.length >= bagMax()) { save(); return { ok: false, msg: `背包滿了（上限 ${bagMax()} 件）——先鍛造或丟棄` }; }
    g.bag.push(item); save(); return { ok: true };
  }
  const bag = () => g.bag.slice();
  function dropBag(i) { if (g.bag[i]) { g.bag.splice(i, 1); save(); return true; } return false; }
  function forge(idxs) {
    if (!Array.isArray(idxs) || !idxs.length) return { ok: false, msg: '請選裝備' };
    const items = idxs.map(i => g.bag[i]);
    if (items.some(x => !x)) return { ok: false, msg: '裝備不存在' };
    const tier = items[0].tier;
    if (!items.every(x => x.tier === tier)) return { ok: false, msg: '必須同一階' };
    const req = forgeReq(tier);
    if (!req) return { ok: false, msg: `${tierName(tier)}裝備已是最高階` };
    if (new Set(idxs).size !== req.items) return { ok: false, msg: `要選 ${req.items} 件同階裝備` };
    if (VDGame.raw.coins < req.cost) return { ok: false, msg: `字幣不足，鍛造需要 ${req.cost}` };
    VDGame.raw.coins -= req.cost;
    localStorage.setItem('vd_game', JSON.stringify(VDGame.raw));
    [...idxs].sort((a, b) => b - a).forEach(i => g.bag.splice(i, 1));
    const success = rand() < req.chance;
    save();
    if (!success) return { ok: true, failed: true, msg: `鍛造失敗……${req.items} 件材料與 ${req.cost} 字幣付諸流水，再接再厲！` };
    const item = rollDrop(req.into);
    recordDex(item);
    g.bag.push(item); save();
    return { ok: true, item };
  }
  function equipFromBag(id, i) {
    const o = g.owned[id], item = g.bag[i];
    if (!o || !item) return { ok: false, msg: '無法裝備' };
    g.bag.splice(i, 1);
    const prev = o.equip[item.slot];
    o.equip[item.slot] = item;
    if (prev) g.bag.push(prev);
    save(); return { ok: true, prev };
  }
  function eqDex() {
    const out = [];
    for (const tier of TIERS)
      for (const slot of SLOTS)
        for (const base of POOL[slot])
          out.push({ tier, slot, base, ico: { weapon: '⚔️', armor: '🛡️', trinket: '📿', crest: '🏵️' }[slot], got: !!g.eqdex[`${tier}:${base}`] });
    return out;
  }
  function hasPerk(p) {
    const id = active();
    if (!id) return false;
    const eq = (g.owned[id] || {}).equip || {};
    return SLOTS.some(sl => (eq[sl] || {}).perk === p);
  }
  function activePerks() {
    const id = active(); if (!id) return [];
    const eq = (g.owned[id] || {}).equip || {};
    return SLOTS.map(sl => (eq[sl] || {}).perk).filter(Boolean).map(p => ({ id: p, ...PERKS[p] }));
  }
  /* 文學家對戰助戰：出戰詞靈追擊 atk/10、leech 技能解鎖再回 3 血 */
  function assist() {
    const id = active();
    if (!id || !data) return null;
    const def = data.pets.find(p => p.id === id);
    if (!def) return null;
    return {
      id, name: def.name, ico: def.ico,
      atk: Math.max(1, Math.round(atk(id) / 10)),
      leech: skillsOf(id).some(s => s.unlocked && s.id === 'leech') ? 3 : 0
    };
  }

  /* ── 技能／裝飾／出戰 ── */
  const SKILL_LV = [5, 12, 20];
  function skillsOf(id) {
    const def = petDef(id);
    if (!def) return [];
    return def.skills.map((s, i) => ({ id: s, ...data.skills[s], needLv: SKILL_LV[i], unlocked: lvOf(id) >= SKILL_LV[i] }));
  }
  /* 通用定義查找：一般寵走 data.pets、幼靈走 g.fusions 合成 */
  function petDef(id) {
    if (!data) return null;
    const base = data.pets.find(p => p.id === id);
    if (base) return base;
    const f = g.fusions.find(x => x.id === id);
    if (!f) return null;
    const pa = data.pets.find(p => p.id === f.parents[0]) || {};
    const pb = data.pets.find(p => p.id === f.parents[1]) || {};
    return {
      id: f.id, name: f.name, ico: '🐣', skills: f.skills,
      theme: `${pa.name || '?'}×${pb.name || '?'} 的幼靈`,
      affixes: [...(pa.affixes || []), ...(pb.affixes || [])],
      parents: f.parents
    };
  }

  /* ── 詞源融合：兩隻滿級本體寵 → 幼靈（雙親降回 Lv15＋500 字幣，上限 3 隻） ── */
  const FUSE_COST = 500, FUSE_MAX = 3, FUSE_PARENT_LV = 15;
  function canFuse() {
    if (!data || g.fusions.length >= FUSE_MAX) return [];
    return data.pets.filter(p => g.owned[p.id] && g.owned[p.id].lv >= MAX_LV).map(p => p.id);
  }
  function fuse(a, b, name, skills) {
    if (g.fusions.length >= FUSE_MAX) return { ok: false, msg: `幼靈最多 ${FUSE_MAX} 隻` };
    if (a === b) return { ok: false, msg: '要選兩隻不同的詞靈' };
    for (const id of [a, b]) {
      if (!data.pets.some(p => p.id === id)) return { ok: false, msg: '幼靈不能再融合' };
      if (!g.owned[id] || g.owned[id].lv < MAX_LV) return { ok: false, msg: '雙親都要滿級 Lv25' };
    }
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 4) return { ok: false, msg: '名字要 2–4 個字' };
    const pool = [...petDef(a).skills, ...petDef(b).skills];
    if (!Array.isArray(skills) || skills.length !== 3 || !skills.every(s => pool.includes(s)) || new Set(skills).size !== 3)
      return { ok: false, msg: '要從雙親 6 技中挑 3 個（不重複）' };
    if (VDGame.raw.coins < FUSE_COST) return { ok: false, msg: `字幣不足，需要 ${FUSE_COST}` };
    VDGame.raw.coins -= FUSE_COST;
    localStorage.setItem('vd_game', JSON.stringify(VDGame.raw));
    g.owned[a].lv = FUSE_PARENT_LV;
    g.owned[b].lv = FUSE_PARENT_LV;
    const fid = 'fu_' + (g.fusions.length + 1) + '_' + Date.now().toString(36);
    const meta = { id: fid, name: name.trim(), parents: [a, b], skills };
    g.fusions.push(meta);
    g.owned[fid] = { lv: 1, equip: {}, deco: '' };
    rebuildFusionWords(meta);
    save();
    return { ok: true, id: fid };
  }
  function setDeco(id, deco) { if (g.owned[id] && DECOS.includes(deco)) { g.owned[id].deco = deco; save(); } }
  function setActive(id) { if (g.owned[id]) { g.active = id; save(); } }
  const active = () => g.active && g.owned[g.active] ? g.active : '';

  /* ── 清單（本體 20 寵＋幼靈） ── */
  function list() {
    const defs = [...data.pets, ...g.fusions.map(f => petDef(f.id))];
    return defs.map(p => {
      const o = g.owned[p.id];
      return {
        ...p, owned: !!o, lv: o ? o.lv : 0, stage: o ? stageOf(o.lv) : 1,
        power: power(p.id), atk: o ? atk(p.id) : 0, hp: o ? hp(p.id) : 0,
        equip: o ? o.equip : {}, deco: o ? o.deco : '', isActive: g.active === p.id,
        isFusion: !!p.parents
      };
    });
  }

  /* ── 字綴統計（給星圖） ── */
  function affixStats() {
    const out = [];
    for (const p of data.pets) {
      for (const a of p.affixes) {
        for (const ax of affixData[KIND[a.k]].filter(x => x.form === a.f)) {
          let learned = 0;
          for (const m of ax.members) if (VDStore.box(m.toLowerCase()) >= 0) learned++;
          out.push({ form: ax.form, kind: a.k, meaning: ax.meaning, petId: p.id, petName: p.name, learned, total: ax.members.length, pct: ax.members.length ? learned / ax.members.length : 0, members: ax.members });
        }
      }
    }
    return out;
  }
  const topAffixes = n => affixStats().filter(a => a.learned > 0).sort((x, y) => y.pct - x.pct || y.learned - x.learned).slice(0, n);
  const weakAffixes = n => affixStats().sort((x, y) => x.pct - y.pct || y.total - x.total).slice(0, n);

  /* ── 競技積分／野生進度 ── */
  function petWin() { g.rating += 20; g.lifetime = (g.lifetime || 0) + 20; save(); return g.rating; }
  function petLose() { g.rating = Math.max(0, g.rating - 10); save(); return g.rating; }
  function clearWild(floor) { if (floor === g.wildFloor) { g.wildFloor = floor + 1; save(); } } // 無限爬塔：不封頂

  function snapshot() {
    const id = active();
    if (!id) return null;
    return {
      nick: VDGame.heroName(), petId: id, petName: (petDef(id) || {}).name,
      lv: lvOf(id), atk: atk(id), hp: hp(id),
      skills: skillsOf(id).filter(s => s.unlocked).map(s => s.id), rating: g.rating
    };
  }

  /* 把目前出戰寵快照＋積分推上配對池與全站排行榜（離線不阻斷）。
     所有會動到 rating 的對戰模式（影子／即時）結算後都該呼叫，否則積分只留在本機、上不了榜。 */
  async function submitBoard() {
    const snap = snapshot();
    if (!snap) return;
    try {
      await fetch('api/pets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'submit', snap })
      });
    } catch { /* 離線不阻斷 */ }
  }

  return {
    init, list, adopt, adoptCost, levelUp, levelCost, power, familyStats, atk, hp, stageOf, lvOf,
    rollDrop, equip, unequip, skillsOf, setDeco, setActive, active, DECOS, SLOTS, SLOT_NAME,
    PERKS, hasPerk, activePerks, assist, bag, addToBag, dropBag, forge, forgeReq, equipFromBag, eqDex,
    bagMax, bagUpgradeCost, upgradeBag,
    TIERS, TIER_NAME, TIER_ICO, tierIdx, tierName, tierUp,
    affixStats, topAffixes, weakAffixes,
    petWin, petLose, get rating() { return g.rating; }, get wildFloor() { return g.wildFloor; }, clearWild,
    lifetime: () => g.lifetime || 0,
    snapshot, submitBoard, wordsOf: id => wordsOfPet[id] || new Set(),
    def: petDef, canFuse, fuse, FUSE_COST, FUSE_MAX,
    fusions: () => g.fusions.slice(),
    wild: () => data.wild, MAX_LV
  };
})();
window.VDPets = VDPets;
