# 字鬥英雄每日學習留存實作計畫

日期：2026-08-02
對應規格：`docs/superpowers/specs/2026-08-02-daily-habit-retention-design.md`

## 實作原則

- 依公開行為逐片 TDD：先看到測試失敗，再寫最小實作通過。
- 沿用 `VDStore`、`VDQuiz`、`VDGame`、詞靈與城鎮系統，不新增孤立貨幣。
- 前端三站共用 Cloudflare Pages Functions 推播 API；密鑰只進平台 Secret。
- 每一階段都先回歸既有功能，全部通過後才發布。

## 階段與驗收

1. 每日任務核心
   - 新增 `js/dailyquest.js` 與單元測試。
   - 5 題到期、3 題弱字、2 題新字，題池不足時無重複補滿 10 題。
   - 保存當日題序、完成數、對錯狀態；跨日重置。
   - 任務結算與每日三選一獎勵均為冪等。

2. 首頁與學習閉環
   - 首屏置頂「今日 10 題」，顯示剩餘題數、約 5–8 分鐘、今日獎勵。
   - 10 格進度、單一「下一題」、學到的字、今天收工／再練 5 題。
   - 七日章回、5／7 週目標、明日伏筆、中性回歸文案。

3. PWA 安裝與離線
   - 新增 Manifest、應用圖示、Service Worker 與離線首頁。
   - 首輪完成後才顯示安裝利益。
   - iOS 顯示加入主畫面步驟；支援的瀏覽器使用原生安裝提示。

4. Web Push 與提醒設定
   - 兩階段同意，僅在使用者點擊後請求系統權限。
   - 預設 19:30，可選 17:00–22:00，每 30 分鐘一格。
   - subscribe、update、unsubscribe、done、dispatch API 實作輸入驗證、來源白名單、冪等與過期清理。
   - 每日最多一則，完成後不提醒，22:00 後不補送。

5. 品管與發布
   - 執行全套新舊測試與靜態驗證。
   - 實際瀏覽器檢查首頁、中斷續答、安裝引導、通知降級與行動版。
   - 更新 README 的 PWA／Push 設定與安全邊界。
   - 從乾淨 checkout 提交並 push GitHub，再發布 Vercel、Cloudflare Pages、Netlify，三站逐一 cache-busting 回讀。
