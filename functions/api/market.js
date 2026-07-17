// 裝備市場 — 全站掛單制。寵物不可交易，只交易裝備。
// 防作弊：上架時伺服器驗數值區間＋HMAC 簽章（金鑰＝CF Pages secret MARKET_SECRET）；
//        賣家憑上架時發的 claimKey 領貨款／下架；買家每日限購 3 件；成交抽 10% 稅。
// POST { op:'list' }                              → 市場前 50 筆（價格低→高）
// POST { op:'post', item, price, seller, reserveFor? } → 上架（可保留給指定同學），回 { id, claimKey }
// POST { op:'buy', id, nick }                     → 購買，回 { item }
// POST { op:'cancel', id, claimKey }              → 下架，回 { item }
// POST { op:'claim', id, claimKey }               → 已售出的掛單領貨款，回 { coins, buyer }
import { redisFor, vercelToPages } from "./_redis.js";
import { createHmac, randomBytes } from "node:crypto";
let redis;

const ZKEY = "vd:market";
const ITEM = (id) => `vd:market:item:${id}`;
const BUYS = (nick) => `vd:market:buys:${nick}:${new Date().toISOString().slice(0, 10)}`;
const ITEM_TTL = 7 * 86400;   // 掛單／貨款保留 7 天
const DAILY_BUY_CAP = 3;
const TAX = 0.1;

// 裝備階梯：與前端 js/petstore.js 的 TIERS/TIER_RANGE 同步，傳說之上再 10 階，數值與價格逐階放大
const TIERS = ["common", "rare", "legendary", "mythic", "celestial", "emperor", "eternal", "genesis", "stellar", "cosmic", "primordial", "transcendent", "supreme"];
const TIER_RANGE = (() => {
  const out = { common: [2, 4], rare: [5, 8], legendary: [10, 15] };
  let [lo, hi] = out.legendary;
  for (let i = 3; i < TIERS.length; i++) { lo = Math.round(lo * 1.8); hi = Math.round(hi * 1.8); out[TIERS[i]] = [lo, hi]; }
  return out;
})();
const PRICE_BAND = (() => {
  const out = { common: [15, 75], rare: [60, 300], legendary: [225, 1200] };
  let [lo, hi] = out.legendary;
  for (let i = 3; i < TIERS.length; i++) { lo = Math.round(lo * 1.9); hi = Math.round(hi * 1.9); out[TIERS[i]] = [lo, hi]; }
  return out;
})();
const TIER_NAME = { common: "", rare: "稀有", legendary: "傳說", mythic: "神話", celestial: "天位", emperor: "帝皇", eternal: "永恆", genesis: "創世", stellar: "星辰", cosmic: "宇宙", primordial: "太初", transcendent: "超凡", supreme: "至尊" };
const SLOTS = ["weapon", "armor", "trinket", "crest"];
const POOL = {
  weapon: ["羽毫劍", "斷句斧", "音節弓", "詞鋒匕"], armor: ["紙鎧", "墨紋盾甲", "綴皮氅", "疊字重甲"],
  trinket: ["字符鈴", "綴玉墜", "詞露瓶", "音標戒"], crest: ["字首紋章", "字尾徽記", "字根圖騰", "詞源印"]
};
const PERKS = ["", "xp10", "sprint5", "wrong2"];

let SECRET = "vd";                        // 於 handler 內以 env.MARKET_SECRET 覆寫（CF Pages secret）
const secret = () => SECRET;
const sigOf = (item) => createHmac("sha256", secret()).update(JSON.stringify(item)).digest("hex").slice(0, 24);
const BAD_WORDS = /笨蛋|白癡|白痴|智障|廢物|去死|王八蛋|三小|幹你|靠北|媽的|滾蛋|垃圾|腦殘|廢咖|fuck|shit|bitch|asshole|idiot|stupid|retard/i; // 賣家/預留者暱稱在市場公開可見，擋常見髒話羞辱字眼
const okNick = (n) => typeof n === "string" && n.trim().length >= 1 && n.trim().length <= 12 && !/[<>&"']/.test(n) && !BAD_WORDS.test(n); // 拒收危險字元

// CORS 白名單：只回信任的來源，其餘退回主站
const ORIGINS = ["https://vocab-duel.vercel.app", "https://vocab-duel.pages.dev", "https://vocab-duel.netlify.app", "http://localhost:8765"];
const cors = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGINS.includes(req.headers.origin) ? req.headers.origin : ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
};

