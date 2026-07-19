// 單字之城雲端綁定 — 城鎮狀態綁同步碼跨裝置（WordToken 是遊戲內記帳單位，非真金錢）
// POST { op:'save', code, town }                → 上傳，回 { visitCode }（6 碼參觀碼，冪等）
// POST { op:'load', code }                      → 下載
// POST { op:'visit', visitCode }                → 參觀模式：憑參觀碼唯讀城鎮（不暴露本體同步碼）
// POST { op:'cheer', visitCode, nick, emoji }   → 訪客留言（LPUSH 保 20 筆）
// POST { op:'guestbook', code }                 → 城主憑本體碼讀訪客簿，回 { list }
import { redisFor, vercelToPages } from "./_redis.js";
let redis;


const TTL = 400 * 24 * 60 * 60;          // 約一年多，過期自動清（與 sync.js 個人存檔一致；原本城鎮資料永不過期，隱私頁審查點名補上）
const KEY = (code) => `vd:town:${code}`;
const VISIT = (v) => `vd:town:visit:${v}`;       // 參觀碼 → 本體 code
const VISIT_OF = (code) => `vd:town:visitof:${code}`; // 本體 code → 參觀碼（冪等）
const GUEST = (code) => `vd:town:guest:${code}`; // 訪客簿（LPUSH，保 20 筆）
const okCode = (c) => typeof c === "string" && /^[A-Za-z0-9_-]{4,32}$/.test(c.trim());
const okVisit = (v) => typeof v === "string" && /^[A-Z0-9]{6}$/.test(String(v).trim().toUpperCase());
// 暱稱黑名單：常見中英文辱罵字詞（非窮舉），暱稱/城名會顯示在訪客簿與城鎮頁，擋掉明顯攻擊性字詞
const BAD_WORDS = /笨蛋|白癡|智障|廢物|去死|三小|幹你|靠北|媽的|垃圾|腦殘|fuck|shit|bitch|asshole|idiot|stupid|retard/i;
const okNick = (n) => typeof n === "string" && n.trim().length >= 1 && n.trim().length <= 12 && !/[<>&"']/.test(n) && !BAD_WORDS.test(n); // 拒收危險字元
const EMOJIS = ["👍", "🎉", "🏰", "💪", "🌟", "❤️", "😆", "👏"]; // 留言表情白名單
const GIFT_RES = ["wood", "stone", "ore", "rice"]; // 需與 js/townstore.js RES 一致
const GIFT_N = 10; // 每次贈禮固定數量，別讓贈禮取代自己蓋城的成就感
const genVisit = () => {
  const c = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 避開易混淆字元
  let s = "";
  for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
};

// CORS 白名單：只回信任的來源，其餘退回主站
const ORIGINS = ["https://vocab-duel.vercel.app", "https://vocab-duel.pages.dev", "https://vocab-duel.netlify.app", "http://localhost:8765"];
const cors = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGINS.includes(req.headers.origin) ? req.headers.origin : ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
};

