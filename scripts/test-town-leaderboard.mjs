import { onRequest as townApi } from '../functions/api/town.js';

function fakeRedis() {
  const zsets = new Map();
  const hashes = new Map();
  return {
    zsets, hashes,
    async incr() { return 1; },
    async zadd(key, { member, score }) { const z = zsets.get(key) || new Map(); z.set(String(member), Number(score)); zsets.set(key, z); return 1; },
    async zrange(key, start, stop, opts = {}) {
      let rows = [...(zsets.get(key) || new Map())].sort((a, b) => opts.rev ? b[1] - a[1] : a[1] - b[1]);
      rows = rows.slice(start, stop < 0 ? undefined : stop + 1);
      return opts.withScores ? rows.flatMap(([member, score]) => [member, score]) : rows.map(([member]) => member);
    },
    async zremrangebyrank(key, start, stop) {
      const z = zsets.get(key) || new Map();
      const rows = [...z].sort((a, b) => a[1] - b[1]);
      const end = stop < 0 ? rows.length + stop : stop;
      if (start > end) return 0;
      for (const [member] of rows.slice(start, end + 1)) z.delete(member);
      return 1;
    },
    async zrem(key, ...members) { const z = zsets.get(key); for (const m of members) z?.delete(String(m)); return members.length; },
    async hset(key, values) { const h = hashes.get(key) || {}; Object.assign(h, values); hashes.set(key, h); return Object.keys(values).length; },
    async hget(key, field) { return hashes.get(key)?.[field] ?? null; },
    async hdel(key, ...fields) { const h = hashes.get(key); for (const f of fields) if (h) delete h[f]; return fields.length; }
  };
}

async function call(redis, body) {
  const request = new Request('https://vocab-duel.pages.dev/api/town', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://vocab-duel.pages.dev', 'cf-connecting-ip': '127.0.0.1' },
    body: JSON.stringify(body)
  });
  const response = await townApi({ request, env: { __redis: redis } });
  return { status: response.status, body: await response.json() };
}

let failures = 0;
const check = (condition, message) => {
  if (condition) console.log('PASS:', message);
  else { console.error('FAIL:', message); failures++; }
};

const redis = fakeRedis();
let result = await call(redis, { op: 'rank', playerId: 'player_aaaaaaaaaaaa', nick: '安哥', townName: '安哥之城', mastered: 880, townLv: 5 });
check(result.status === 200 && result.body.ok === 1, '單字之城可同步精熟字數');
await call(redis, { op: 'rank', playerId: 'player_bbbbbbbbbbbb', nick: '默默', townName: '默默學城', mastered: 920, townLv: 4 });
result = await call(redis, { op: 'ranklist' });
check(result.body.board?.length === 2 && result.body.board[0].nick === '默默' && result.body.board[0].mastered === 920, '單字之城依精熟字數降冪排序');

result = await call(redis, { op: 'rank', playerId: 'player_badbadbadbad', nick: '学习达人', townName: '学习之城', mastered: 6205, townLv: 5 });
check(result.body.ok === 0 && /簡體/.test(result.body.error || ''), '單字之城拒絕簡體玩家名與城名');

for (let i = 0; i < 503; i++) {
  await call(redis, {
    op: 'rank', playerId: `player_${String(i).padStart(12, '0')}`,
    nick: `學者${i}`, townName: `學城${i}`, mastered: i, townLv: (i % 5) + 1
  });
}
result = await call(redis, { op: 'ranklist' });
check(result.body.board?.length === 500, '單字之城排行榜只保留前 500 名');
check(result.body.board?.[0]?.mastered === 920 && result.body.board?.at(-1)?.mastered === 4, '前 500 名保留最高精熟字數並淘汰低分資料');

if (failures) process.exit(1);
console.log('\nALL PASS — 單字之城精熟排行榜通過');
