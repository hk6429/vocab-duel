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
  // 0. 公告：可切換舊版、同一版本確認後不重複自動顯示，左下角仍可重開
  await page.waitForSelector('#vd-save-announcement');
  const latestAnnouncement = await page.textContent('#vd-save-announcement');
  if (!/左下角.*公告/.test(latestAnnouncement)) fails.push('最新版公告缺左下角重開說明');
  await page.selectOption('#vd-save-announcement-history', '2026.08.05');
  const announcement = await page.textContent('#vd-save-announcement');
  if (!/右下角學習工具/.test(announcement)) fails.push('存檔公告缺右下角學習工具入口');
  if (!/更多工具.*雲端／班級榜/s.test(announcement)) fails.push('存檔公告缺系統內雲端存檔入口');
  await page.click('#vd-save-announcement [data-close]');
  const seenVersion = await page.evaluate(() => localStorage.getItem('vd_save_announcement_seen'));
  if (seenVersion !== '2026.08.05-2') fails.push('公告確認狀態未寫入最新版');
  await page.reload();
  if (await page.$('#vd-save-announcement')) fails.push('同一版存檔公告重複顯示');
  await page.waitForSelector('#vd-announcement-trigger');
  await page.click('#vd-announcement-trigger');
  await page.waitForSelector('#vd-save-announcement');
  await page.selectOption('#vd-save-announcement-history', '2026.08.05');
  if (!/離開前.*存檔/.test(await page.textContent('#vd-save-announcement-title'))) fails.push('左下角公告入口無法打開舊版存檔提醒');
  await page.click('#vd-save-announcement [data-close]');
  if (await page.evaluate(() => document.activeElement?.id !== 'vd-announcement-trigger')) fails.push('關閉公告後鍵盤焦點未回到左下角公告入口');
  console.log('✅ 公告自動顯示一次，左下角可重開並切換舊版本');

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
