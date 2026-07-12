// 即時對戰房間 — 4 位數房號、Upstash 輪詢制（回合答題 1–2 秒延遲夠用）
// POST { op:'create', snap }                    → 開房，回 { code, seed }
// POST { op:'join', code, snap }                → 加入，回 { seed, opp }
// POST { op:'push', code, role, state }         → 寫入自己的對戰狀態
// POST { op:'poll', code, role }                → 讀對方狀態（附房間 meta）
// —— 非同步挑戰書（不用同時在線）——
// POST { op:'challenge', seed, scope, nick, score }   → 發戰帖，回 { code }（6 碼，7 天有效）
// POST { op:'accept', code }                          → 領戰帖，回 { seed, scope, challenger, score }
// POST { op:'challengeResult', code, nick, score }    → 回報應戰成績，回 { ok, challenger, accepter }
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const TTL = 600; // 房間 10 分鐘
const CH_TTL = 7 * 86400; // 挑戰書 7 天
const keyOf = (code) => `vd:room:${code}`;
const chKey = (code) => `vd:room:ch:${code}`;
const okChCode = (c) => typeof c === "string" && /^[A-Z0-9]{6}$/.test(String(c).trim().toUpperCase());
const genChCode = () => {
  const cs = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 避開易混淆字元
  let s = "";
  for (let i = 0; i < 6; i++) s += cs[Math.floor(Math.random() * cs.length)];
  return s;
};
const clamp = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
// 暱稱黑名單：常見中英文辱罵字詞（非窮舉），暱稱會顯示在對戰畫面與戰帖，擋掉明顯攻擊性暱稱
const BAD_WORDS = /笨蛋|白癡|智障|廢物|去死|三小|幹你|靠北|媽的|垃圾|腦殘|fuck|shit|bitch|asshole|idiot|stupid|retard/i;
const okNick = (n) => typeof n === "string" && n.trim().length >= 1 && n.trim().length <= 12 && !BAD_WORDS.test(n);
const okCode = (c) => typeof c === "string" && /^\d{4}$/.test(c);
const okRole = (r) => r === "p1" || r === "p2";

// CORS 白名單：只回信任的來源，其餘退回主站
const ORIGINS = ["https://vocab-duel.vercel.app", "https://vocab-duel.pages.dev", "https://vocab-duel.netlify.app", "http://localhost:8765"];
const cors = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGINS.includes(req.headers.origin) ? req.headers.origin : ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
};

