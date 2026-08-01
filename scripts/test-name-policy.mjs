import { reviewEducationName } from '../functions/api/name-policy.js';

let failures = 0;
const check = (condition, message) => {
  if (condition) console.log('PASS:', message);
  else { console.error('FAIL:', message); failures++; }
};

for (const name of ['沐筆的咪兔', '默默', 'Eddie', 'JC', '謙遜學者', '安哥25']) {
  check(reviewEducationName(name).ok, `教育場域名稱可使用：${name}`);
}

const blocked = [
  ['一群有病是在鎮壓幾點 遜', 'negative'],
  ['笨蛋王', 'negative'],
  ['北七高手', 'homophone'],
  ['87高手', 'homophone'],
  ['趕羚羊', 'homophone'],
  ['赚錢客服', 'simplified'],
  ['学习达人', 'simplified'],
  ['投資老師加賴', 'scam'],
  ['LINE客服888', 'scam'],
  ['https://voca', 'scam'],
  ['免費領點數', 'scam'],
  ['賭博王', 'sensitive'],
  ['殺人魔', 'sensitive'],
  ['只剩表情🔥', 'format'],
];

for (const [name, reason] of blocked) {
  const result = reviewEducationName(name);
  check(!result.ok && result.reason === reason, `拒絕 ${reason} 名稱：${name}`);
}

check(!reviewEducationName('A'.repeat(13)).ok, '拒絕超過 12 字的公開名稱');
check(!reviewEducationName('123456').ok, '拒絕只有數字的公開名稱');

if (failures) process.exit(1);
console.log('\nALL PASS — 教育場域名稱政策通過');