/* 上架驗貨：slot／名稱／數值／詞條都必須落在正版掉落範圍內，杜絕手改神裝 */
function cleanItem(it) {
  if (!it || !SLOTS.includes(it.slot) || !TIER_RANGE[it.tier]) return null;
  if (!POOL[it.slot].includes(it.base)) return null;
  if (!PERKS.includes(it.perk || "")) return null;
  const [lo, hi] = TIER_RANGE[it.tier];
  const atk = Math.round(Number(it.atk) || 0), hp = Math.round(Number(it.hp) || 0);
  const isAtk = atk > 0;
  if (isAtk && (hp !== 0 || atk < lo || atk > hi)) return null;
  if (!isAtk && (hp < lo * 3 || hp > hi * 3)) return null;
  const prefix = TIER_NAME[it.tier] || "";
  return {
    slot: it.slot, tier: it.tier, base: it.base, name: `${prefix}${it.base}`,
    ico: { weapon: "⚔️", armor: "🛡️", trinket: "📿", crest: "🏵️" }[it.slot],
    atk, hp, perk: it.perk || ""
  };
}

const parse = (x) => { try { return typeof x === "string" ? JSON.parse(x) : x; } catch { return null; } };

// zset member 的標準序列化：欄位順序固定，post／buy／cancel 三處都用它，zrem 才對得起來
const memberOf = (rec) => JSON.stringify(
  rec.reserveFor
    ? { id: rec.id, item: rec.item, seller: rec.seller, ts: rec.ts, reserveFor: rec.reserveFor }
    : { id: rec.id, item: rec.item, seller: rec.seller, ts: rec.ts }
);

