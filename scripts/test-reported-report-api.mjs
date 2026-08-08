import { onRequest } from '../functions/api/report.js';

class FakeD1 {
  constructor() { this.kv = new Map(); }
  prepare(sql) {
    const db = this;
    return {
      args: [],
      bind(...args) { this.args = args; return this; },
      async run() {
        if (sql.startsWith('DELETE FROM kv')) return {};
        if (sql.includes("INSERT INTO kv (k,v,exp) VALUES (?1,'1',?2)")) {
          const [key, exp] = this.args;
          const rec = db.kv.get(key);
          db.kv.set(key, { value: String((Number(rec?.value) || 0) + 1), exp });
          return {};
        }
        throw new Error(`FakeD1 未支援 SQL：${sql}`);
      },
      async first(column) {
        if (sql.startsWith('SELECT v FROM kv')) {
          const value = db.kv.get(this.args[0])?.value ?? null;
          return column ? value : value == null ? null : { v: value };
        }
        throw new Error(`FakeD1 未支援 SQL：${sql}`);
      }
    };
  }
}

let telegramText = '';
globalThis.fetch = async (_url, options) => {
  telegramText = JSON.parse(options.body).text;
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

const request = new Request('https://vocab-duel.pages.dev/api/report', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Origin: 'https://vocab-duel.vercel.app',
    'CF-Connecting-IP': '203.0.113.10'
  },
  body: JSON.stringify({
    word: 'I go to school by bus.',
    kind: 'other',
    note: '兩個相同答案的選項',
    context: {
      view: 'quiz',
      path: '/?stage=E#quiz',
      candidates: ['w0720:by', 'w2426:go', 'w5670:to'],
      options: ['搭公車', '走路', '騎腳踏車', '搭火車'],
      viewport: '390x844',
      userAgent: 'TestPhone/1.0 Mobile Safari',
      speech: { accent: 'en-US', source: 'device-tts', voice: 'Samantha', tts: 'ok' }
    }
  })
});

const response = await onRequest({
  request,
  env: { DB: new FakeD1(), TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: 'test-chat' }
});
const result = await response.json();

const checks = [
  [result.ok === 1, '回報 API 成功'],
  [telegramText.includes('定位：quiz｜/?stage=E#quiz｜w0720:by, w2426:go, w5670:to'), 'Telegram 含頁面與候選單字'],
  [telegramText.includes('選項：搭公車｜走路｜騎腳踏車｜搭火車'), 'Telegram 含當下選項'],
  [telegramText.includes('發音：en-US｜device-tts｜Samantha｜TTS ok'), 'Telegram 含發音環境'],
  [telegramText.includes('裝置：390x844｜TestPhone/1.0 Mobile Safari'), 'Telegram 含裝置資訊']
];

let failures = 0;
for (const [ok, message] of checks) {
  if (ok) console.log('PASS:', message);
  else { console.error('FAIL:', message); failures++; }
}
if (failures) {
  console.error('\n實際 Telegram 內容：\n' + telegramText);
  process.exit(1);
}
