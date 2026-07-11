// 班級排行榜 — 老師派班級碼、學生上傳戰績。Upstash Redis REST（字鬥專用 DB，key 前綴 vd:board:）
// GET  ?code=班級碼                    → 該班排行（依已掌握字數、等級排序）
// POST { action:'sync', code, name, ... } → 學生上傳自己的戰績
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const TTL = 240 * 24 * 60 * 60;          // 一學年左右
const MAX_MEMBERS = 60;
const key = (c) => `vd:board:${c}`;
const okCode = (c) => typeof c === "string" && /^[一-鿿A-Za-z0-9_-]{2,16}$/.test(c);
const okName = (n) => typeof n === "string" && n.trim().length >= 1 && n.trim().length <= 12;
const clamp = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));

const cors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
};

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    if (req.method === "GET") {
      const code = req.query.code;
      if (!okCode(code)) return res.status(400).json({ error: "bad code" });
      const all = (await redis.hgetall(key(code))) || {};
      const rows = Object.entries(all).map(([name, v]) => {
        const d = typeof v === "string" ? JSON.parse(v) : v;
        return { name, mastered: d.mastered, level: d.level, streak: d.streak, badges: d.badges, ts: d.ts };
      }).sort((a, b) => b.mastered - a.mastered || b.level - a.level || b.streak - a.streak);
      return res.status(200).json({ code, rows });
    }
    if (req.method === "POST") {
      const { action, code, name } = req.body || {};
      if (!okCode(code)) return res.status(400).json({ error: "班級代碼須為 2–16 個中英數字" });
      if (action === "sync") {
        if (!okName(name)) return res.status(400).json({ error: "名字須為 1–12 字" });
        const nm = name.trim();
        const k = key(code);
        const exists = await redis.hexists(k, nm);
        if (!exists && (await redis.hlen(k)) >= MAX_MEMBERS)
          return res.status(400).json({ error: "這個班級已滿 60 人" });
        const rec = {
          mastered: clamp(req.body.mastered, 6205),
          level: clamp(req.body.level, 99),
          streak: clamp(req.body.streak, 3650),
          badges: clamp(req.body.badges, 100),
          ts: Date.now(),
        };
        await redis.hset(k, { [nm]: JSON.stringify(rec) });
        await redis.expire(k, TTL);
        return res.status(200).json({ ok: 1 });
      }
      return res.status(400).json({ error: "unknown action" });
    }
    return res.status(405).json({ error: "method" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
