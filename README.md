# 字鬥英雄 vocab-duel

從國小 1200 字到高中 6000 字的英文單字遊戲化學習站。學生每天可用 5–8 分鐘完成「今日 10 題」，也能自由探索文學家對戰、詞靈、單字之城與會考題。

## 主要功能

- **今日 10 題**：5 題到期復習＋3 題弱字＋2 題新字，中斷後可續答，每週 5/7 天即達標。
- **閃卡與自測**：Leitner 間隔復習、英選中、中選英、例句挖空與拼字題。
- **遊戲化探索**：八位文豪對戰、20 隻詞靈、詞源星圖、單字之城、寶箱與英雄稱號。
- **單字之城排行榜**：以真正精熟的單字數排序，全站保留前 500 名；裝飾、資源與道具不影響名次。
- **教育名稱審核**：公開名稱統一拒絕負面／辱罵、簡體字、不雅諧音、敏感內容、網址與疑似詐騙導流，既有違規資料不再顯示。
- **PWA 安裝與離線首頁**：Android／桌面瀏覽器可直接安裝，iOS 可加入主畫面。
- **自願每日提醒**：安裝後由學生自行開啟，可選 17:00–22:00；每日最多一則，完成後不再送。
- **免帳號**：學習進度保存在瀏覽器，可使用同步碼跨裝置搬移。

## 字庫

教育部「參考字彙表」常用 2000 字詞（含國中小最基本 1200 字詞標記），雙來源交叉驗證解析，中譯、詞性、例句自產並經抽樣校對。資料在 `data/words.json`，原始清單與解析報告在 `data/raw/`。

## 開發

前端是無框架靜態站；Cloudflare Pages Functions＋D1 處理同步、班級與 Web Push。

```bash
# 本機預覽
python3 -m http.server 8080

# 資料驗證
npm test

# 煙霧測試（需 playwright-core）
node scripts/smoke.mjs
```

## Web Push 部署設定

Cloudflare Pages 需設定四個 Secret：

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `PUSH_DATA_KEY`（32 bytes 的 base64url，用於 AES-GCM 加密 PushSubscription）
- `PUSH_DISPATCH_SECRET`

GitHub Actions 也需設定同一個 `PUSH_DISPATCH_SECRET`，`.github/workflows/daily-push.yml` 每 15 分鐘觸發派送檢查。訂閱儲存 90 天，不保存姓名、Email、班級或作答內容。

## 正式網站

- Cloudflare Pages：<https://vocab-duel.pages.dev>
- Vercel：<https://vocab-duel.vercel.app>
- Netlify：<https://vocab-duel.netlify.app>
