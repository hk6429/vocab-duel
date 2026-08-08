/* Web Push 純邏輯：輸入驗證、時區、每日最多一則、完成後跳過 */
import { validReminder, validSubscription, shouldDispatch } from '../functions/api/push-core.js';

let failures = 0;
const ok = (condition, message) => {
  if (condition) console.log('PASS:', message);
  else { console.error('FAIL:', message); failures++; }
};

ok(validReminder('17:00') && validReminder('19:30') && validReminder('22:00'), '提醒可選 17:00–22:00 的半小時格');
ok(!validReminder('16:30') && !validReminder('19:15') && !validReminder('22:30'), '非允許時段或非半小時格被拒絕');
ok(validSubscription({ endpoint: 'https://push.example/sub/abc', keys: { p256dh: 'a'.repeat(30), auth: 'b'.repeat(12) } }), '合法 PushSubscription 通過');
ok(!validSubscription({ endpoint: 'http://bad.test', keys: {} }), '不安全或缺 key 的訂閱被拒絕');

const base = { time: '19:30', timezone: 'Asia/Taipei', enabled: true, doneDate: '', lastSentDate: '' };
const at1930 = Date.parse('2026-08-02T11:30:00Z');
ok(shouldDispatch(base, at1930).send, '當地時間 19:30 準時派送');
ok(!shouldDispatch({ ...base, doneDate: '2026-08-02' }, at1930).send, '當日已完成不派送');
ok(!shouldDispatch({ ...base, lastSentDate: '2026-08-02' }, at1930).send, '當日已送過不重複');
ok(!shouldDispatch({ ...base, enabled: false }, at1930).send, '暫停訂閱不派送');
ok(!shouldDispatch(base, Date.parse('2026-08-02T14:15:00Z')).send, '22:00 後不補送');

if (failures) process.exit(1);
console.log('\nALL PASS — Push 排程核心通過');