// 輕量限流：每 IP 每 60 秒 30 次寫入，超過回 429
async function rateLimited(req, scope) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const k = `vd:rl:${scope}:${ip}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, 60);
  return n > 30;
}

async function handler(req, res, env) {
  redis = redisFor(env.DB);
  SECRET = env.MARKET_SECRET || SECRET;
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const { op } = req.body || {};
    // 寫入操作限流（list 為讀取不限）
    if (op !== "list" && (await rateLimited(req, "market"))) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });

    if (op === "list") {
      const raw = await redis.zrange(ZKEY, 0, 49, { withScores: true });
      const list = [];
      for (let i = 0; i < raw.length; i += 2) {
        const m = parse(raw[i]);
        if (m) list.push({ ...m, price: Math.round(Number(raw[i + 1]) || 0) });
      }
      return res.status(200).json({ ok: 1, list });
    }

    if (op === "post") {
      const item = cleanItem(req.body.item);
      const price = Math.round(Number(req.body.price) || 0);
      const seller = req.body.seller;
      if (!item) return res.status(200).json({ ok: 0, error: "裝備數值不合法" });
      if (!okNick(seller)) return res.status(200).json({ ok: 0, error: "暱稱不合法" });
      const [lo, hi] = PRICE_BAND[item.tier];
      if (price < lo || price > hi) return res.status(200).json({ ok: 0, error: `這一階定價要在 ${lo}–${hi} 字幣` });
      // 同賣家最多 3 筆掛單
      const raw = await redis.zrange(ZKEY, 0, 199);
      const mine = raw.map(parse).filter(x => x && x.seller === seller.trim());
      if (mine.length >= 3) return res.status(200).json({ ok: 0, error: "最多同時掛 3 件" });
      // 選填：保留給指定同學（淨化＋限長；填了只有這位暱稱買得走）
      let reserveFor = "";
      if (req.body.reserveFor != null && String(req.body.reserveFor).trim()) {
        if (!okNick(req.body.reserveFor)) return res.status(200).json({ ok: 0, error: "保留對象暱稱不合法" });
        reserveFor = String(req.body.reserveFor).trim().slice(0, 12);
      }
      const id = randomBytes(6).toString("hex");
      const claimKey = randomBytes(12).toString("hex");
      const entry = { id, item, seller: seller.trim(), ts: Date.now() };
      if (reserveFor) entry.reserveFor = reserveFor;
      // 簽章涵蓋整筆掛單（item＋price＋seller＋id），杜絕掉包
      const sig = sigOf({ item, price, seller: entry.seller, id });
      await redis.set(ITEM(id), JSON.stringify({ ...entry, price, claimKey, sig, sold: 0, claimed: 0 }), { ex: ITEM_TTL });
      await redis.zadd(ZKEY, { score: price, member: memberOf(entry) });
      return res.status(200).json({ ok: 1, id, claimKey });
    }

    if (op === "buy") {
      const { id, nick } = req.body;
      if (typeof id !== "string" || !okNick(nick)) return res.status(400).json({ error: "bad req" });
      const rec = parse(await redis.get(ITEM(id)));
      if (!rec || rec.sold) return res.status(200).json({ ok: 0, error: "這件已被買走或下架了" });
      if (rec.seller === nick.trim()) return res.status(200).json({ ok: 0, error: "不能買自己的掛單" });
      // 保留單：只有被指定的同學買得走（在計數前擋，不燒配額）
      if (rec.reserveFor && rec.reserveFor !== nick.trim())
        return res.status(200).json({ ok: 0, error: `這是保留給 ${rec.reserveFor} 的` });
      // 先驗新版全物件簽章，再退回舊版 item-only 簽章（相容既有掛單）
      const sigNew = sigOf({ item: rec.item, price: rec.price, seller: rec.seller, id: rec.id });
      if (sigNew !== rec.sig && sigOf(rec.item) !== rec.sig) return res.status(200).json({ ok: 0, error: "簽章不符，掛單作廢" });
      // 每日限購：所有驗證通過後才計數，買失敗不燒配額
      const buys = await redis.incr(BUYS(nick.trim()));
      if (buys === 1) await redis.expire(BUYS(nick.trim()), 86400);
      if (buys > DAILY_BUY_CAP) return res.status(200).json({ ok: 0, error: "每日限購 3 件（保護自己打寶的樂趣）" });
      // 殺價：由掛單 id 決定固定折扣 0/5/10/15%（不含暱稱，杜絕改名重抽）；賣家收款按折後價 ×0.9
      let disc = 0;
      if (req.body.haggle) {
        let h = 0;
        for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        disc = [0, 5, 10, 15][h % 4];
      }
      const finalPrice = Math.ceil(rec.price * (100 - disc) / 100);
      rec.sold = 1; rec.soldTs = Date.now(); rec.price = finalPrice; rec.buyer = nick.trim();
      await redis.set(ITEM(id), JSON.stringify(rec), { ex: ITEM_TTL });
      await redis.zrem(ZKEY, memberOf(rec));
      return res.status(200).json({ ok: 1, item: rec.item, price: finalPrice, disc });
    }

    if (op === "cancel") {
      const { id, claimKey } = req.body;
      const rec = parse(await redis.get(ITEM(id)));
      if (!rec || rec.claimKey !== claimKey) return res.status(200).json({ ok: 0, error: "找不到掛單" });
      if (rec.sold) return res.status(200).json({ ok: 0, error: "已售出，請領貨款" });
      await redis.zrem(ZKEY, memberOf(rec));
      await redis.del(ITEM(id));
      return res.status(200).json({ ok: 1, item: rec.item });
    }

    if (op === "claim") {
      const { id, claimKey } = req.body;
      const rec = parse(await redis.get(ITEM(id)));
      if (!rec || rec.claimKey !== claimKey) return res.status(200).json({ ok: 0, error: "找不到掛單" });
      if (!rec.sold) return res.status(200).json({ ok: 0, sold: 0 });          // 還沒賣掉
      if (rec.claimed) return res.status(200).json({ ok: 0, error: "貨款已領過" });
      rec.claimed = 1;
      await redis.set(ITEM(id), JSON.stringify(rec), { ex: ITEM_TTL });
      return res.status(200).json({ ok: 1, coins: Math.floor(rec.price * (1 - TAX)), buyer: rec.buyer || "" });
    }

    return res.status(400).json({ error: "bad op" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}

export const onRequest = vercelToPages(handler);
