// 隨堂即時模式 — 老師主持（班級碼+PIN），全班同 seed 同題，Upstash 輪詢同步
// POST { op:'start', code, pin, qn, words[] }  → 開場（words＝題目字表，全班用同一份出題）
// POST { op:'next', code, pin }                → 下一題（lobby→第 1 題；最後一題→end）
// POST { op:'end', code, pin }                 → 提前結束
// POST { op:'state', code }                    → 學生輪詢場況（公開）
// POST { op:'answer', code, nick, qNo, correct } → 學生回報作答（qNo=0 為報到）
// POST { op:'roster', code }                   → 名冊與逐題答對（公開，暱稱分數本就班內公開）
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const TTL = 3600; // 一堂課的壽命，下課自動蒸發
const CLASS_KEY = (c) => `vd:class:${c}`;
const KEY = (c) => `vd:live:${c}`;
const P_KEY = (c) => `vd:live:${c}:p`;
const okCode = (c) => typeof c === "string" && /^[一-鿿A-Za-z0-9_-]{2,16}$/.test(c);
const okPin = (p) => typeof p === "string" && /^\d{4,8}$/.test(p);
const okNick = (n) => typeof n === "string" && n.trim().length >= 1 && n.trim().length <= 20 && !/[<>&"']/.test(n);
const okWord = (w) => typeof w === "string" && /^[a-z' .-]{1,24}$/i.test(w);

const ORIGINS = ["https://vocab-duel.vercel.app", "https://vocab-duel.pages.dev", "https://vocab-duel.netlify.app", "http://localhost:8765"];
const cors = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGINS.includes(req.headers.origin) ? req.headers.origin : ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
};

async function rateLimited(req, scope, limit) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const k = `vd:rl:${scope}:${ip}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, 60);
  return n > limit;
}

const parse = (x) => (typeof x === "string" ? JSON.parse(x) : x);

async function authed(code, pin) {
  if (!okPin(pin)) return null;
  const cls = parse(await redis.get(CLASS_KEY(code)));
  return cls && cls.pin === pin ? cls : null;
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const { op, code } = req.body || {};
    if (!okCode(code)) return res.status(200).json({ ok: 0, error: "班級代碼須為 2–16 個中英數字" });

    if (op === "start") {
      if (await rateLimited(req, "livestart", 5)) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      if (!(await authed(code, req.body.pin))) return res.status(200).json({ ok: 0, error: "班級碼或 PIN 不對" });
      const qn = [5, 10, 15].includes(req.body.qn) ? req.body.qn : 10;
      const words = Array.isArray(req.body.words) ? req.body.words.filter(okWord).map((w) => w.trim().toLowerCase()).slice(0, 200) : [];
      if (words.length < 12) return res.status(200).json({ ok: 0, error: "題目字表至少要 12 個字（誘答選項才夠用）" });
      const live = { seed: Math.floor(Math.random() * 2 ** 31), qn, qNo: 0, phase: "lobby", words, qStart: 0, ts: Date.now() };
      await redis.set(KEY(code), JSON.stringify(live), { ex: TTL });
      await redis.del(P_KEY(code));
      return res.status(200).json({ ok: 1, live });
    }

    if (op === "next" || op === "end") {
      if (await rateLimited(req, "livectl", 30)) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      if (!(await authed(code, req.body.pin))) return res.status(200).json({ ok: 0, error: "班級碼或 PIN 不對" });
      const live = parse(await redis.get(KEY(code)));
      if (!live) return res.status(200).json({ ok: 0, error: "沒有進行中的隨堂考" });
      if (op === "end" || live.qNo >= live.qn) live.phase = "end";
      else { live.phase = "q"; live.qNo += 1; live.qStart = Date.now(); }
      await redis.set(KEY(code), JSON.stringify(live), { ex: TTL });
      return res.status(200).json({ ok: 1, live });
    }

    if (op === "state") {
      const live = parse(await redis.get(KEY(code)));
      return res.status(200).json({ ok: 1, live: live || null });
    }

    if (op === "answer") {
      // 全班共用學校出口 IP：限流放寬到 120/min（30 人同秒作答也扛得住）
      if (await rateLimited(req, "liveans", 120)) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      const nick = req.body.nick;
      if (!okNick(nick)) return res.status(200).json({ ok: 0, error: "暱稱須為 1–20 字" });
      const qNo = Math.round(Number(req.body.qNo) || 0);
      if (qNo < 0 || qNo > 20) return res.status(200).json({ ok: 0, error: "bad qNo" });
      const k = P_KEY(code);
      const rec = parse(await redis.hget(k, nick.trim())) || { qNo: 0, score: 0, hist: "" };
      if (qNo > rec.qNo) { // 只收新題，重送不重計；跳過的題補 '-' 讓 hist 與題號對位
        rec.hist = (rec.hist + "-".repeat(Math.max(0, qNo - rec.qNo - 1)) + (req.body.correct ? "1" : "0")).slice(-20);
        rec.qNo = qNo;
        rec.score += req.body.correct ? 1 : 0;
      }
      await redis.hset(k, { [nick.trim()]: JSON.stringify(rec) });
      await redis.expire(k, TTL);
      return res.status(200).json({ ok: 1, score: rec.score });
    }

    if (op === "roster") {
      const all = (await redis.hgetall(P_KEY(code))) || {};
      const list = Object.entries(all).map(([nick, v]) => {
        const d = parse(v) || {};
        return { nick, qNo: d.qNo || 0, score: d.score || 0, hist: d.hist || "" };
      }).sort((a, b) => b.score - a.score);
      return res.status(200).json({ ok: 1, list });
    }

    return res.status(400).json({ error: "bad op" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
