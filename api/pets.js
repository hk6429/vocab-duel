// 詞靈影子 PvP — 快照池＋全站排行榜。Upstash Redis REST（字鬥專用 DB，key 前綴 vd:pet）
// POST { op:'submit', snap }            → 上傳自己的出戰寵快照（進池＋刷榜）
// POST { op:'opponent', rating }        → 從快照池抽一個接近積分的對手
// POST { op:'board' }                   → 全站 Top 50
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const POOL = "vd:petpool";               // LPUSH 快照池，LTRIM 保留 200
const BOARD = "vd:petboard:global";      // ZSET nick → rating，取 Top 50
const POOL_MAX = 200;
const clamp = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
const okNick = (n) => typeof n === "string" && n.trim().length >= 1 && n.trim().length <= 12;
const okId = (s) => typeof s === "string" && /^[a-z][a-z0-9_]{2,24}$/.test(s); // 幼靈 id 帶 fu_ 前綴

// CORS 白名單：只回信任的來源，其餘退回主站
const ORIGINS = ["https://vocab-duel.vercel.app", "https://vocab-duel.pages.dev", "https://vocab-duel.netlify.app", "http://localhost:8765"];
const cors = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGINS.includes(req.headers.origin) ? req.headers.origin : ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
};

function cleanSnap(s) {
  if (!s || !okNick(s.nick) || !okId(s.petId)) return null;
  return {
    nick: s.nick.trim(),
    petId: s.petId,
    petName: typeof s.petName === "string" ? s.petName.slice(0, 8) : "詞靈",
    lv: clamp(s.lv, 25) || 1,
    atk: clamp(s.atk, 300) || 10,
    hp: clamp(s.hp, 800) || 100,
    skills: Array.isArray(s.skills) ? s.skills.filter(okId).slice(0, 3) : [],
    rating: clamp(s.rating, 99999),
  };
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const { op } = req.body || {};

    if (op === "submit") {
      const snap = cleanSnap(req.body.snap);
      if (!snap) return res.status(400).json({ error: "bad snap" });
      await redis.lpush(POOL, JSON.stringify(snap));
      await redis.ltrim(POOL, 0, POOL_MAX - 1);
      await redis.zadd(BOARD, { score: snap.rating, member: JSON.stringify({ nick: snap.nick, petName: snap.petName, lv: snap.lv }) });
      await redis.zremrangebyrank(BOARD, 0, -101);   // 榜只留前 100 筆原始資料
      return res.status(200).json({ ok: 1 });
    }

    if (op === "opponent") {
      const myRating = clamp(req.body.rating, 99999);
      const raw = await redis.lrange(POOL, 0, POOL_MAX - 1);
      const pool = raw
        .map((x) => { try { return typeof x === "string" ? JSON.parse(x) : x; } catch { return null; } })
        .filter(Boolean);
      if (!pool.length) return res.status(200).json({ ok: 1, opponent: null });
      // 依積分距離取最近 10 個再隨機，避免每次都同一人
      pool.sort((a, b) => Math.abs(a.rating - myRating) - Math.abs(b.rating - myRating));
      const cand = pool.slice(0, 10);
      const opponent = cand[Math.floor(Math.random() * cand.length)];
      return res.status(200).json({ ok: 1, opponent });
    }

    if (op === "board") {
      const raw = await redis.zrange(BOARD, 0, 49, { rev: true, withScores: true });
      const board = [];
      for (let i = 0; i < raw.length; i += 2) {
        try {
          const m = typeof raw[i] === "string" ? JSON.parse(raw[i]) : raw[i];
          board.push({ ...m, rating: Math.round(Number(raw[i + 1]) || 0) });
        } catch { /* skip */ }
      }
      return res.status(200).json({ ok: 1, board });
    }

    return res.status(400).json({ error: "bad op" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
