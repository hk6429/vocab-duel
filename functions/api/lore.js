// P3-14 傳承銘文（UGC）：學生為詞靈家族的字寫的例句，匿名共享成別人的提示卡
// POST { op:'submit', petId, word, text, hero } → { ok:1 }
// POST { op:'list', petId } → { lore:[{word,text,hero}] }（隨機回最多 12 則）
import { redisFor, vercelToPages } from "./_redis.js";
let redis;

const ORIGINS = ["https://vocab-duel.vercel.app", "https://vocab-duel.pages.dev", "https://vocab-duel.netlify.app", "http://localhost:8765"];
const cors = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGINS.includes(req.headers.origin) ? req.headers.origin : ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
};

// 每 IP 每 5 分鐘最多 20 次投稿
async function rateLimited(req) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const k = `vd:rl:lore:${ip}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, 300);
  return n > 20;
}

const clean = (s, max) => String(s || "").replace(/[<>]/g, "").trim().slice(0, max);
const okId = id => /^(fu_)?[a-z0-9_]{1,32}$/i.test(id);

async function handler(req, res, env) {
  redis = redisFor(env.DB);
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const op = req.body?.op;
    const petId = String(req.body?.petId || "");
    if (!okId(petId)) return res.status(200).json({ ok: 0, error: "bad petId" });
    const key = `vd:lore:${petId}`;

    if (op === "list") {
      const raw = await redis.lrange(key, 0, 199);
      const items = raw.map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
      // 隨機挑最多 12 則（Fisher–Yates 前 12）
      for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[items[i], items[j]] = [items[j], items[i]]; }
      return res.status(200).json({ ok: 1, lore: items.slice(0, 12) });
    }

    if (op === "submit") {
      if (await rateLimited(req)) return res.status(429).json({ error: "太頻繁，請稍候再試" });
      const word = clean(req.body?.word, 40).toLowerCase();
      const text = clean(req.body?.text, 80);
      const hero = clean(req.body?.hero, 20) || "無名學徒";
      if (!/^[a-z][a-z' -]*$/.test(word)) return res.status(200).json({ ok: 0, error: "bad word" });
      if (text.length < 6) return res.status(200).json({ ok: 0, error: "too short" });
      if (!text.toLowerCase().includes(word)) return res.status(200).json({ ok: 0, error: "must contain word" });
      await redis.lpush(key, { word, text, hero });
      await redis.ltrim(key, 0, 199);
      await redis.expire(key, 60 * 60 * 24 * 400);
      return res.status(200).json({ ok: 1 });
    }

    return res.status(200).json({ ok: 0, error: "unknown op" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}

export const onRequest = vercelToPages(handler);
