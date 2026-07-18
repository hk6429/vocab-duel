// 教師最小後台 — 班級認領（班級碼+PIN）、字表指派發布、全班弱字聚合
// POST { op:'claim', code, pin, name }              → 認領班級（碼未被用過才成立）
// POST { op:'setAsg', code, pin, asg:{...} }        → 新增/更新一筆指派（上限 8 筆）
// POST { op:'delAsg', code, pin, id }               → 刪除指派
// POST { op:'get', code }                           → 學生端讀指派清單（公開，不含 PIN）
// POST { op:'weakReport', code, words:{word:n} }    → 學生端批次上報錯字次數
// POST { op:'weakTop', code, pin }                  → 老師讀全班弱字 Top 30
// POST { op:'selfReport', code, name, durable, learning, weak:{word:n} } → 學生端上報個人已鞏固/複習中計數＋弱字
// POST { op:'asgLog', code, name, asgId, results:{word:0|1} }           → 學生端上報單份指派逐字對錯
// POST { op:'studentDetail', code, pin, name }      → 老師讀單一學生弱字/作答明細（PIN 驗證）
// POST { op:'setAcc', code, pin, name, acc:{...} }  → 老師設定單一學生 IEP 調節（PIN 驗證）
// POST { op:'getAcc', code, name }                  → 讀某暱稱目前調節設定（供學生端 VDMode 套用）
import { redisFor, vercelToPages } from "./_redis.js";
let redis;


const TTL = 240 * 24 * 60 * 60; // 一學年左右，跟 board.js 一致
const KEY = (c) => `vd:class:${c}`;
const ASG_KEY = (c) => `vd:class:${c}:asg`;
const WEAK_KEY = (c) => `vd:weak:${c}`;
const SW_KEY = (c) => `vd:class:${c}:sw`;   // per-student 弱字/已鞏固複習中計數（field=暱稱）
const LOG_KEY = (c) => `vd:class:${c}:log`; // per-student 指派逐字對錯（field=暱稱::指派ID）
const ACC_KEY = (c) => `vd:class:${c}:acc`; // per-student IEP 個別調節（field=暱稱）
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

/* 個人弱字清單清洗：{word:n} → 依 n 降序取前 20 筆 */
function cleanWeakList(words) {
  if (!words || typeof words !== "object") return [];
  const entries = Object.entries(words)
    .filter(([w]) => okWord(w))
    .map(([w, n]) => ({ word: w.trim().toLowerCase(), n: Math.max(1, Math.min(999, Math.round(Number(n) || 1))) }));
  entries.sort((a, b) => b.n - a.n);
  return entries.slice(0, 20);
}

/* 指派逐字對錯清洗：{word:0|1} → 最多 200 筆，格式不對整筆拒收 */
function cleanResults(results) {
  if (!results || typeof results !== "object") return null;
  const out = {};
  let n = 0;
  for (const [w, v] of Object.entries(results)) {
    if (!okWord(w)) continue;
    out[w.trim().toLowerCase()] = v ? 1 : 0;
    if (++n >= 200) break;
  }
  return n ? out : null;
}

/* IEP 個別調節清洗：對齊 VDMode.acc 讀取格式 {extraTime,maxItems,noTimer,bigFont,hideEconomy} */
function cleanAcc(a) {
  const src = a && typeof a === "object" ? a : {};
  const extraTime = [1, 1.5, 2].includes(Number(src.extraTime)) ? Number(src.extraTime) : 1;
  const maxItems = src.maxItems == null || src.maxItems === "" ? null : Math.max(1, Math.min(200, Math.round(Number(src.maxItems) || 0)));
  return {
    extraTime,
    maxItems,
    noTimer: !!src.noTimer,
    bigFont: !!src.bigFont,
    hideEconomy: !!src.hideEconomy,
  };
}

