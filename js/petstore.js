/* 詞靈純邏輯層 VDPets：狀態(vd_pets)、詞源之力、屬性/經濟計算、裝備、積分。零 DOM。 */
const VDPets = (() => {
  const KEY = 'vd_pets';
  const KIND = { p: 'prefixes', s: 'suffixes', r: 'roots' };
  const SLOTS = ['weapon', 'armor', 'trinket', 'crest'];
  const SLOT_NAME = { weapon: '武器', armor: '護甲', trinket: '飾品', crest: '紋章' };
  const TIER_RANGE = { common: [2, 4], rare: [5, 8], legendary: [10, 15] };
  const DECOS = ['', '🎀', '👑', '🧣', '👓', '🌸', '⭐'];
  const MAX_LV = 25;

  let data = null;   // pets.json
  let affixData = null;
  let g = null;      // 玩家狀態
  let wordsOfPet = {};   // petId → Set(word)：家族全部單字（小寫）

  const DEFAULT = () => ({ owned: {}, active: '', rating: 0, wildFloor: 1 });

  function load() {
    try { g = Object.assign(DEFAULT(), JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch { g = DEFAULT(); }
  }
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
  const ownedCount = () => Object.keys(g.owned).length;
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
  let _seed = 13;
  function rand() { _seed = (_seed * 9301 + 49297 + (VDGame.raw.xp || 0)) % 233280; return _seed / 233280; }
  const POOL = {
    weapon: ['羽毫劍', '斷句斧', '音節弓', '詞鋒匕'], armor: ['紙鎧', '墨紋盾甲', '綴皮氅', '疊字重甲'],
    trinket: ['字符鈴', '綴玉墜', '詞露瓶', '音標戒'], crest: ['字首紋章', '字尾徽記', '字根圖騰', '詞源印']
  };
  function rollDrop(tier) {
    const slot = SLOTS[Math.floor(rand() * SLOTS.length)];
    const [lo, hi] = TIER_RANGE[tier] || TIER_RANGE.common;
    const v = lo + Math.floor(rand() * (hi - lo + 1));
    const isAtk = slot === 'weapon' || slot === 'crest' ? true : slot === 'armor' ? false : rand() < 0.5;
    const names = POOL[slot];
    return {
      slot, tier, name: `${tier === 'legendary' ? '傳說' : tier === 'rare' ? '稀有' : ''}${names[Math.floor(rand() * names.length)]}`,
      ico: { weapon: '⚔️', armor: '🛡️', trinket: '📿', crest: '🏵️' }[slot],
      atk: isAtk ? v : 0, hp: isAtk ? 0 : v * 3
    };
  }
  function equip(id, item) {
    const o = g.owned[id];
    if (!o) return false;
    o.equip[item.slot] = item; save(); return true;
  }
  function unequip(id, slot) {
    const o = g.owned[id];
    if (o && o.equip[slot]) { delete o.equip[slot]; save(); return true; }
    return false;
  }

  /* ── 技能／裝飾／出戰 ── */
  const SKILL_LV = [5, 12, 20];
  function skillsOf(id) {
    const def = data.pets.find(p => p.id === id);
    if (!def) return [];
    return def.skills.map((s, i) => ({ id: s, ...data.skills[s], needLv: SKILL_LV[i], unlocked: lvOf(id) >= SKILL_LV[i] }));
  }
  function setDeco(id, deco) { if (g.owned[id] && DECOS.includes(deco)) { g.owned[id].deco = deco; save(); } }
  function setActive(id) { if (g.owned[id]) { g.active = id; save(); } }
  const active = () => g.active && g.owned[g.active] ? g.active : '';

  /* ── 清單 ── */
  function list() {
    return data.pets.map(p => {
      const o = g.owned[p.id];
      return {
        ...p, owned: !!o, lv: o ? o.lv : 0, stage: o ? stageOf(o.lv) : 1,
        power: power(p.id), atk: o ? atk(p.id) : 0, hp: o ? hp(p.id) : 0,
        equip: o ? o.equip : {}, deco: o ? o.deco : '', isActive: g.active === p.id
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
  function petWin() { g.rating += 20; save(); return g.rating; }
  function petLose() { g.rating = Math.max(0, g.rating - 10); save(); return g.rating; }
  function clearWild(floor) { if (floor === g.wildFloor && floor < 10) { g.wildFloor = floor + 1; save(); } }

  function snapshot() {
    const id = active();
    if (!id) return null;
    return {
      nick: VDGame.heroName(), petId: id, petName: (data.pets.find(p => p.id === id) || {}).name,
      lv: lvOf(id), atk: atk(id), hp: hp(id),
      skills: skillsOf(id).filter(s => s.unlocked).map(s => s.id), rating: g.rating
    };
  }

  return {
    init, list, adopt, adoptCost, levelUp, levelCost, power, familyStats, atk, hp, stageOf, lvOf,
    rollDrop, equip, unequip, skillsOf, setDeco, setActive, active, DECOS, SLOTS, SLOT_NAME,
    affixStats, topAffixes, weakAffixes,
    petWin, petLose, get rating() { return g.rating; }, get wildFloor() { return g.wildFloor; }, clearWild,
    snapshot, wordsOf: id => wordsOfPet[id] || new Set(),
    def: id => data ? data.pets.find(p => p.id === id) : null,
    wild: () => data.wild, MAX_LV
  };
})();
window.VDPets = VDPets;
