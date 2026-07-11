# 字鬥英雄 P1 實作計畫

> 依據：`100_Todo/drafts/2026-07-11_英文單字測驗網站計畫書.md`（已定案版）
> 原則：純靜態站、無框架、簡潔優先；每個任務配一個可驗證的 verify check。

**Goal:** 上線 P1——1200＋2000 字表閃卡學習站（閃卡＋自測＋統計），三平台部署。

**Tech Stack:** vanilla HTML/CSS/JS ＋ 靜態 JSON；驗證用 Node 腳本；煙霧測試用 playwright-core（快取 chromium，同凡人煉心訣做法）。

## 全域約束

- 母版：`naicheng-claude-agent/字鬥英雄/`；部署副本 `~/projects/vocab-duel{,-cf,-netlify}`
- localStorage key 一律 `vd_` 前綴（family 慣例，避免與同域其他站相撞）
- 資料結構含 `level` 欄（E=1200、J=2000 增量），預留 P1.5 高中級別
- 介面繁體中文（台灣用語）；推 GitHub／部署前先口頭確認

## Task 1：字表來源取得

- Files: `data/raw/1200.txt`, `data/raw/2000.txt`（每行一字）
- 來源：教育部「國民中小學英語基本字彙」（2000 字表含 1200 標記）；優先抓官方 PDF/CSV，抓不到用 CAP／縣市教育局轉載版，需交叉比對兩個來源
- Verify：1200 表恰為 2000 表子集；字數 = 官方公告數；抽 20 字人工目視

## Task 2：單字 JSON 結構化（外包 subagent 批次）

- Files: `data/words.json`（單一主檔）、`scripts/validate.mjs`
- 每字：`{id, word, pos[], zh, level, example, example_zh}`；批次 200 字/agent，多 agent 並行只產 JSON 分片，主線程合併
- Verify：`node scripts/validate.mjs` 全過（schema、無重複字、level 分佈正確）；隨機抽 50 字逐字校對中譯與例句，零錯才過

## Task 3：站台骨架 + 學段入口

- Files: `index.html`, `css/style.css`, `js/app.js`, `js/store.js`
- 首頁選「國小(1200)／國中(2000)」→ 主選單（閃卡／自測／統計）；store.js 封裝 localStorage（`vd_progress`）＋匯出/匯入碼
- Verify：本機 server 開站，切換學段後字表範圍正確；匯出碼貼回匯入後進度一致

## Task 4：閃卡模組（Leitner 五盒）

- Files: `js/flashcard.js`
- 翻面、熟/不熟、盒 0–4、間隔複習排序（今日到期優先）；答對升盒、答錯歸 0
- Verify：模擬答 10 字（對7錯3），localStorage 盒位與預期一致；重整頁面進度仍在

## Task 5：自測模組（三題型）

- Files: `js/quiz.js`
- 英選中、中選英、例句挖空；四選一，誘答從同 level 抽且不重複；一輪 10 題，結果回寫熟悉度
- Verify：連跑 20 輪無壞題（選項恰 4、含正解、不重複）；答錯的字盒位歸 0

## Task 6：統計儀表板

- Files: `js/stats.js`
- 累積單字量（盒≥3 = 已掌握）、各學段進度條、今日複習數、連續天數
- Verify：以已知 localStorage 假資料渲染，數字與手算一致

## Task 7：煙霧測試 + 部署

- Files: `scripts/smoke.mjs`, `README.md`
- playwright-core 走完整流程：選學段→閃卡翻 5 張→自測 1 輪→看統計
- 口頭確認後：建 GitHub public repo `vocab-duel`、三平台部署（Vercel --scope hk6429s-projects＋CF Pages＋Netlify）
- Verify：三個網址皆可開站且流程可跑；手機視窗寬度（390px）版面不破
