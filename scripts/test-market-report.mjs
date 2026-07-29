import { onRequest } from '../functions/api/market.js';

class FakeD1 {
  constructor() {
    this.kv = new Map();
    this.zset = new Map();
  }

  prepare(sql) {
    const db = this;
    return {
      args: [],
      bind(...args) {
        this.args = args;
        return this;
      },
      async run() {
        const args = this.args;
        if (sql.startsWith('DELETE FROM kv')) {
          const rec = db.kv.get(args[0]);
          if (rec && rec.exp != null && rec.exp <= args[1]) db.kv.delete(args[0]);
          return {};
        }
        if (sql.includes("INSERT INTO kv (k,v,exp) VALUES (?1,'1',?2)")) {
          const [key, exp] = args;
          const rec = db.kv.get(key);
          db.kv.set(key, { value: String((Number(rec?.value) || 0) + 1), exp: rec?.exp ?? exp });
          return {};
        }
        if (sql.startsWith('INSERT INTO kv (k,v,exp)')) {
          const [key, value, exp] = args;
          db.kv.set(key, { value: String(value), exp });
          return {};
        }
        if (sql.startsWith('INSERT INTO zset')) {
          const [key, member, score] = args;
          db.zset.set(`${key}\n${member}`, { key, member, score, exp: null });
          return {};
        }
        throw new Error(`FakeD1 未支援 run SQL：${sql}`);
      },
      async first(column) {
        if (sql.startsWith('SELECT v FROM kv')) {
          const rec = db.kv.get(this.args[0]);
          return column ? rec?.value ?? null : rec ? { v: rec.value } : null;
        }
        throw new Error(`FakeD1 未支援 first SQL：${sql}`);
      },
      async all() {
        if (sql.startsWith('SELECT member, score FROM zset')) {
          return {
            results: [...db.zset.values()]
              .sort((a, b) => a.score - b.score || a.member.localeCompare(b.member))
              .map(({ member, score }) => ({ member, score }))
          };
        }
        throw new Error(`FakeD1 未支援 all SQL：${sql}`);
      }
    };
  }
}

const request = new Request('https://vocab-duel.pages.dev/api/market', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Origin: 'https://vocab-duel.pages.dev'
  },
  body: JSON.stringify({
    op: 'post',
    seller: '測試俠',
    price: 500,
    item: {
      slot: 'armor',
      tier: 'mythic',
      base: '綴皮氅',
      name: '神話綴皮氅',
      ico: '🛡️',
      atk: 0,
      hp: 51,
      perk: ''
    }
  })
});

const response = await onRequest({
  request,
  env: { DB: new FakeD1(), MARKET_SECRET: 'test-only-secret' }
});
const result = await response.json();

if (!result.ok) {
  console.error('FAIL: 神話綴皮氅 ❤️+51、價格 500 應可上架，實際回應：', result);
  process.exit(1);
}

console.log('PASS: 神話綴皮氅 ❤️+51、價格 500 可成功上架');
