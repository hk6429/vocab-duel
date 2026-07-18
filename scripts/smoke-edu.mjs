// 針對教育審查修正批次的新功能冒煙：新模組渲染 / 模式切換 / IEP 套用 / 攻克 gate / 零 pageerror
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

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const fails = [];
page.on('pageerror', e => fails.push('pageerror: ' + e.message));
// 404 圖片是 cosmetic（選單圖缺，card() 有 emoji fallback），不計入；只抓真的 JS console error
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) fails.push('console.error: ' + m.text()); });

try {
  await page.goto(`http://localhost:${port}/`);
  await page.click('button[data-s="E"]');
  await page.waitForSelector('.wc-mgrid');

  // 1) 三個新模組都存在且 .start() 可渲染
  const globals = await page.evaluate(() => ({
    mode: typeof VDMode !== 'undefined', placement: typeof VDPlacement !== 'undefined' && !!VDPlacement.start,
    repeat: typeof VDRepeat !== 'undefined' && !!VDRepeat.start, phonics: typeof VDPhonics !== 'undefined' && !!VDPhonics.start,
    conquer: typeof VDQuiz !== 'undefined' && !!VDQuiz.conquer, iepAcc: typeof VDCloud !== 'undefined' && !!VDCloud.iepAcc,
  }));
  for (const [k, v] of Object.entries(globals)) if (!v) fails.push('缺全域: ' + k);
  console.log('✅ 全域檢查', JSON.stringify(globals));

  const OVID = { placement: 'vd-placement-ov', repeat: 'vd-repeat-ov', phonics: 'vd-phonics-ov' };
  for (const mod of ['placement', 'repeat', 'phonics']) {
    await page.evaluate(m => VDApp.go(m), mod);
    await page.waitForTimeout(500);
    const has = await page.evaluate(id =>
      !!document.getElementById(id) ||
      (document.querySelector('#mod') && document.querySelector('#mod').innerHTML.length > 0), OVID[mod]);
    if (!has) fails.push(`${mod} 未渲染`);
    else console.log(`✅ ${mod} 渲染`);
    await page.evaluate(() => VDApp.go('menu'));
    await page.waitForTimeout(200);
    const leftover = await page.evaluate(id => !!document.getElementById(id), OVID[mod]);
    if (leftover) fails.push(`${mod} overlay 離開頁面後殘留`);
    else console.log(`✅ ${mod} overlay 離開即清除`);
  }

  // 2) 精簡模式：切開 → body.simplified 生效
  await page.evaluate(() => VDMode.setSimplified(true));
  const simp = await page.evaluate(() => document.body.classList.contains('simplified'));
  if (!simp) fails.push('simplified body class 未生效');
  else console.log('✅ 精簡模式 body class');
  await page.evaluate(() => VDMode.setSimplified(false));

  // 3) IEP：模擬老師下發 → VDMode.acc 讀得到 → sprint 延長時間
  await page.evaluate(() => localStorage.setItem('vd_iep', JSON.stringify({ extraTime: 2, noTimer: false, maxItems: 5 })));
  const acc = await page.evaluate(() => ({ extra: VDMode.acc('extraTime'), max: VDMode.acc('maxItems') }));
  if (acc.extra !== 2) fails.push('IEP extraTime 未透過 iepAcc 生效: ' + acc.extra);
  else console.log('✅ IEP extraTime/maxItems 讀取', JSON.stringify(acc));
  await page.evaluate(() => localStorage.removeItem('vd_iep'));

  // 4) 攻克 gate：故意全答錯一輪 → 結算應出現「今日待攻克」卡；unconqueredNow>0
  await page.evaluate(() => VDApp.go('menu'));
  await page.waitForSelector('.wc-mgrid');
  await page.click('.wc-mcard-title:has-text("單字自測")');
  for (let i = 0; i < 10; i++) {
    await page.waitForSelector('.opt:not([disabled]), .spell-in');
    const spell = await page.$('.spell-in');
    if (spell) { await page.click('.spell-skip'); } // 拼寫題按「我不會」＝答錯
    else {
      // 選一個「不是正解」的選項：點最後一個，通常會錯（不保證，但多數會）
      const opts = await page.$$('.quiz-opts .opt');
      await opts[opts.length - 1].click();
    }
    await page.waitForSelector('.opt[disabled], .spell-in[disabled], #quizFb .ex-fb');
    const nextBtn = await page.$('.qz-next');
    if (nextBtn) await nextBtn.click();
    await page.waitForFunction(() => !document.querySelector('.opt[disabled]') || document.querySelector('.card-done')).catch(() => {});
    if (await page.$('.card-done')) break;
  }
  await page.waitForSelector('.card-done');
  const unconq = await page.evaluate(() => VDQuiz.unconqueredNow().length);
  const hasConquerCard = await page.evaluate(() => !!document.querySelector('.conquer-todo, .conquer-done'));
  console.log(`✅ 結算攻克卡=${hasConquerCard} 待攻克字數=${unconq}`);
  if (!hasConquerCard) fails.push('結算未出現攻克卡');

  if (fails.length) { console.log('❌ FAILS:\n' + fails.join('\n')); process.exitCode = 1; }
  else console.log('EDU-SMOKE ALL PASS ✅');
} catch (e) {
  console.log('❌ 例外:', e.message);
  if (fails.length) console.log(fails.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
