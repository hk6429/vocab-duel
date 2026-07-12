// 煙霧測試：起本機 server → 選學段 → 閃卡翻 5 張 → 自測 1 輪 → 看統計
// 需求：npm 全域或本機有 playwright-core，且本機已快取 chromium
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = createServer((req, res) => {
  const p = join(root, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
console.log('server on', port);

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const fails = [];
page.on('pageerror', e => fails.push('pageerror: ' + e.message));

try {
  await page.goto(`http://localhost:${port}/`);
  // 1. 學段選擇
  await page.click('button[data-s="E"]');
  await page.waitForSelector('.wc-mgrid');
  console.log('✅ 學段選擇 → 主選單');

  // 2. 閃卡翻 5 張
  await page.click('.wc-mcard-title:has-text("閃卡練功")');
  for (let i = 0; i < 5; i++) {
    await page.waitForSelector('.flash-card');
    await page.click('.flash-card');
    await page.waitForSelector('#flashBtns:not(.hidden)');
    await page.click(i % 2 ? '#btnNo' : '#btnYes');
  }
  console.log('✅ 閃卡翻 5 張');

  // 3. 自測 1 輪（10 題亂點）
  await page.click('.topbar .back');
  await page.waitForSelector('.wc-mgrid');
  await page.click('.wc-mcard-title:has-text("單字自測")');
  for (let i = 0; i < 10; i++) {
    await page.waitForSelector('.opt:not([disabled])');
    await page.click('.quiz-opts .opt');
    await page.waitForSelector('.opt[disabled]');
    // 答錯要手動按「下一題」；答對 1.2 秒自動前進
    const nextBtn = await page.$('.qz-next');
    if (nextBtn) await nextBtn.click();
    await page.waitForFunction(() => !document.querySelector('.opt[disabled]') || document.querySelector('.card-done'));
  }
  await page.waitForSelector('.card-done');
  console.log('✅ 自測 10 題完成');

  // 4. 統計
  await page.click('text=回主選單');
  await page.click('text=📊 我的戰績');
  await page.waitForSelector('.stat-grid');
  const today = await page.textContent('.stat-grid');
  if (!/今日複習/.test(today)) fails.push('統計缺今日複習');
  console.log('✅ 統計儀表板');

  // 5. 匯出/匯入
  await page.click('#btnExport');
  const code = await page.inputValue('#ioText');
  if (code.length < 20) fails.push('匯出碼太短');
  console.log('✅ 匯出碼長度', code.length);

  // 手機寬度版面檢查：body 不得橫向捲動
  const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 2);
  if (overflow) fails.push('390px 出現橫向捲動');
} catch (e) {
  fails.push('flow error: ' + e.message);
}

await browser.close();
server.close();
if (fails.length) { console.error('SMOKE FAIL:', fails); process.exit(1); }
console.log('SMOKE ALL PASS ✅');
