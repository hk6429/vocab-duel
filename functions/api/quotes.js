// 班級語錄牆 — 學生公開分享自編例句／助記口訣（補齊八角框架 Creativity 這條軸）
// POST { op:'post', code, nick, word, sentence } → 發布一則（限長、走黑名單審核、LPUSH 保 200 筆）
// POST { op:'list', code }                       → 讀該班最新語錄
import { redisFor, vercelToPages } from "./_redis.js";
let redis;


const TTL = 240 * 24 * 60 * 60; // 一學年左右，跟 board.js 一致
const KEY = (code) => `vd:quote:${code}`;
const okCode = (c) => typeof c === "string" && /^[一-鿿A-Za-z0-9_-]{2,16}$/.test(c);
const okNick = (n) => typeof n === "string" && n.trim().length >= 1 && n.trim().length <= 12 && !/[<>&"']/.test(n);
const okWord = (w) => typeof w === "string" && w.trim().length >= 1 && w.trim().length <= 20 && !/[<>&"']/.test(w);
const okSentence = (s) => typeof s === "string" && s.trim().length >= 1 && s.trim().length <= 60 && !/[<>&"']/.test(s);
// 暱稱／內容黑名單：與 board.js／town.js 同一份常見中英文辱罵字詞（非窮舉）
const BAD_WORDS = /笨蛋|白癡|智障|廢物|去死|三小|幹你|靠北|媽的|垃圾|腦殘|fuck|shit|bitch|asshole|idiot|stupid|retard/i;

// CORS 白名單：只回信任的來源，其餘退回主站
const ORIGINS = ["https://vocab-duel.vercel.app", "https://vocab-duel.pages.dev", "https://vocab-duel.netlify.app", "http://localhost:8765"];
const cors = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGINS.includes(req.headers.origin) ? req.headers.origin : ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
};

// 輕量限流：每 IP 每 60 秒 10 次發文（比其他寫入端點更嚴，語錄是自由文字，濫發風險較高）
async function rateLimited(req, scope, limit) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const k = `vd:rl:${scope}:${ip}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, 60);
  return n > limit;
}

async function handler(req, res, env) {
  redis = redisFor(env.DB);
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const { op, code } = req.body || {};
    if (!okCode(code)) return res.status(200).json({ ok: 0, error: "班級代碼須為 2–16 個中英數字" });

    if (op === "post") {
      if (await rateLimited(req, "quotepost", 10)) return res.status(429).json({ error: "發布太頻繁，請稍候再試" });
      const { nick, word, sentence } = req.body || {};
      if (!okNick(nick)) return res.status(200).json({ ok: 0, error: "暱稱須為 1–12 字" });
      if (!okWord(word)) return res.status(200).json({ ok: 0, error: "單字須為 1–20 字" });
      if (!okSentence(sentence)) return res.status(200).json({ ok: 0, error: "例句／口訣須為 1–60 字" });
      if (BAD_WORDS.test(nick) || BAD_WORDS.test(word) || BAD_WORDS.test(sentence))
        return res.status(200).json({ ok: 0, error: "內容含不當字詞，請更換" });
      const k = KEY(code);
      await redis.lpush(k, JSON.stringify({ nick: nick.trim(), word: word.trim(), sentence: sentence.trim(), ts: Date.now() }));
      await redis.ltrim(k, 0, 199); // 只保最新 200 筆
      await redis.expire(k, TTL);
      return res.status(200).json({ ok: 1 });
    }

    if (op === "list") {
      if (await rateLimited(req, "quotelist", 60)) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      const raw = await redis.lrange(KEY(code), 0, 49); // 最新 50 筆
      const list = raw
        .map((x) => { try { return typeof x === "string" ? JSON.parse(x) : x; } catch { return null; } })
        .filter(Boolean);
      return res.status(200).json({ ok: 1, list });
    }

    return res.status(400).json({ error: "bad op" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}

export const onRequest = vercelToPages(handler);