// 輕量限流：每 IP 每 60 秒 30 次寫入，超過回 429
async function rateLimited(req, scope) {
  const ip = String((req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"]) || "").split(",")[0].trim() || "unknown";
  const k = `vd:rl:${scope}:${ip}`;
  const n = await redis.incr(k, 60);
  return n > 30;
}

async function handler(req, res, env) {
  redis = redisFor(env.DB);
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const { op, code } = req.body || {};
    // save / load / guestbook 走本體同步碼；visit / cheer 走 6 碼參觀碼（不暴露本體碼）
    if ((op === "save" || op === "load" || op === "guestbook") && !okCode(code))
      return res.status(200).json({ ok: 0, error: "同步碼格式不對" });

    if (op === "save") {
      if (await rateLimited(req, "town")) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      const town = req.body.town;
      if (!town || !town.grid || !town.res) return res.status(200).json({ ok: 0, error: "城鎮資料不完整" });
      // 城名淨化：濾掉危險字元並限長；含黑名單字詞直接拒絕（不靜默截斷）
      if (typeof town.name === "string") {
        town.name = town.name.replace(/[<>&"']/g, "").slice(0, 12);
        if (BAD_WORDS.test(town.name)) return res.status(200).json({ ok: 0, error: "城名含不當字詞，請更換" });
      }
      const s = JSON.stringify(town);
      if (s.length > 60000) return res.status(200).json({ ok: 0, error: "資料過大" });
      const c = code.trim();
      await redis.set(KEY(c), s, { ex: TTL });
      // 參觀碼：冪等——同一本體碼永遠回同一組；沒有才發新碼（最多試 5 次避撞）
      let visitCode = await redis.get(VISIT_OF(c));
      if (!visitCode) {
        for (let i = 0; i < 5 && !visitCode; i++) {
          const v = genVisit();
          if (!(await redis.exists(VISIT(v)))) {
            await redis.set(VISIT(v), c, { ex: TTL });
            await redis.set(VISIT_OF(c), v, { ex: TTL });
            visitCode = v;
          }
        }
      } else {
        await redis.expire(VISIT(visitCode), TTL);
        await redis.expire(VISIT_OF(c), TTL);
      }
      return res.status(200).json({ ok: 1, visitCode: visitCode || "" });
    }

    if (op === "load") {
      const raw = await redis.get(KEY(code.trim()));
      if (!raw) return res.status(200).json({ ok: 0, error: "雲端沒有這個同步碼的城" });
      return res.status(200).json({ ok: 1, town: typeof raw === "string" ? JSON.parse(raw) : raw });
    }

    if (op === "visit") {
      const v = String(req.body.visitCode || "").trim().toUpperCase();
      if (!okVisit(v)) return res.status(200).json({ ok: 0, error: "參觀碼格式不對" });
      const owner = await redis.get(VISIT(v));
      if (!owner) return res.status(200).json({ ok: 0, error: "找不到這座城" });
      const raw = await redis.get(KEY(owner));
      if (!raw) return res.status(200).json({ ok: 0, error: "找不到這座城" });
      // 唯讀：只回城鎮資料本身，絕不回傳本體同步碼
      return res.status(200).json({ ok: 1, town: typeof raw === "string" ? JSON.parse(raw) : raw });
    }

    if (op === "cheer") {
      if (await rateLimited(req, "towncheer")) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      const v = String(req.body.visitCode || "").trim().toUpperCase();
      const { nick, emoji } = req.body;
      if (!okVisit(v)) return res.status(200).json({ ok: 0, error: "參觀碼格式不對" });
      if (!okNick(nick)) return res.status(200).json({ ok: 0, error: "暱稱須為 1–12 字" });
      if (!EMOJIS.includes(emoji)) return res.status(200).json({ ok: 0, error: "表情不合法" });
      const owner = await redis.get(VISIT(v));
      if (!owner) return res.status(200).json({ ok: 0, error: "找不到這座城" });
      const gk = GUEST(owner);
      await redis.lpush(gk, JSON.stringify({ nick: nick.trim(), emoji, ts: Date.now() }));
      await redis.ltrim(gk, 0, 19); // 訪客簿只保最新 20 筆
      await redis.expire(gk, TTL);
      return res.status(200).json({ ok: 1 });
    }

    if (op === "gift") {
      // 訪客資源贈禮：城鎮是單一 JSON 快照（非 Redis hash），只能整包讀改寫回，非真正原子操作；
      // 每訪客每天限贈一次把衝突機率壓到很低，且贈禮只是加成非核心進度，就算極少數情況被城主的下一次
      // save 覆蓋掉也無傷大雅（比起重寫整個城鎮儲存結構為 hash，這個代價可以接受）
      if (await rateLimited(req, "towngift")) return res.status(429).json({ error: "操作太頻繁，請稍候再試" });
      const v = String(req.body.visitCode || "").trim().toUpperCase();
      const resType = req.body.res;
      if (!okVisit(v)) return res.status(200).json({ ok: 0, error: "參觀碼格式不對" });
      if (!GIFT_RES.includes(resType)) return res.status(200).json({ ok: 0, error: "資源種類不合法" });
      const owner = await redis.get(VISIT(v));
      if (!owner) return res.status(200).json({ ok: 0, error: "找不到這座城" });
      const ip = String((req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"]) || "").split(",")[0].trim() || "unknown";
      const today = new Date().toISOString().slice(0, 10);
      const giftKey = `vd:town:giftday:${v}:${ip}`;
      if ((await redis.get(giftKey)) === today) return res.status(200).json({ ok: 0, error: "今天已經贈送過了，明天再來吧" });
      const raw = await redis.get(KEY(owner));
      if (!raw) return res.status(200).json({ ok: 0, error: "找不到這座城" });
      const town = typeof raw === "string" ? JSON.parse(raw) : raw;
      town.res = town.res || {};
      town.res[resType] = (town.res[resType] || 0) + GIFT_N;
      await redis.set(KEY(owner), JSON.stringify(town), { ex: TTL });
      await redis.set(giftKey, today, { ex: 90000 });
      return res.status(200).json({ ok: 1, res: resType, n: GIFT_N });
    }

    if (op === "guestbook") {
      const raw = await redis.lrange(GUEST(code.trim()), 0, 19);
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
