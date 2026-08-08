import { onRequest as petsApi } from '../functions/api/pets.js';
import { onRequest as boardApi } from '../functions/api/board.js';

function fakeRedis() {
  const zsets = new Map();
  const hashes = new Map();
  const lists = new Map();
  return {
    zsets, hashes, lists,
    async incr() { return 1; },
    async lpush(key, value) { const a = lists.get(key) || []; a.unshift(value); lists.set(key, a); return a.length; },
    async ltrim() { return 'OK'; },
    async lrange(key) { return lists.get(key) || []; },
    async zadd(key, { member, score }) { const z = zsets.get(key) || new Map(); z.set(String(member), Number(score)); zsets.set(key, z); return 1; },
    async zrange(key, start, stop, opts = {}) {
      let rows = [...(zsets.get(key) || new Map())].sort((a, b) => opts.rev ? b[1] - a[1] : a[1] - b[1]);
      rows = rows.slice(start, stop < 0 ? undefined : stop + 1);
      return opts.withScores ? rows.flatMap(([member, score]) => [member, score]) : rows.map(([member]) => member);
    },
    async zremrangebyrank() { return 0; },
    async zrem(key, ...members) { const z = zsets.get(key); for (const m of members) z?.delete(String(m)); return members.length; },
    async hset(key, values) { const h = hashes.get(key) || {}; Object.assign(h, values); hashes.set(key, h); return Object.keys(values).length; },
    async hget(key, field) { return hashes.get(key)?.[field] ?? null; },
    async hgetall(key) { return hashes.get(key) || null; },
    async hlen(key) { return Object.keys(hashes.get(key) || {}).length; },
    async hdel(key, ...fields) { const h = hashes.get(key); for (const f of fields) if (h) delete h[f]; return fields.length; }
    ,async expire() { return 1; }
  };
}

async function callBoard(redis, { method = 'GET', body, code = '七年一班' } = {}) {
  const request = new Request(`https://vocab-duel.pages.dev/api/board?code=${encodeURIComponent(code)}`, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: 'https://vocab-duel.pages.dev', 'cf-connecting-ip': '127.0.0.1' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const response = await boardApi({ request, env: { __redis: redis } });
  return { status: response.status, body: await response.json() };
}

async function call(api, redis, body) {
  const request = new Request('https://vocab-duel.pages.dev/api/pets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://vocab-duel.pages.dev' },
    body: JSON.stringify(body)
  });
  const response = await api({ request, env: { __redis: redis } });
  return { status: response.status, body: await response.json() };
}

let failures = 0;
const check = (condition, message) => {
  if (condition) console.log('PASS:', message);
  else { console.error('FAIL:', message); failures++; }
};

const redis = fakeRedis();
let result = await call(petsApi, redis, {
  op: 'submit',
  snap: { nick: '一群有病是在鎮壓幾點 遜', petId: 'fu_cat', petName: '墨影狐', lv: 25, heroLv: 47, atk: 100, hp: 200, skills: [], rating: 26340 }
});
check(result.status === 400 && /負面|教育場域/.test(result.body.error || ''), '詞靈榜送出前拒絕負面名稱');

await redis.zadd('vd:petboard:global', { member: '一群有病是在鎮壓幾點 遜', score: 26340 });
await redis.zadd('vd:petboard:global', { member: '默默', score: 26000 });
await redis.hset('vd:petboard:meta', {
  '一群有病是在鎮壓幾點 遜': JSON.stringify({ petName: '可憐兒一群', lv: 25, heroLv: 47 }),
  '默默': JSON.stringify({ petName: '沛靈鹿', lv: 25, heroLv: 55 })
});
result = await call(petsApi, redis, { op: 'board' });
check(result.body.board?.length === 1 && result.body.board[0].nick === '默默', '詞靈榜讀取時隱藏既有違規名稱');

result = await callBoard(redis, {
  method: 'POST',
  body: { action: 'sync', code: '七年一班', name: '学习达人', mastered: 500, level: 10, streak: 3, badges: 1 }
});
check(result.status === 400 && /簡體/.test(result.body.error || ''), '班級榜送出前拒絕簡體名稱');

await redis.hset('vd:board:七年一班', {
  '投資老師加賴': JSON.stringify({ mastered: 999, level: 20, streak: 5, badges: 1 }),
  '安哥': JSON.stringify({ mastered: 800, level: 18, streak: 4, badges: 2 })
});
result = await callBoard(redis);
check(result.body.rows?.length === 1 && result.body.rows[0].name === '安哥', '班級榜讀取時隱藏既有詐騙式名稱');

if (failures) process.exit(1);
console.log('\nALL PASS — 公開榜單名稱審核 API 通過');
