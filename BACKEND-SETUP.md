# 字鬥英雄 雲端後端設定（雲端存檔＋班級排行榜）

後端只跑在 **Vercel**（唯一能執行 serverless function 的平台）。Cloudflare Pages / Netlify 的前端會自動打 Vercel 的 API 絕對網址，所以三平台都能用雲端功能。

## 你要做的（一次性，約 3 分鐘）

1. 到 <https://console.upstash.com> → **Create Database** → 選 Redis，名字取 `vocab-duel`（字鬥專用，跟仙俠/文豪的 DB 隔離）。
2. 進該 DB 的 **REST API** 區塊，複製兩個值：
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. 到 **Vercel** → `vocab-duel` 專案 → Settings → **Environment Variables**，加這兩個變數（Environment 選 Production），存檔。
4. 重新部署：`cd ~/projects/vocab-duel && vercel deploy --prod --yes --scope hk6429s-projects`

完成後雲端存檔與班級榜即生效。**在設定好之前，前端會顯示「雲端功能建置中」而不會壞掉。**

### 本機測試（可選）
建一個 `.env.local`（已被 .gitignore 忽略），填入上面兩個變數，然後 `vercel dev`。

## API 一覽
- `POST /api/sync` `{code, blob}` ／ `GET /api/sync?code=` — 個人進度雲端存檔（key `vd:sync:<碼>`）
- `POST /api/board` `{action:'sync', code, name, mastered, level, streak, badges}` ／ `GET /api/board?code=` — 班級排行榜（key `vd:board:<班級碼>`，上限 60 人）
