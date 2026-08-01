/* 推播前端純契約：三站 API 指向、時段選項、匿名裝置 ID */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(path.join(root, 'js/push.js'), 'utf8')
  .replace('const VDPush =', 'globalThis.VDPush =');
const memory = {};
globalThis.localStorage = {
  getItem: key => memory[key] ?? null,
  setItem: (key, value) => { memory[key] = String(value); },
  removeItem: key => { delete memory[key]; }
};
globalThis.window = globalThis;
globalThis.location = { hostname: 'vocab-duel.netlify.app', search: '' };
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'test' }, configurable: true });
globalThis.addEventListener = () => {};

new Function(source)();
let failures = 0;
const ok = (condition, message) => {
  if (condition) console.log('PASS:', message);
  else { console.error('FAIL:', message); failures++; }
};

ok(VDPush.apiOrigin() === 'https://vocab-duel.pages.dev/api/push', '非 Pages 網域共用 Cloudflare Push API');
const options = VDPush.reminderOptions();
ok(options.length === 11 && options[0] === '17:00' && options.at(-1) === '22:00', '時段為 17:00–22:00 共 11 個半小時選項');
ok(VDPush.deviceId() === VDPush.deviceId() && VDPush.deviceId().length >= 16, '匿名裝置 ID 穩定且無個資');

if (failures) process.exit(1);
console.log('\nALL PASS — Push 前端契約通過');
