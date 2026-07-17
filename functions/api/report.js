// 單字發音／解釋錯誤回報 — 送到老師的 Telegram（不落地存 D1，純轉發）
// POST { word, kind:'pron'|'mean'|'other', note? } → { ok: 1 }
import { redisFor, vercelToPages } from "./_redis.js";
let redis;
let TOKEN, CHAT_ID;                       // 於 handler 內從 env 帶入（CF Pages secret）

const KIND_LABEL = { pron: "🔊 發音", mean: "📖 中文解釋", other: "❓ 其他" };

// CORS 白名單：只回信任的來源，其餘退回主站
const ORIGINS = ["https://vocab-duel.vercel.app", "https://vocab-duel.pages.dev", "https://vocab-duel.netlify.app", "http://localhost:8765"];
const cors = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGINS.includes(req.headers.origin) ? req.headers.origin : ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
};

// 輕量限流：每 IP 每 5 分鐘最多 5 次回報，擋洗版（比一般寫入 API 嚴，這是低頻動作）
async function rateLimited(req) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const k = `vd:rl:report:${ip}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, 300);
  return n > 5;
}

async function handler(req, res, env) {
  redis = redisFor(env.DB);
  TOKEN = env.TELEGRAM_BOT_TOKEN;
  CHAT_ID = env.TELEGRAM_CHAT_ID;
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    // 健康檢查：只回報變數是否存在與長度，不外洩值
    if (req.body?.op === "health")
      return res.status(200).json({ ok: 1, tokenLen: (TOKEN || "").length, chatLen: (CHAT_ID || "").length });
    if (!TOKEN || !CHAT_ID) return res.status(200).json({ ok: 0, error: "回報功能尚未啟用" });
    if (await rateLimited(req)) return res.status(429).json({ error: "回報太頻繁，請稍候再試" });

    const word = String(req.body?.word || "").trim().slice(0, 100);
    if (!word) return res.status(200).json({ ok: 0, error: "缺少單字內容" });
    const kind = KIND_LABEL[req.body?.kind] ? req.body.kind : "other";
    const note = String(req.body?.note || "").trim().slice(0, 200);

    const text = [
      "🚩 字鬥英雄・單字回報",
      `內容：${word}`,
      `類型：${KIND_LABEL[kind]}`,
      note ? `備註：${note}` : "",
      `來源：${req.headers.origin || "unknown"}`,
    ].filter(Boolean).join("\n");

    const tgRes = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text }),
    });
    if (!tgRes.ok) return res.status(200).json({ ok: 0, error: "送出失敗，請稍後再試" });

    return res.status(200).json({ ok: 1 });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}

export const onRequest = vercelToPages(handler);
