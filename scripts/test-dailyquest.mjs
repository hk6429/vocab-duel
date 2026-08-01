/* 今日 10 題純邏輯自測：題組、續答、跨日、冪等結算、5/7 週目標 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = p => readFileSync(path.join(root, p), 'utf8');
const memory = {};
globalThis.localStorage = {
  getItem: key => memory[key] ?? null,
  setItem: (key, value) => { memory[key] = String(value); },
  removeItem: key => { delete memory[key]; }
};
globalThis.window = globalThis;

let day = '2026-08-02';
const due = new Set(['w01', 'w02', 'w03', 'w04', 'w05', 'w06']);
const weak = new Set(['w06', 'w07', 'w08', 'w09']);
const seen = new Set([...due, ...weak, 'w10']);
globalThis.VDStore = {
  today: () => day,
  isDue: word => due.has(word),
  isWrong: word => weak.has(word),
  isSeen: word => seen.has(word),
  box: () => -1,
  correctTypes: () => new Set()
};

new Function(read('js/quiz.js').replace('const VDQuiz =', 'globalThis.VDQuiz ='))();
new Function(read('js/dailyquest.js'))();
const H = globalThis.VDDailyQuest;
let failures = 0;
function ok(condition, message) {
  if (condition) console.log('PASS:', message);
  else { console.error('FAIL:', message); failures++; }
}

const words = Array.from({ length: 18 }, (_, index) => ({
  word: `w${String(index + 1).padStart(2, '0')}`,
  level: index < 12 ? 'J1' : 'J2',
  zh: `字${index + 1}`,
  pos: ['n.'], example: `Example w${index + 1}.`, example_zh: `例句${index + 1}`
}));
const fixed = () => 0.999999;

const exactQuestion = globalThis.VDQuiz.questionFor(words[4], words);
ok(exactQuestion.word === 'w05' && exactQuestion.ans, '每日任務可對指定字出題');

const plan = H.buildPlan(words, { random: fixed });
ok(plan.length === 10, '每日固定 10 題');
ok(new Set(plan.map(item => item.word)).size === 10, '題目不重複');
ok(plan.filter(item => item.source === 'due').length === 5, '到期復習 5 題');
ok(plan.filter(item => item.source === 'weak').length === 3, '弱字 3 題');
ok(plan.filter(item => item.source === 'fresh').length === 2, '新字 2 題');

due.clear(); weak.clear(); seen.clear();
due.add('w01'); weak.add('w02');
const fallback = H.buildPlan(words, { random: fixed });
ok(fallback.length === 10 && new Set(fallback.map(item => item.word)).size === 10, '分類不足時仍無重複補滿 10 題');

const first = H.load(words, { random: fixed });
ok(first.date === day && first.answers.length === 10, '建立當日可續答狀態');
H.record(0, true);
H.record(1, false);
const resumed = H.load(words, { random: () => 0.1 });
ok(resumed.plan.map(item => item.word).join(',') === first.plan.map(item => item.word).join(','), '重整後保留當日題序');
ok(resumed.answers[0] === true && resumed.answers[1] === false && resumed.done === 2, '重整後保留對錯與完成數');

for (let index = 2; index < 10; index++) H.record(index, true);
const completion1 = H.complete();
const completion2 = H.complete();
ok(completion1.newlyCompleted === true && completion2.newlyCompleted === false, '今日結算只記一次');

day = '2026-08-03';
const nextDay = H.load(words, { random: fixed });
ok(nextDay.date === day && nextDay.done === 0, '跨日自動重置');

localStorage.setItem('vd_dailyquest_history_v1', JSON.stringify({
  '2026-07-27': { completed: true },
  '2026-07-28': { completed: true },
  '2026-07-29': { completed: true },
  '2026-07-31': { completed: true },
  '2026-08-02': { completed: true }
}));
let week = H.weekInfo('2026-08-02');
ok(week.days === 5 && week.goalMet && !week.bonus, '每週 5/7 天即達標');
const history = JSON.parse(localStorage.getItem('vd_dailyquest_history_v1'));
history['2026-07-30'] = { completed: true };
history['2026-08-01'] = { completed: true };
localStorage.setItem('vd_dailyquest_history_v1', JSON.stringify(history));
week = H.weekInfo('2026-08-02');
ok(week.days === 7 && week.goalMet && week.bonus, '七天完成只增加加值章標記');

if (failures) process.exit(1);
console.log('\nALL PASS — 今日 10 題純邏輯通過');
