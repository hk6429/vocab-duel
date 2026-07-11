// 單字之城雲端綁定 — 城鎮狀態綁同步碼跨裝置（WordToken 是遊戲內記帳單位，非真金錢）
// POST { op:'save', code, town }   → 上傳
// POST { op:'load', code }         → 下載
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const KEY = (code) => `vd:town:${code}`;
const okCode = (c) => typeof c === "string" && /^[A-Za-z0-9_-]{4,32}$/.test(c.trim());

// CORS 白名單：只回信任的來源，其餘退回主站
const ORIGINS = ["https://vocab-duel.vercel.app", "https://vocab-duel.pages.dev", "https://vocab-duel.netlify.app", "http://localhost:8765"];
const cors = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGINS.includes(req.headers.origin) ? req.headers.origin : ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
};

// 輕量限流：每 IP 每 60 秒 30 次寫入，超過回 429
async function rateLimited(req, scope) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const k = `vd:rl:${scope}:${ip}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, 60);
  return n > 30;
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const { op, code } = req.body || {};
    if (!okCode(code)) return res.status(200).json({ ok: 0, error: "同步碼格式不對" });

    if (op === "save") {
      if (await rateLimited(req, "town")) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      const town = req.body.town;
      if (!town || !town.grid || !town.res) return res.status(200).json({ ok: 0, error: "城鎮資料不完整" });
      // 城名淨化：濾掉危險字元並限長
      if (typeof town.name === "string") town.name = town.name.replace(/[<>&"']/g, "").slice(0, 12);
      const s = JSON.stringify(town);
      if (s.length > 60000) return res.status(200).json({ ok: 0, error: "資料過大" });
      await redis.set(KEY(code.trim()), s);
      return res.status(200).json({ ok: 1 });
    }

    if (op === "load") {
      const raw = await redis.get(KEY(code.trim()));
      if (!raw) return res.status(200).json({ ok: 0, error: "雲端沒有這個同步碼的城" });
      return res.status(200).json({ ok: 1, town: typeof raw === "string" ? JSON.parse(raw) : raw });
    }

    return res.status(400).json({ error: "bad op" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
