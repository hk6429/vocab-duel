/* PWA 契約：Manifest 可安裝、Service Worker 離線與推播深連結 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = file => readFileSync(path.join(root, file), 'utf8');
let failures = 0;
const ok = (condition, message) => {
  if (condition) console.log('PASS:', message);
  else { console.error('FAIL:', message); failures++; }
};

const manifest = JSON.parse(read('manifest.webmanifest'));
ok(manifest.name === '字鬥英雄' && manifest.short_name === '字鬥英雄', 'Manifest 名稱完整');
ok(manifest.display === 'standalone' && manifest.start_url.includes('daily=1'), '安裝後以 standalone 直達今日任務');
ok(manifest.icons.some(icon => icon.sizes === '512x512'), '包含 512x512 應用圖示');

const handlers = {};
let shown = null;
let opened = null;
globalThis.self = {
  addEventListener: (name, handler) => { handlers[name] = handler; },
  skipWaiting: async () => {},
  clients: {
    claim: async () => {},
    matchAll: async () => [],
    openWindow: async url => { opened = url; }
  },
  registration: { showNotification: async (title, options) => { shown = { title, options }; } },
  location: { origin: 'https://vocab-duel.pages.dev' }
};
globalThis.caches = {
  open: async () => ({ addAll: async () => {}, put: async () => {} }),
  keys: async () => [],
  delete: async () => true,
  match: async () => null
};
globalThis.fetch = async () => ({ ok: true, clone() { return this; } });

new Function(read('sw.js'))();
ok(['install', 'activate', 'fetch', 'push', 'notificationclick'].every(name => handlers[name]), 'Service Worker 五個核心事件齊全');
ok(read('sw.js').includes("'/js/speak.js'") && read('sw.js').includes("'/js/report.js'"), '離線殼層包含發音與回報程式');

let pushWork;
handlers.push({
  data: { json: () => ({ title: '今日任務', body: '十題就收工', url: '/?daily=1' }) },
  waitUntil: promise => { pushWork = promise; }
});
await pushWork;
ok(shown && shown.title === '今日任務' && shown.options.data.url === '/?daily=1', '推播載荷可顯示並保留今日深連結');

let clickWork;
handlers.notificationclick({
  notification: { data: { url: '/?daily=1' }, close: () => {} },
  waitUntil: promise => { clickWork = promise; }
});
await clickWork;
ok(opened === 'https://vocab-duel.pages.dev/?daily=1', '點擊通知直達今日 10 題');

if (failures) process.exit(1);
console.log('\nALL PASS — PWA 契約通過');
