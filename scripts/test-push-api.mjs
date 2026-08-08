/* Push API 契約：白名單、加密儲存、done、dispatch、unsubscribe */
import { handler } from '../functions/api/push.js';

const hash = {};
const counters = {};
const redis = {
  async incr(key) { counters[key] = (counters[key] || 0) + 1; return counters[key]; },
  async hset(key, object) { hash[key] ||= {}; Object.assign(hash[key], object); return Object.keys(object).length; },
  async hget(key, field) { return hash[key]?.[field] ?? null; },
  async hgetall(key) { return hash[key] || null; },
  async hdel(key, field) { if (!hash[key] || !(field in hash[key])) return 0; delete hash[key][field]; return 1; },
  async expire() { return 1; }
};
const bytes = new Uint8Array(32);
const dataKey = Buffer.from(bytes).toString('base64url');
let sent = 0;
const env = {
  __redis: redis,
  __now: Date.parse('2026-08-02T11:30:00Z'),
  __sendNotification: async () => { sent++; },
  PUSH_DATA_KEY: dataKey,
  VAPID_PUBLIC_KEY: 'test-public-key',
  VAPID_PRIVATE_KEY: 'test-private-key',
  PUSH_DISPATCH_SECRET: 'dispatch-secret'
};

function response() {
  return {
    code: 200, body: null, headers: {},
    setHeader(key, value) { this.headers[key] = String(value); return this; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; }
  };
}
async function call(body, origin = 'https://vocab-duel.pages.dev', headers = {}) {
  const req = { method: 'POST', body, query: {}, headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': '127.0.0.1', ...headers } };
  const res = response();
  await handler(req, res, env);
  return res;
}

let failures = 0;
const ok = (condition, message) => {
  if (condition) console.log('PASS:', message);
  else { console.error('FAIL:', message); failures++; }
};

const subscription = { endpoint: 'https://push.example/sub/abc', keys: { p256dh: 'a'.repeat(40), auth: 'b'.repeat(20) } };
const deviceId = 'device_1234567890abcdef';
let res = await call({ op: 'subscribe', deviceId, subscription, time: '19:30', timezone: 'Asia/Taipei' });
ok(res.code === 200 && res.body.ok === 1, '訂閱成功');
const encrypted = hash['vd:push:subscriptions'][deviceId];
ok(typeof encrypted === 'string' && !encrypted.includes('push.example'), 'Push endpoint 以 AES-GCM 加密儲存');

res = await call({ op: 'done', deviceId, date: '2026-08-01' });
ok(res.body.ok === 1, '完成日可冪等寫入');

res = await call({ op: 'dispatch' }, '', { authorization: 'Bearer dispatch-secret' });
ok(res.body.ok === 1 && res.body.sent === 1 && sent === 1, '排程端點只對到點且未完成者派送');

res = await call({ op: 'unsubscribe', deviceId });
ok(res.body.ok === 1 && !(deviceId in hash['vd:push:subscriptions']), '取消後完全刪除訂閱');

res = await call({ op: 'subscribe', deviceId, subscription, time: '19:30', timezone: 'Asia/Taipei' }, 'https://evil.example');
ok(res.code === 403, '非白名單來源被拒絕');

if (failures) process.exit(1);
console.log('\nALL PASS — Push API 契約通過');