// 輕量限流：每 IP 每 60 秒 cap 次寫入，超過回 429
async function rateLimited(req, scope, cap = 30) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const k = `vd:rl:${scope}:${ip}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, 60);
  return n > cap;
}

const stripBad = (x) => String(x ?? "").replace(/[<>&"']/g, ""); // 濾掉危險字元

function cleanSnap(s) {
  if (!s || !okNick(s.nick)) return null;
  const nick = stripBad(s.nick).trim();
  if (!nick) return null;
  return {
    nick,
    petId: typeof s.petId === "string" ? s.petId.slice(0, 16) : "",
    petName: (typeof s.petName === "string" ? stripBad(s.petName).slice(0, 8) : "") || "詞靈",
    lv: clamp(s.lv, 25) || 1,
    atk: clamp(s.atk, 300) || 10,
    hp: clamp(s.hp, 800) || 100,
    scope: typeof s.scope === "string" ? s.scope.slice(0, 4) : "E",
  };
}

function cleanState(s) {
  if (!s) return null;
  return {
    dmg: clamp(s.dmg, 99999),   // 累計輸出傷害（攻擊方權威）
    round: clamp(s.round, 40),
    combo: clamp(s.combo, 40),
    correct: clamp(s.correct, 40),
    done: s.done ? 1 : 0,
    hb: Date.now(),
  };
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const { op } = req.body || {};
    // 寫入操作限流（poll 為讀取不限；push 頻率高，用較寬的獨立桶）
    if (op === "create" || op === "join") {
      if (await rateLimited(req, "room")) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
    }

    if (op === "create") {
      const snap = cleanSnap(req.body.snap);
      if (!snap) return res.status(400).json({ error: "bad snap" });
      // 找一個沒人用的 4 位數房號（最多試 8 次）
      let code = "";
      for (let i = 0; i < 8; i++) {
        const c = String(1000 + Math.floor(Math.random() * 9000));
        if (!(await redis.exists(keyOf(c)))) { code = c; break; }
      }
      if (!code) return res.status(500).json({ error: "no room" });
      const seed = Math.floor(Math.random() * 1e9);
      await redis.set(keyOf(code), JSON.stringify({ seed, scope: snap.scope }), { ex: TTL });
      await redis.set(`${keyOf(code)}:p1`, JSON.stringify({ snap, state: null, hb: Date.now() }), { ex: TTL });
      return res.status(200).json({ ok: 1, code, seed });
    }

    if (op === "join") {
      const { code } = req.body;
      const snap = cleanSnap(req.body.snap);
      if (!okCode(code) || !snap) return res.status(400).json({ error: "bad req" });
      const meta = await redis.get(keyOf(code));
      if (!meta) return res.status(200).json({ ok: 0, error: "房間不存在或已過期" });
      if (await redis.exists(`${keyOf(code)}:p2`)) return res.status(200).json({ ok: 0, error: "房間已滿" });
      const p1 = await redis.get(`${keyOf(code)}:p1`);
      await redis.set(`${keyOf(code)}:p2`, JSON.stringify({ snap, state: null, hb: Date.now() }), { ex: TTL });
      const m = typeof meta === "string" ? JSON.parse(meta) : meta;
      const o = typeof p1 === "string" ? JSON.parse(p1) : p1;
      return res.status(200).json({ ok: 1, seed: m.seed, scope: m.scope, opp: o ? o.snap : null });
    }

    if (op === "push") {
      if (await rateLimited(req, "room:push", 90)) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      const { code, role } = req.body;
      const state = cleanState(req.body.state);
      if (!okCode(code) || !okRole(role) || !state) return res.status(400).json({ error: "bad req" });
      const cur = await redis.get(`${keyOf(code)}:${role}`);
      const obj = cur ? (typeof cur === "string" ? JSON.parse(cur) : cur) : { snap: null };
      obj.state = state; obj.hb = Date.now();
      await redis.set(`${keyOf(code)}:${role}`, JSON.stringify(obj), { ex: TTL });
      return res.status(200).json({ ok: 1 });
    }

    if (op === "poll") {
      const { code, role } = req.body;
      if (!okCode(code) || !okRole(role)) return res.status(400).json({ error: "bad req" });
      const other = role === "p1" ? "p2" : "p1";
      const [meta, raw] = await Promise.all([redis.get(keyOf(code)), redis.get(`${keyOf(code)}:${other}`)]);
      if (!meta) return res.status(200).json({ ok: 0, error: "房間已過期" });
      const o = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;
      return res.status(200).json({
        ok: 1,
        opp: o ? { snap: o.snap, state: o.state, hb: o.hb } : null,
        now: Date.now(),
      });
    }

    if (op === "challenge") {
      if (await rateLimited(req, "room")) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      const { seed, scope, nick, score } = req.body;
      if (!okNick(nick)) return res.status(400).json({ error: "bad req" });
      const rec = {
        seed: clamp(seed, 1e9),
        scope: typeof scope === "string" ? stripBad(scope).slice(0, 4) : "E",
        nick: stripBad(nick).trim().slice(0, 12),
        score: clamp(score, 999999),
        ts: Date.now(),
      };
      if (!rec.nick) return res.status(400).json({ error: "bad req" });
      // 找一個沒人用的 6 碼戰帖號（最多試 8 次）
      let code = "";
      for (let i = 0; i < 8; i++) {
        const c = genChCode();
        if (!(await redis.exists(chKey(c)))) { code = c; break; }
      }
      if (!code) return res.status(500).json({ error: "no code" });
      await redis.set(chKey(code), JSON.stringify(rec), { ex: CH_TTL });
      return res.status(200).json({ ok: 1, code });
    }

    if (op === "accept") {
      const code = String(req.body.code || "").trim().toUpperCase();
      if (!okChCode(code)) return res.status(200).json({ ok: 0, error: "戰帖碼格式不對" });
      const raw = await redis.get(chKey(code));
      if (!raw) return res.status(200).json({ ok: 0, error: "戰帖不存在或已過期" });
      const c = typeof raw === "string" ? JSON.parse(raw) : raw;
      return res.status(200).json({ ok: 1, seed: c.seed, scope: c.scope, challenger: c.nick, score: c.score });
    }

    if (op === "challengeResult") {
      if (await rateLimited(req, "room")) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      const code = String(req.body.code || "").trim().toUpperCase();
      const { nick, score } = req.body;
      if (!okChCode(code) || !okNick(nick)) return res.status(200).json({ ok: 0, error: "資料不完整" });
      const raw = await redis.get(chKey(code));
      if (!raw) return res.status(200).json({ ok: 0, error: "戰帖不存在或已過期" });
      const c = typeof raw === "string" ? JSON.parse(raw) : raw;
      const accepter = { nick: stripBad(nick).trim().slice(0, 12), score: clamp(score, 999999), ts: Date.now() };
      c.accepter = accepter; // 保留最近一次應戰結果
      await redis.set(chKey(code), JSON.stringify(c), { ex: CH_TTL });
      return res.status(200).json({
        ok: 1,
        challenger: { nick: c.nick, score: c.score },
        accepter: { nick: accepter.nick, score: accepter.score },
      });
    }

    return res.status(400).json({ error: "bad op" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
