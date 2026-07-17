// 雲端存檔 — 個人進度跨裝置同步。Cloudflare D1（key 前綴 vd:sync:）
// GET  ?code=XXXX        → 取回該同步碼的進度 blob
// POST { code, blob }    → 上傳（覆寫）該同步碼的進度 blob
import { redisFor, vercelToPages } from "./_redis.js";
let redis;

const TTL = 400 * 24 * 60 * 60;          // 約一年多，過期自動清
const MAX_BLOB = 512 * 1024;             // 單筆 512KB 上限，防濫用
const key = (c) => `vd:sync:${c}`;
const okCode = (c) => typeof c === "string" && /^[A-Za-z0-9]{6,12}$/.test(c);

// CORS 白名單：只回信任的來源，其餘退回主站
const ORIGINS = ["https://vocab-duel.vercel.app", "https://vocab-duel.pages.dev", "https://vocab-duel.netlify.app", "http://localhost:8765"];
const cors = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGINS.includes(req.headers.origin) ? req.headers.origin : ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
};

async function handler(req, res, env) {
  redis = redisFor(env.DB);
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    if (req.method === "GET") {
      const code = req.query.code;
      if (!okCode(code)) return res.status(400).json({ error: "bad code" });
      const data = await redis.get(key(code));
      if (data == null) return res.status(404).json({ error: "no save" });
      const blob = typeof data === "string" ? JSON.parse(data) : data;
      return res.status(200).json({ ok: 1, blob });
    }
    if (req.method === "POST") {
      const { code, blob } = req.body || {};
      if (!okCode(code)) return res.status(400).json({ error: "同步碼須為 6–12 個英數字" });
      if (blob == null || typeof blob !== "object") return res.status(400).json({ error: "bad blob" });
      const str = JSON.stringify(blob);
      if (str.length > MAX_BLOB) return res.status(400).json({ error: "存檔太大" });
      await redis.set(key(code), str, { ex: TTL });
      return res.status(200).json({ ok: 1, ts: Date.now() });
    }
    return res.status(405).json({ error: "method" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}

export const onRequest = vercelToPages(handler);