async function handler(req, res, env) {
  redis = redisFor(env.DB);
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

    if (op === "selfReport") {
      // 學生端自我彙報：已鞏固/複習中計數 + 個人弱字清單（無 PIN，比照 weakReport 公開寫入）
      if (await rateLimited(req, "clsself", 20)) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      if (!(await redis.exists(KEY(code)))) return res.status(200).json({ ok: 0, error: "班級不存在" });
      const { name, durable, learning, weak } = req.body || {};
      if (!okName(name)) return res.status(200).json({ ok: 0, error: "暱稱格式不對" });
      const rec = {
        durable: Math.max(0, Math.min(6205, Math.round(Number(durable) || 0))),
        learning: Math.max(0, Math.min(6205, Math.round(Number(learning) || 0))),
        weak: cleanWeakList(weak),
        ts: Date.now(),
      };
      await redis.hset(SW_KEY(code), { [name.trim()]: JSON.stringify(rec) });
      await redis.expire(SW_KEY(code), TTL);
      return res.status(200).json({ ok: 1 });
    }

    if (op === "asgLog") {
      // 學生端上報某份指派的逐字對錯（無 PIN）
      if (await rateLimited(req, "clslog", 20)) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      if (!(await redis.exists(KEY(code)))) return res.status(200).json({ ok: 0, error: "班級不存在" });
      const { name, asgId, results } = req.body || {};
      if (!okName(name)) return res.status(200).json({ ok: 0, error: "暱稱格式不對" });
      if (!/^[a-z0-9]{1,8}$/.test(String(asgId || ""))) return res.status(200).json({ ok: 0, error: "指派 ID 不對" });
      const cleaned = cleanResults(results);
      if (!cleaned) return res.status(200).json({ ok: 0, error: "作答紀錄格式不對" });
      await redis.hset(LOG_KEY(code), { [`${name.trim()}::${asgId}`]: JSON.stringify({ results: cleaned, ts: Date.now() }) });
      await redis.expire(LOG_KEY(code), TTL);
      return res.status(200).json({ ok: 1 });
    }

    if (op === "studentDetail") {
      // 老師端讀單一學生：個人弱字 Top + 已鞏固/複習中計數 + 近期指派逐字對錯；PIN 驗證
      if (await rateLimited(req, "clsdetail", 30)) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      const cls = await authed(code, req.body.pin);
      if (!cls) return res.status(200).json({ ok: 0, error: "班級碼或 PIN 不對" });
      const { name } = req.body || {};
      if (!okName(name)) return res.status(200).json({ ok: 0, error: "暱稱格式不對" });
      const nm = name.trim();
      const swRaw = await redis.hget(SW_KEY(code), nm);
      const sw = swRaw ? parse(swRaw) : null;
      const allLogs = (await redis.hgetall(LOG_KEY(code))) || {};
      const prefix = `${nm}::`;
      const logs = Object.entries(allLogs)
        .filter(([f]) => f.startsWith(prefix))
        .map(([f, v]) => { const d = parse(v); return { asgId: f.slice(prefix.length), results: d.results, ts: d.ts }; })
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 10);
      return res.status(200).json({
        ok: 1,
        synced: !!(sw || logs.length),
        durable: sw ? sw.durable : null,
        learning: sw ? sw.learning : null,
        weak: sw ? sw.weak : [],
        logs,
      });
    }

    if (op === "setAcc") {
      // 老師端設定單一學生的 IEP 個別調節，PIN 驗證；格式對齊 VDMode.acc 讀取需求
      if (await rateLimited(req, "clsacc", 20)) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      const cls = await authed(code, req.body.pin);
      if (!cls) return res.status(200).json({ ok: 0, error: "班級碼或 PIN 不對" });
      const { name, acc } = req.body || {};
      if (!okName(name)) return res.status(200).json({ ok: 0, error: "暱稱格式不對" });
      const cleaned = cleanAcc(acc);
      await redis.hset(ACC_KEY(code), { [name.trim()]: JSON.stringify(cleaned) });
      await redis.expire(ACC_KEY(code), TTL);
      return res.status(200).json({ ok: 1, acc: cleaned });
    }

    if (op === "getAcc") {
      // 學生端（或老師端預覽）讀某暱稱目前的調節設定；無 PIN，公開唯讀，不含任何機敏資料
      if (await rateLimited(req, "clsacc", 30)) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      const { name } = req.body || {};
      if (!okName(name)) return res.status(200).json({ ok: 0, error: "暱稱格式不對" });
      const raw = await redis.hget(ACC_KEY(code), name.trim());
      return res.status(200).json({ ok: 1, acc: raw ? parse(raw) : null });
    }

    return res.status(400).json({ error: "bad op" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}

export const onRequest = vercelToPages(handler);
