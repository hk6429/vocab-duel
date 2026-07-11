// 裝備市場 — 全站掛單制。寵物不可交易，只交易裝備。
// 防作弊：上架時伺服器驗數值區間＋HMAC 簽章（金鑰＝現有 env token，不新增秘密）；
//        賣家憑上架時發的 claimKey 領貨款／下架；買家每日限購 3 件；成交抽 10% 稅。
// POST { op:'list' }                              → 市場前 50 筆（價格低→高）
// POST { op:'post', item, price, seller }         → 上架，回 { id, claimKey }
// POST { op:'buy', id, nick }                     → 購買，回 { item }
// POST { op:'cancel', id, claimKey }              → 下架，回 { item }
// POST { op:'claim', id, claimKey }               → 已售出的掛單領貨款，回 { coins }
import { Redis } from "@upstash/redis";
import { createHmac, randomBytes } from "crypto";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const ZKEY = "vd:market";
const ITEM = (id) => `vd:market:item:${id}`;
const BUYS = (nick) => `vd:market:buys:${nick}:${new Date().toISOString().slice(0, 10)}`;
const ITEM_TTL = 7 * 86400;   // 掛單／貨款保留 7 天
const DAILY_BUY_CAP = 3;
const TAX = 0.1;

const PRICE_BAND = { common: [10, 50], rare: [40, 200], legendary: [150, 800] };
const TIER_RANGE = { common: [2, 4], rare: [5, 8], legendary: [10, 15] };
const SLOTS = ["weapon", "armor", "trinket", "crest"];
const POOL = {
  weapon: ["羽毫劍", "斷句斧", "音節弓", "詞鋒匕"], armor: ["紙鎧", "墨紋盾甲", "綴皮氅", "疊字重甲"],
  trinket: ["字符鈴", "綴玉墜", "詞露瓶", "音標戒"], crest: ["字首紋章", "字尾徽記", "字根圖騰", "詞源印"]
};
const PERKS = ["", "xp10", "sprint5", "wrong2"];

const secret = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "vd";
const sigOf = (item) => createHmac("sha256", secret()).update(JSON.stringify(item)).digest("hex").slice(0, 24);
const okNick = (n) => typeof n === "string" && n.trim().length >= 1 && n.trim().length <= 12;

const cors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
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
  const prefix = it.tier === "legendary" ? "傳說" : it.tier === "rare" ? "稀有" : "";
  return {
    slot: it.slot, tier: it.tier, base: it.base, name: `${prefix}${it.base}`,
    ico: { weapon: "⚔️", armor: "🛡️", trinket: "📿", crest: "🏵️" }[it.slot],
    atk, hp, perk: it.perk || ""
  };
}

const parse = (x) => { try { return typeof x === "string" ? JSON.parse(x) : x; } catch { return null; } };

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const { op } = req.body || {};

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
      const id = randomBytes(6).toString("hex");
      const claimKey = randomBytes(12).toString("hex");
      const entry = { id, item, seller: seller.trim(), ts: Date.now() };
      await redis.set(ITEM(id), JSON.stringify({ ...entry, price, claimKey, sig: sigOf(item), sold: 0, claimed: 0 }), { ex: ITEM_TTL });
      await redis.zadd(ZKEY, { score: price, member: JSON.stringify(entry) });
      return res.status(200).json({ ok: 1, id, claimKey });
    }

    if (op === "buy") {
      const { id, nick } = req.body;
      if (typeof id !== "string" || !okNick(nick)) return res.status(400).json({ error: "bad req" });
      const buys = await redis.incr(BUYS(nick.trim()));
      if (buys === 1) await redis.expire(BUYS(nick.trim()), 86400);
      if (buys > DAILY_BUY_CAP) return res.status(200).json({ ok: 0, error: "每日限購 3 件（保護自己打寶的樂趣）" });
      const rec = parse(await redis.get(ITEM(id)));
      if (!rec || rec.sold) return res.status(200).json({ ok: 0, error: "這件已被買走或下架了" });
      if (rec.seller === nick.trim()) return res.status(200).json({ ok: 0, error: "不能買自己的掛單" });
      if (sigOf(rec.item) !== rec.sig) return res.status(200).json({ ok: 0, error: "簽章不符，掛單作廢" });
      // 殺價：由買家暱稱+掛單 id 決定固定折扣 0/5/10/15%（不能重骰）；賣家收款按折後價 ×0.9
      let disc = 0;
      if (req.body.haggle) {
        let h = 0;
        for (const ch of nick.trim() + id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        disc = [0, 5, 10, 15][h % 4];
      }
      const finalPrice = Math.ceil(rec.price * (100 - disc) / 100);
      rec.sold = 1; rec.soldTs = Date.now(); rec.price = finalPrice;
      await redis.set(ITEM(id), JSON.stringify(rec), { ex: ITEM_TTL });
      await redis.zrem(ZKEY, JSON.stringify({ id: rec.id, item: rec.item, seller: rec.seller, ts: rec.ts }));
      return res.status(200).json({ ok: 1, item: rec.item, price: finalPrice, disc });
    }

    if (op === "cancel") {
      const { id, claimKey } = req.body;
      const rec = parse(await redis.get(ITEM(id)));
      if (!rec || rec.claimKey !== claimKey) return res.status(200).json({ ok: 0, error: "找不到掛單" });
      if (rec.sold) return res.status(200).json({ ok: 0, error: "已售出，請領貨款" });
      await redis.zrem(ZKEY, JSON.stringify({ id: rec.id, item: rec.item, seller: rec.seller, ts: rec.ts }));
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
      return res.status(200).json({ ok: 1, coins: Math.floor(rec.price * (1 - TAX)) });
    }

    return res.status(400).json({ error: "bad op" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
