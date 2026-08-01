/* 每日三選一獎勵：價值對齊、每日只能領一次 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(path.join(root, 'js/game.js'), 'utf8')
  .replace('const VDGame =', 'globalThis.VDGame =');
const memory = {};
globalThis.localStorage = {
  getItem: key => memory[key] ?? null,
  setItem: (key, value) => { memory[key] = String(value); },
  removeItem: key => { delete memory[key]; }
};
globalThis.window = globalThis;
globalThis.VDStore = {
  today: () => '2026-08-02',
  stats: () => ({ streak: 0 }),
  dailyCalendar: () => [],
  streakRepairInfo: () => null
};
globalThis.document = { getElementById: () => null };

new Function(source)();
VDGame.init();
let failures = 0;
const ok = (condition, message) => {
  if (condition) console.log('PASS:', message);
  else { console.error('FAIL:', message); failures++; }
};

const first = VDGame.claimHabitReward('xp');
const second = VDGame.claimHabitReward('coins');
ok(first.ok && first.xp === 40 && first.coins === 0, '可選擇 40 XP 獎勵');
ok(!second.ok && second.reason === 'claimed', '同一天不可重複領取');
ok(VDGame.raw.xp === 40 && VDGame.raw.coins === 0, '重複請求不增加資產');

if (failures) process.exit(1);
console.log('\nALL PASS — 每日獎勵冪等通過');
