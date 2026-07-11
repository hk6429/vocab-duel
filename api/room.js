// 即時對戰房間 — 4 位數房號、Upstash 輪詢制（回合答題 1–2 秒延遲夠用）
// POST { op:'create', snap }                    → 開房，回 { code, seed }
// POST { op:'join', code, snap }                → 加入，回 { seed, opp }
// POST { op:'push', code, role, state }         → 寫入自己的對戰狀態
// POST { op:'poll', code, role }                → 讀對方狀態（附房間 meta）
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const TTL = 600; // 房間 10 分鐘
const keyOf = (code) => `vd:room:${code}`;
const clamp = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
const okNick = (n) => typeof n === "string" && n.trim().length >= 1 && n.trim().length <= 12;
const okCode = (c) => typeof c === "string" && /^\d{4}$/.test(c);
const okRole = (r) => r === "p1" || r === "p2";

const cors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
};

function cleanSnap(s) {
  if (!s || !okNick(s.nick)) return null;
  return {
    nick: s.nick.trim(),
    petId: typeof s.petId === "string" ? s.petId.slice(0, 16) : "",
    petName: typeof s.petName === "string" ? s.petName.slice(0, 8) : "詞靈",
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
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const { op } = req.body || {};

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

    return res.status(400).json({ error: "bad op" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
