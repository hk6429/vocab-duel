// 教師最小後台 — 班級認領（班級碼+PIN）、字表指派發布、全班弱字聚合
// POST { op:'claim', code, pin, name }              → 認領班級（碼未被用過才成立）
// POST { op:'setAsg', code, pin, asg:{...} }        → 新增/更新一筆指派（上限 8 筆）
// POST { op:'delAsg', code, pin, id }               → 刪除指派
// POST { op:'get', code }                           → 學生端讀指派清單（公開，不含 PIN）
// POST { op:'weakReport', code, words:{word:n} }    → 學生端批次上報錯字次數
// POST { op:'weakTop', code, pin }                  → 老師讀全班弱字 Top 30
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const TTL = 240 * 24 * 60 * 60; // 一學年左右，跟 board.js 一致
const KEY = (c) => `vd:class:${c}`;
const ASG_KEY = (c) => `vd:class:${c}:asg`;
const WEAK_KEY = (c) => `vd:weak:${c}`;
const MAX_ASG = 8;
const okCode = (c) => typeof c === "string" && /^[一-鿿A-Za-z0-9_-]{2,16}$/.test(c);
const okPin = (p) => typeof p === "string" && /^\d{4,8}$/.test(p);
const okName = (n) => typeof n === "string" && n.trim().length >= 1 && n.trim().length <= 20 && !/[<>&"']/.test(n);
const okWord = (w) => typeof w === "string" && /^[a-z' .-]{1,24}$/i.test(w);
const BAD_WORDS = /笨蛋|白癡|智障|廢物|去死|三小|幹你|靠北|媽的|垃圾|腦殘|fuck|shit|bitch|asshole|idiot|stupid|retard/i;

// CORS 白名單：只回信任的來源，其餘退回主站
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

/* 讀班級並驗 PIN；通過回傳班級物件，失敗回傳 null */
async function authed(code, pin) {
  if (!okPin(pin)) return null;
  const cls = parse(await redis.get(KEY(code)));
  return cls && cls.pin === pin ? cls : null;
}

/* 指派清洗：格式不對整筆拒收（soft error 由呼叫端回） */
function cleanAsg(a) {
  if (!a || typeof a !== "object") return null;
  const id = String(a.id || "");
  if (!/^[a-z0-9]{1,8}$/.test(id)) return null;
  if (!okName(a.name)) return null;
  if (!Array.isArray(a.words) || a.words.length < 1 || a.words.length > 200) return null;
  if (!a.words.every(okWord)) return null;
  const module_ = ["", "quiz", "listen", "flash", "write"].includes(a.module) ? a.module : "";
  const due = typeof a.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.due) ? a.due : "";
  return { id, name: a.name.trim(), words: a.words.map((w) => w.trim().toLowerCase()), module: module_, due, lock: a.lock ? 1 : 0, ts: Date.now() };
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const { op, code } = req.body || {};
    if (!okCode(code)) return res.status(200).json({ ok: 0, error: "班級代碼須為 2–16 個中英數字" });

    if (op === "claim") {
      if (await rateLimited(req, "clsclaim", 5)) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      const { pin, name } = req.body || {};
      if (!okPin(pin)) return res.status(200).json({ ok: 0, error: "PIN 須為 4–8 位數字" });
      if (!okName(name)) return res.status(200).json({ ok: 0, error: "班級名稱須為 1–20 字" });
      if (BAD_WORDS.test(name)) return res.status(200).json({ ok: 0, error: "名稱含不當字詞，請更換" });
      if (await redis.exists(KEY(code))) return res.status(200).json({ ok: 0, error: "這個班級碼已被認領，換一組吧" });
      await redis.set(KEY(code), JSON.stringify({ pin, name: name.trim(), ts: Date.now() }), { ex: TTL });
      return res.status(200).json({ ok: 1, name: name.trim() });
    }

    if (op === "get") {
      if (await rateLimited(req, "clsget", 30)) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      const cls = parse(await redis.get(KEY(code)));
      if (!cls) return res.status(200).json({ ok: 0, error: "這個班級還沒被老師認領" });
      const asgs = parse(await redis.get(ASG_KEY(code))) || [];
      return res.status(200).json({ ok: 1, name: cls.name, asgs }); // 絕不回 PIN
    }

    if (op === "setAsg" || op === "delAsg") {
      if (await rateLimited(req, "clsasg", 10)) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      const cls = await authed(code, req.body.pin);
      if (!cls) return res.status(200).json({ ok: 0, error: "班級碼或 PIN 不對" });
      let asgs = parse(await redis.get(ASG_KEY(code))) || [];
      if (op === "setAsg") {
        const a = cleanAsg(req.body.asg);
        if (!a) return res.status(200).json({ ok: 0, error: "指派格式不對（名稱 1–20 字、單字 1–200 個英文字）" });
        asgs = asgs.filter((x) => x.id !== a.id);
        asgs.push(a);
        asgs.sort((x, y) => y.ts - x.ts);
        if (asgs.length > MAX_ASG) asgs = asgs.slice(0, MAX_ASG); // 超量丟最舊
      } else {
        asgs = asgs.filter((x) => x.id !== String(req.body.id || ""));
      }
      await redis.set(ASG_KEY(code), JSON.stringify(asgs), { ex: TTL });
      return res.status(200).json({ ok: 1, asgs });
    }

    if (op === "weakReport") {
      if (await rateLimited(req, "clsweak", 30)) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      if (!(await redis.exists(KEY(code)))) return res.status(200).json({ ok: 0, error: "班級不存在" });
      const words = req.body.words;
      if (!words || typeof words !== "object") return res.status(200).json({ ok: 0, error: "bad words" });
      const entries = Object.entries(words).filter(([w]) => okWord(w)).slice(0, 50);
      if (!entries.length) return res.status(200).json({ ok: 1 });
      const k = WEAK_KEY(code);
      for (const [w, n] of entries) {
        await redis.zincrby(k, Math.max(1, Math.min(20, Math.round(Number(n) || 1))), w.toLowerCase());
      }
      await redis.zremrangebyrank(k, 0, -501); // 只留最常錯的 500 字
      await redis.expire(k, TTL);
      return res.status(200).json({ ok: 1 });
    }

    if (op === "weakTop") {
      if (await rateLimited(req, "clsweak", 30)) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      const cls = await authed(code, req.body.pin);
      if (!cls) return res.status(200).json({ ok: 0, error: "班級碼或 PIN 不對" });
      const raw = await redis.zrange(WEAK_KEY(code), 0, 29, { rev: true, withScores: true });
      const list = [];
      for (let i = 0; i < raw.length; i += 2) list.push({ word: raw[i], n: Number(raw[i + 1]) });
      return res.status(200).json({ ok: 1, list });
    }

    return res.status(400).json({ error: "bad op" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
