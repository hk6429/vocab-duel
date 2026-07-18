// 雲端存檔 — 個人進度跨裝置同步。Cloudflare D1（key 前綴 vd:sync:）
// GET  ?code=XXXX        → 取回該同步碼（或唯讀碼）的進度 blob（唯讀碼只能讀，永遠無法覆寫）
// POST { code, blob }    → 上傳（覆寫）該同步碼的進度 blob；回傳中會附上對應的唯讀碼供家長頁使用
import { redisFor, vercelToPages } from "./_redis.js";
let redis;

const TTL = 400 * 24 * 60 * 60;          // 約一年多，過期自動清
const MAX_BLOB = 512 * 1024;             // 單筆 512KB 上限，防濫用
const key = (c) => `vd:sync:${c}`;
const roKey = (c) => `vd:sync:ro:${c}`;  // 唯讀碼 → 實際同步碼 反查表
const okCode = (c) => typeof c === "string" && /^[A-Za-z0-9]{6,12}$/.test(c);
// 新碼規格：8–10 碼、不可純數字（舊的純數字/短碼仍相容讀取，但標記 weakCode）
const okStrongCode = (c) => typeof c === "string" && /^[A-Za-z0-9]{8,10}$/.test(c) && !/^[0-9]+$/.test(c);
const isWeak = (c) => /^[0-9]+$/.test(c);

// CORS 白名單：只回信任的來源，其餘退回主站
const ORIGINS = ["https://vocab-duel.vercel.app", "https://vocab-duel.pages.dev", "https://vocab-duel.netlify.app", "http://localhost:8765"];
const cors = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGINS.includes(req.headers.origin) ? req.headers.origin : ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
};

// 每 IP 每 5 分鐘最多 30 次讀取（比照 lore 的限流桶，防一組 6 碼被拿去暴力掃/濫讀）
async function rateLimited(req, scope) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const k = `vd:rl:sync:${scope}:${ip}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, 300);
  return n > 30;
}

// 由完整同步碼單向推導唯讀碼（SHA-256 取前 8 碼），無法從唯讀碼反推回完整同步碼
async function deriveReadonly(code) {
  const enc = new TextEncoder().encode(`vd-sync-ro:${code}`);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 8);
}

async function handler(req, res, env) {
  redis = redisFor(env.DB);
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    if (req.method === "GET") {
      if (await rateLimited(req, "get")) return res.status(429).json({ error: "太頻繁，請稍候再試" });
      const code = req.query.code;
      if (!okCode(code)) return res.status(400).json({ error: "bad code" });
      // 先查唯讀碼反查表：若命中，代表這是唯讀碼（只能讀，不會覆寫）
      const mapped = await redis.get(roKey(code));
      const actualCode = mapped || code;
      const readonly = !!mapped;
      const data = await redis.get(key(actualCode));
      if (data == null) return res.status(404).json({ error: "no save" });
      const blob = typeof data === "string" ? JSON.parse(data) : data;
      const out = { ok: 1, blob };
      if (readonly) out.readonly = true;
      if (isWeak(actualCode)) out.weakCode = true;
      return res.status(200).json(out);
    }
    if (req.method === "POST") {
      if (await rateLimited(req, "post")) return res.status(429).json({ error: "太頻繁，請稍候再試" });
      const { code, blob } = req.body || {};
      if (!okCode(code)) return res.status(400).json({ error: "同步碼須為 6–12 個英數字" });
      if (blob == null || typeof blob !== "object") return res.status(400).json({ error: "bad blob" });
      const str = JSON.stringify(blob);
      if (str.length > MAX_BLOB) return res.status(400).json({ error: "存檔太大" });
      const existing = await redis.get(key(code));
      if (existing == null && !okStrongCode(code)) {
        return res.status(400).json({ error: "新同步碼須為 8–10 個英數字，且不可全為數字" });
      }
      await redis.set(key(code), str, { ex: TTL });
      const ro = await deriveReadonly(code);
      await redis.set(roKey(ro), code, { ex: TTL });
      const out = { ok: 1, ts: Date.now(), readonly: ro };
      if (isWeak(code)) out.weakCode = true;
      return res.status(200).json(out);
    }
    return res.status(405).json({ error: "method" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}

export const onRequest = vercelToPages(handler);
