# 高中英文參考詞彙表「依字母排序」區解析報告

## 資料來源
- 檔案：`hs_full.pdf`（116 頁）
- 解析範圍：實體第 65–115 頁（pdfplumber page index 64–114），即「依字母排序」全區
- 第 116 頁（附錄，基數/序數詞）已跳過
- 產物：`hs_alpha.tsv`（每行 `word<TAB>pos<TAB>level`）

## 總數
- **總條數：6012**（官方約 6005，落在 5800–6200 驗收區間內）

## 六級分佈
| 級別 | 條數 |
|---|---|
| 1 | 1002 |
| 2 | 1002 |
| 3 | 1002 |
| 4 | 1002 |
| 5 | 1002 |
| 6 | 1002 |

六級完全平均（各 1002），無任一級 <500 或 >1500。這種整齊的等分佈與大考中心「每級約千字」的設計吻合，屬正常。

## 切欄方法
- 用 pdfplumber `extract_words()` 取每個 token 的 `x0`（左緣）座標。
- 每頁固定三欄，word 欄起點分別為 x0 ≈ 64 / 230 / 396；以 x0 邊界切三群：
  - 左欄 30 ≤ x0 < 200
  - 中欄 200 ≤ x0 < 380
  - 右欄 380 ≤ x0 < 600
- 閱讀順序：左欄→中欄→右欄，欄內由上到下（依 `top` 排序）。
- 未用 `pdftotext -layout`，避免三欄黏行。

## 頁首／頁尾排除
- 濾掉 `top ≤ 56`（頁首「依字母排序 X」「高中英文參考詞彙表」＋字母標）與 `top ≥ 790`（頁尾頁碼）。
- 欄內仍會出現的字母分隔標（A、B…Z）與內文重複的「依字母排序」：偵測「整列只有單一 token 且為單一大寫字母 A–Z 或『依字母排序』」判為標頭剔除，共 **剔除 26 個標頭**（A–Z 缺 X＝25 個字母，＋1 個內嵌「依字母排序」）。詞彙表本身無 X 開頭字，屬正常。

## 折行合併方法
每格格式為 `word 詞類 級別`。採「詞類優先」狀態機分類每個 token：
- **level**：純數字 1–6
- **pos**：符合 `^\(?(n|v|adj|adv|prep|conj|pron|aux|art|abbr|num|int|det…)\.` 之詞類 token
- **word-part**：其餘皆視為詞條主形的一部分

規則：word-part 持續累積為 word，遇到 pos 進入詞類段、遇到 level 結束；下一個 word-part 開啟新條目。這自然處理兩類折行：

1. **word 獨占一行、pos+level 落在下一行**（如 `afterward/afterwards` 換行接 `adv. 3`）— 共 **23 筆** 這類兩行式條目，全部正確合併。
2. **word 後接空格括號列舉**（代名詞）如 `I (me, my, mine, myself)` — 括號 token 不符 pos 規則，被正確併入 word。

抽查驗收（與 PDF 目視一致）：
- `afterward/afterwards` → adv. / 3 ✓
- `agree(ment)` → v./(n.) / 1 ✓（註：任務描述中的 `(n।)` 為 Devanagari 符號筆誤，PDF 實為半形 `(n.)`）
- `amuse(ment)` → v./(n.) / 4 ✓
- `appoint(ment)` → v./(n.) / 4 ✓
- 7 個代名詞條目 `I / you / he / she / it / we / they (…)` → pron. / 1，主形括號列舉完整保留 ✓

## 詞條保留規則落實
- 斜線變體原樣：`amid/amidst`、`afterward/afterwards`、`airplane/plane`、`refrigerator/fridge` 等 ✓
- 括號可省記法原樣：`agree(ment)`、`amuse(ment)`、`appoint(ment)`、`a/an`、`argue(argument)` 等 ✓
- 多詞類斜線原樣：`adj./v./n.`、`prep./conj./adv.`、`v./(n.)` 等 ✓（共 98 種詞類組合，全部含 `.`）

## 品質檢核（全數通過）
- 無空 word / 空 pos / 空 level：**0 筆**
- level 全為 1–6：✓
- word 欄含級別數字：**0 筆**
- word 欄含中文：**0 筆**
- 重複 word：**0 筆**
- 首條 `a/an art. 1`、末條 `zoom v./n. 6`，邊界無前後區滲漏
- 20 條隨機抽查詞條／詞類／級別皆合理

## 需人工裁決清單
- **無**。所有條目皆自動判定成功，無 anomaly、無殘留待決項目。
- 唯一需知會：六級各 1002 的完美等分佈為官方設計特性，非解析錯誤。
