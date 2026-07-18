// P3-14 傳承銘文（UGC）：學生為詞靈家族的字寫的例句，匿名共享成別人的提示卡
// POST { op:'submit', petId, word, text, hero } → { ok:1 }（寫入即過濾發布：髒話/連結/個資擋在寫入端）
// POST { op:'list', petId, classcode? } → { lore:[{word,text,hero}] }（隨機回最多 12 則；classoff 開啟時回空）
// POST { op:'report', petId, index }        → 任一學生檢舉：即時隱藏該則、暫存 reported 供老師覆核（限流）
// POST { op:'moderate', adminKey, petId, index } → 老師下架單則已發布銘文
// POST { op:'classoff', adminKey, classcode, on } → 老師關閉/開啟全班 UGC
// POST { op:'approve', adminKey, petId, index }   → （選用預審模式才需要）核可 pending 單則
import { redisFor, vercelToPages } from "./_redis.js";
let redis;

const ORIGINS = ["https://vocab-duel.vercel.app", "https://vocab-duel.pages.dev", "https://vocab-duel.netlify.app", "http://localhost:8765"];
const cors = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGINS.includes(req.headers.origin) ? req.headers.origin : ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
};

// 每 IP 每 5 分鐘最多 20 次投稿
async function rateLimited(req) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const k = `vd:rl:lore:${ip}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, 300);
  return n > 20;
}

// 髒話/不當字黑名單（比照 board.js 暱稱黑名單，非窮舉）
const BAD_WORDS = /笨蛋|白癡|智障|廢物|去死|三小|幹你|靠北|媽的|垃圾|腦殘|fuck|shit|bitch|asshole|idiot|stupid|retard/i;
// 連結／email／電話樣式一律拒（防個資與導流）
const CONTACT_LIKE = /https?:\/\/|www\.|\.(com|net|org|tw|io|cc)\b|@[a-z0-9.]+\.[a-z]{2,}|\b09\d{2}[-\s]?\d{3}[-\s]?\d{3}\b|\bline\s*id\b|加\s*line|加賴/i;

const clean = (s, max) => String(s || "").replace(/[<>]/g, "").trim().slice(0, max);
const okId = id => /^(fu_)?[a-z0-9_]{1,32}$/i.test(id);
const okCode = c => typeof c === "string" && /^[一-鿿A-Za-z0-9_-]{2,16}$/.test(c);

async function handler(req, res, env) {
  redis = redisFor(env.DB);
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const op = req.body?.op;

    if (op === "classoff") {
      const adminKey = String(req.body?.adminKey || "");
      if (!env.ADMIN_KEY || adminKey !== env.ADMIN_KEY) return res.status(403).json({ ok: 0, error: "forbidden" });
      const classcode = String(req.body?.classcode || "");
      if (!okCode(classcode)) return res.status(200).json({ ok: 0, error: "bad classcode" });
      const on = !!req.body?.on;
      if (on) await redis.set(`vd:lore:off:${classcode}`, "1");
      else await redis.del(`vd:lore:off:${classcode}`);
      return res.status(200).json({ ok: 1, off: on });
    }

    if (op === "approve") {
      const adminKey = String(req.body?.adminKey || "");
      if (!env.ADMIN_KEY || adminKey !== env.ADMIN_KEY) return res.status(403).json({ ok: 0, error: "forbidden" });
      const petId = String(req.body?.petId || "");
      if (!okId(petId)) return res.status(200).json({ ok: 0, error: "bad petId" });
      const pendingKey = `vd:lore:pending:${petId}`;
      const key = `vd:lore:${petId}`;
      const idx = Number(req.body?.index);
      const raw = await redis.lrange(pendingKey, 0, 199);
      if (!Number.isInteger(idx) || idx < 0 || idx >= raw.length) return res.status(200).json({ ok: 0, error: "bad index" });
      const kept = raw.filter((_, i) => i !== idx);
      await redis.del(pendingKey);
      if (kept.length) {
        await redis.lpush(pendingKey, ...kept.slice().reverse());
        await redis.expire(pendingKey, 60 * 60 * 24 * 400);
      }
      await redis.lpush(key, raw[idx]);
      await redis.ltrim(key, 0, 199);
      await redis.expire(key, 60 * 60 * 24 * 400);
      return res.status(200).json({ ok: 1 });
    }

    if (op === "moderate") {
      const adminKey = String(req.body?.adminKey || "");
      if (!env.ADMIN_KEY || adminKey !== env.ADMIN_KEY) return res.status(403).json({ ok: 0, error: "forbidden" });
      const petId = String(req.body?.petId || "");
      if (!okId(petId)) return res.status(200).json({ ok: 0, error: "bad petId" });
      const key = `vd:lore:${petId}`;
      const idx = Number(req.body?.index);
      const raw = await redis.lrange(key, 0, 199);
      if (!Number.isInteger(idx) || idx < 0 || idx >= raw.length) return res.status(200).json({ ok: 0, error: "bad index" });
      // 重建清單（去掉命中的那一則）並整批覆寫
      const kept = raw.filter((_, i) => i !== idx);
      await redis.del(key);
      if (kept.length) {
        await redis.lpush(key, ...kept.slice().reverse());
        await redis.expire(key, 60 * 60 * 24 * 400);
      }
      return res.status(200).json({ ok: 1 });
    }

    const petId = String(req.body?.petId || "");
    if (!okId(petId)) return res.status(200).json({ ok: 0, error: "bad petId" });
    const key = `vd:lore:${petId}`;
    const pendingKey = `vd:lore:pending:${petId}`;

    if (op === "list") {
      const classcode = req.body?.classcode;
      if (classcode && okCode(classcode)) {
        const off = await redis.get(`vd:lore:off:${classcode}`);
        if (off) return res.status(200).json({ ok: 1, lore: [] });
      }
      // 只回已核可（vd:lore:{petId}），從不回 pending 佇列
      const raw = await redis.lrange(key, 0, 199);
      const items = raw.map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
      // 隨機挑最多 12 則（Fisher–Yates 前 12）
      for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[items[i], items[j]] = [items[j], items[i]]; }
      return res.status(200).json({ ok: 1, lore: items.slice(0, 12) });
    }

    if (op === "submit") {
      if (await rateLimited(req)) return res.status(429).json({ error: "太頻繁，請稍候再試" });
      const word = clean(req.body?.word, 40).toLowerCase();
      const text = clean(req.body?.text, 80);
      const hero = clean(req.body?.hero, 20) || "無名學徒";
      if (!/^[a-z][a-z' -]*$/.test(word)) return res.status(200).json({ ok: 0, error: "bad word" });
      if (text.length < 6) return res.status(200).json({ ok: 0, error: "too short" });
      if (!text.toLowerCase().includes(word)) return res.status(200).json({ ok: 0, error: "must contain word" });
      if (BAD_WORDS.test(text) || BAD_WORDS.test(hero)) return res.status(200).json({ ok: 0, reason: "blocked" });
      if (CONTACT_LIKE.test(text) || CONTACT_LIKE.test(hero)) return res.status(200).json({ ok: 0, reason: "blocked" });
      // 過濾通過即發布（寫入即過濾模型）：髒話/連結/個資已擋在寫入端，其餘走「檢舉即隱藏＋教師下架/關班」後審。
      // （若日後要改預審，把 key 換回 pendingKey、並用 approve op 逐則核可即可。）
      await redis.lpush(key, { word, text, hero });
      await redis.ltrim(key, 0, 199);
      await redis.expire(key, 60 * 60 * 24 * 400);
      return res.status(200).json({ ok: 1 });
    }

    if (op === "report") {
      // 任一學生檢舉：以「內容比對」定位（list 隨機挑 12 則，client 的 index 與 server 不對齊，故用 word+text 比對），
      // 即時把該則從公開清單移除、暫存到 reported 供老師覆核（限流防濫檢舉）
      if (await rateLimited(req)) return res.status(429).json({ error: "太頻繁，請稍候再試" });
      const rword = clean(req.body?.word, 40).toLowerCase();
      const rtext = clean(req.body?.text, 80);
      if (!rword || !rtext) return res.status(200).json({ ok: 0, error: "bad target" });
      const raw = await redis.lrange(key, 0, 199);
      const parsed = raw.map(x => { try { return JSON.parse(x); } catch { return null; } });
      const hitIdx = parsed.findIndex(p => p && String(p.word).toLowerCase() === rword && p.text === rtext);
      if (hitIdx < 0) return res.status(200).json({ ok: 1, hidden: 0 }); // 找不到（可能已被移除）也回成功，別洩漏狀態
      const kept = raw.filter((_, i) => i !== hitIdx);
      await redis.del(key);
      if (kept.length) { await redis.lpush(key, ...kept.slice().reverse()); await redis.expire(key, 60 * 60 * 24 * 400); }
      const reportedKey = `vd:lore:reported:${petId}`;
      await redis.lpush(reportedKey, raw[hitIdx]);
      await redis.ltrim(reportedKey, 0, 99);
      await redis.expire(reportedKey, 60 * 60 * 24 * 400);
      return res.status(200).json({ ok: 1, hidden: 1 });
    }

    return res.status(200).json({ ok: 0, error: "unknown op" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}

export const onRequest = vercelToPages(handler);
