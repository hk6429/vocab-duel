// 班級排行榜 — 老師派班級碼、學生上傳戰績。Upstash Redis REST（字鬥專用 DB，key 前綴 vd:board:）
// GET  ?code=班級碼                    → 該班排行（依已掌握字數、等級排序）
// GET  ?code=班級碼&sort=week          → 依本週新掌握字數（weekMastered）排序
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
const okName = (n) => typeof n === "string" && n.trim().length >= 1 && n.trim().length <= 12 && !/[<>&"']/.test(n); // 拒收危險字元
const clamp = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));

/* 指派進度清洗：cloud.js myStats() 送上來的 {code,name,done,total}；格式不對回 null（不擋整筆同步） */
function cleanAssign(a) {
  if (!a || typeof a !== "object") return null;
  const code = String(a.code || "").slice(0, 16);
  const name = String(a.name || "").replace(/[<>&"']/g, "").slice(0, 20);
  if (!code || !name) return null;
  return { code, name, done: clamp(a.done, 500), total: clamp(a.total, 500) };
}

// 暱稱黑名單：常見中英文辱罵字詞（非窮舉），排行榜公開可見，擋掉明顯攻擊性暱稱
const BAD_WORDS = /笨蛋|白癡|智障|廢物|去死|三小|幹你|靠北|媽的|垃圾|腦殘|fuck|shit|bitch|asshole|idiot|stupid|retard/i;

// 進度合理性檢查（防端點灌數，非完整答題紀錄重建）：對照上次同步紀錄，
// 拒絕短時間內暴增到不合理的數值；沒有前次紀錄（第一次同步）一律放行
const MASTER_RATE_PER_HR = 50;   // 每小時最多新增掌握字數（寬鬆上限，抓灌數不抓認真刷題）
const MASTER_BURST_FLOOR = 30;   // 不論時間差多短，每次同步至少允許增加這麼多（容忍連續快速同步）
const LEVEL_RATE_PER_HR = 5;
const LEVEL_BURST_FLOOR = 3;
function implausibleSync(prev, next) {
  if (!prev || !prev.ts) return null; // 第一次同步，沒有基準可比，一律放行
  const hrs = Math.max((Date.now() - prev.ts) / 3600000, 0);
  if (next.mastered > prev.mastered + Math.max(MASTER_RATE_PER_HR * hrs, MASTER_BURST_FLOOR))
    return "掌握字數增加幅度異常，請稍後再試";
  if (next.level > prev.level + Math.max(LEVEL_RATE_PER_HR * hrs, LEVEL_BURST_FLOOR))
    return "等級提升幅度異常，請稍後再試";
  const days = hrs / 24;
  if (next.streak !== 0 && next.streak > prev.streak + Math.ceil(days) + 1)
    return "連續天數異常，請稍後再試";
  return null;
}

// CORS 白名單：只回信任的來源，其餘退回主站
const ORIGINS = ["https://vocab-duel.vercel.app", "https://vocab-duel.pages.dev", "https://vocab-duel.netlify.app", "http://localhost:8765"];
const cors = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGINS.includes(req.headers.origin) ? req.headers.origin : ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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
  try {
    if (req.method === "GET") {
      const code = req.query.code;
      if (!okCode(code)) return res.status(400).json({ error: "bad code" });
      const all = (await redis.hgetall(key(code))) || {};
      const rows = Object.entries(all).map(([name, v]) => {
        const d = typeof v === "string" ? JSON.parse(v) : v;
        return { name, mastered: d.mastered, level: d.level, streak: d.streak, badges: d.badges, weekMastered: d.weekMastered || 0, assign: d.assign || null, ts: d.ts };
      });
      if (req.query.sort === "week") rows.sort((a, b) => b.weekMastered - a.weekMastered || b.mastered - a.mastered);
      else rows.sort((a, b) => b.mastered - a.mastered || b.level - a.level || b.streak - a.streak);
      return res.status(200).json({ code, rows });
    }
    if (req.method === "POST") {
      if (await rateLimited(req, "board")) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      const { action, code, name } = req.body || {};
      if (!okCode(code)) return res.status(400).json({ error: "班級代碼須為 2–16 個中英數字" });
      if (action === "sync") {
        if (!okName(name)) return res.status(400).json({ error: "名字須為 1–12 字" });
        if (BAD_WORDS.test(name)) return res.status(400).json({ error: "名字含不當字詞，請更換" });
        const nm = name.trim();
        const k = key(code);
        const prevRaw = await redis.hget(k, nm);
        const prev = prevRaw ? (typeof prevRaw === "string" ? JSON.parse(prevRaw) : prevRaw) : null;
        if (!prev && (await redis.hlen(k)) >= MAX_MEMBERS)
          return res.status(400).json({ error: "這個班級已滿 60 人" });
        const rec = {
          mastered: clamp(req.body.mastered, 6205),
          level: clamp(req.body.level, 99),
          streak: clamp(req.body.streak, 3650),
          badges: clamp(req.body.badges, 100),
          weekMastered: clamp(req.body.weekMastered, 6205),
          assign: cleanAssign(req.body.assign),
          ts: Date.now(),
        };
        const reason = implausibleSync(prev, rec);
        if (reason) return res.status(400).json({ error: reason });
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
