import fs from 'node:fs';

const source = fs.readFileSync(new URL('../js/town.js', import.meta.url), 'utf8');
const heroSource = fs.readFileSync(new URL('../js/hero.js', import.meta.url), 'utf8');
let failures = 0;
const check = (condition, message) => {
  if (condition) console.log('PASS:', message);
  else { console.error('FAIL:', message); failures++; }
};

check(source.includes("op: 'rank'") && source.includes('VDTown.mastered()'), '進城時同步實際精熟字數');
check(source.includes("op: 'ranklist'"), '單字之城可讀取全站排行榜');
check(source.includes('vd_town_board_id'), '排行榜使用匿名且穩定的本機識別碼');
check(source.includes('單字之城排行榜') && source.includes('前 500 名'), '城鎮畫面清楚標示排行榜與前 500 名規則');
check(source.includes('你目前排名第') && source.includes('精熟字數'), '排行榜顯示本人名次與精熟數據');
check(source.includes('VDGame.esc(row.nick)') && source.includes('VDGame.esc(row.townName)'), '排行榜名稱輸出經過 HTML 轉義');
check(heroSource.includes("tab('town', '🏰 單字城榜')"), '英雄檔案提供單字之城排行榜分頁');
check(heroSource.includes('VDTownUI.boardOnly(body)'), '英雄檔案分頁直接顯示城榜而非跳到城鎮頁底部');
check(source.includes('async function boardOnly(container)') && source.includes('return { render, boardOnly }'), '城鎮模組提供可共用的獨立排行榜畫面');

if (failures) process.exit(1);
console.log('\nALL PASS — 單字之城排行榜 UI 契約通過');
