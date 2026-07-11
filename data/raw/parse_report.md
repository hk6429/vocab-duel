# 教育部參考字彙表解析報告

產出日期：2026-07-11　來源：`wordlist_2000.pdf`（教育部參考字彙表，10 頁）

## 一、字數統計

| 清單 | 詞條數 | 官方名義 | 判定 |
|---|---|---|---|
| clean_2000.txt | 2033 | 2000 | 差 33（1.6%），在 1900–2100 內 |
| clean_1200.txt | 1248 | 1200 | 差 48（4.0%），在 1150–1250 內 |

與名義數的差異來源：
- PDF 原始逐條解析共 2106 條，其中 73 條為跨類重複（如 chicken 同列動物與食物類、short 出現 3 次），去重後 2033 條。官方 2000 為約數。
- 1200 底線子集多出 48 條，主因 PDF 把「所有格 my/our/your/his/her/its/their」「片語 in front of / next to」「節日 Chinese New Year 等」「複合詞 police station 等」都畫了底線並各自成條，而官方計數方式（編列原則第 1 條：括號內不計）與去重口徑不同。

## 二、底線（1200 基本字）判定方法

- pdfplumber 抽出每頁 `rects`，底線特徵：高度 < 2pt 的細長矩形。
- 逐 token 比對：矩形 top 與字的 bottom 垂直距離 < 4pt，且水平重疊 > 0.5 × min(底線寬, 字寬) 即判定有底線。
- 用 min() 是修正過的版本：`---a,` 這種帶 `---` 前綴的 token 字寬被撐大，用固定字寬比例會漏判（實際漏掉 a）。
- 詞條層級：多 token 詞條只要任一 token 有底線即整條算 1200。

## 三、詞條切分規則

- 逗號結尾＝詞條結束；括號深度 > 0 時逗號不切（保住 father (dad, daddy)、be (am, are, is, was, were, been)）。
- `---` 行首＝新子群組，強制切分（先前 'yet aloud abroad' 黏連的真因）。
- `N.` 編號行＝分類標題，跳過並強制切分；`others:` 這類標籤 token 跳過。
- 跨行、跨頁接續（swim / (swimming) 分在 3、4 兩頁，正確接回）。
- 含中文的行跳過；「字彙編列原則」之後停止解析。
- 抽查驗證：無括號且超過 3 個空白分隔單詞的詞條 = 0（junior high school、fast food restaurant 等合理片語均 ≤3 詞）。

## 四、與 doc 來源 1200 字交叉比對

doc 來源（wordlist_1200.txt，antiword 轉出，含 \x07 控制字元與索引編號，已清理）抽出 1200 條。
比對採別名正規化：小寫、去空白/連字號/撇號、括號變體展開（bicycle (bike) 同時登記 bicycle 與 bike）。

- doc 1200 條中，1161 條在我的 1200 清單中找到 → **重合率 96.8%**（≥95% 達標）
- 其中 7 條未匹配其實是 doc 轉檔破損或異體（見下表「轉檔破損」），扣除後有效重合率 **97.3%**。

### doc 有、我的 1200 沒有（39 條）

| 類型 | 詞條 | 原因 |
|---|---|---|
| 轉檔破損/異體 | a (an | PDF 該詞條就是單獨 "a"（doc 版寫成 a (an)），實質同一詞 |
| 轉檔破損/異體 | parent(s | PDF 作 parent；doc 版括號被轉檔切斷 |
| 轉檔破損/異體 | roller-skate/blade roller-blade | PDF 寫作 roller skate (roller-skating)，已在我的 1200 內 |
| 轉檔破損/異體 | sacred | doc 版打字錯誤，應為 scared；PDF 的 scared 已在我的 1200 內 |
| 轉檔破損/異體 | TV) set | 即 (TV) set；PDF 該詞在 2000 表寫作 set（未畫底線） |
| 轉檔破損/異體 | sport | PDF 寫作複數 sports，已在我的 1200 內 |
| 轉檔破損/異體 | beef) steak | 即 (beef) steak；PDF 寫作 steak（畫底線，已在我的 1200 內） |
| 序數詞（16 條） | fourth, fifth, sixth, seventh, eighth, ninth, tenth, eleventh, twelfth, thirteenth, fourteenth, fifteenth, sixteenth, seventeenth, nineteenth, twentieth | PDF 編列原則第 7 條：除 first/second/third 外序數不個別列出，故 PDF 本來就沒有 |
| PDF 僅有複合詞 | ball | PDF 只有 dodge ball/baseball 等複合詞 |
| PDF 僅有複合詞 | box | PDF 只有 pencil box (pencil case) |
| PDF 僅有複合詞 | cheer | PDF 只有 cheer leader |
| PDF 僅有複合詞 | Coke | PDF 用 cola |
| PDF 僅有複合詞 | eve | PDF 只有 New Year's Eve |
| PDF 僅有複合詞 | lantern | PDF 只有 Lantern Festival |
| PDF 僅有複合詞 | officer | PDF 只有 police officer |
| PDF 僅有複合詞 | police | PDF 只有 police officer / police station |
| PDF 僅有複合詞 | recorder | PDF 只有 tape recorder |
| PDF 僅有複合詞 | school | PDF 只有 elementary/junior high/senior high school |
| PDF 僅有複合詞 | sore | PDF 只有 sore throat |
| 在 2000 但未畫底線 | cowboy | PDF 有此詞但原稿沒畫底線（兩份官方來源的 1200 圈選本就略有出入） |
| 在 2000 但未畫底線 | even | PDF 有此詞但原稿沒畫底線（兩份官方來源的 1200 圈選本就略有出入） |
| 在 2000 但未畫底線 | railroad | PDF 有此詞但原稿沒畫底線（兩份官方來源的 1200 圈選本就略有出入） |
| 在 2000 但未畫底線 | shake | PDF 有此詞但原稿沒畫底線（兩份官方來源的 1200 圈選本就略有出入） |
| 在 2000 但未畫底線 | toe | PDF 有此詞但原稿沒畫底線（兩份官方來源的 1200 圈選本就略有出入） |

### 我的 1200 有、doc 沒有（82 條）

主要類型：所有格代名詞（my/our/your/his/her/its/their，doc 把它們收在 I (me, my…) 括號內不獨立計）、介系詞片語（in front of / in back of / next to / out of）、節日（Chinese New Year、Moon Festival、Teacher's Day…）、場所複合詞（police station、fire station、movie theater…）、及 doc 版未收的單字（act、bathe、beat、chase、deer、dinosaur、eagle、inch、middle、nature、newspaper、power、sharp、shine、traditional、unique、valuable、whole、wild…）。全數清單：

> prince, sore throat, Dr, ma'am, parent, fast food, steak, cola, milk shake, moon cake, straw, sports, roller skate (roller-skating), ski (skiing), computer game, tape recorder, pencil box (pencil case), cheer leader, class leader, behave, explain, middle, fast food restaurant, fire station, flower shop, movie theater, police station, bus stop, train station, railway, inch, Chinese New Year, New Year’s Eve, Lantern Festival, Moon Festival, Teacher’s Day, New Year’s Day, Mother’s Day, Father’s Day, actor, police officer, shine, nature, deer, dinosaur, donkey, eagle, puppy, a, my, our, your, his, her, its, their, in back of, in front of, out of, next to, action, base, newspaper, power, set, tool, act, bathe, beat, chase, rise, attack, deal, scared, sharp, traditional, unique, usual, valuable, social, whole, wild

## 五、驗收自檢結果

| 項目 | 結果 |
|---|---|
| clean_1200 ⊂ clean_2000（逐條） | 通過（0 違例） |
| clean_2000 條數 1900–2100 | 通過（2033） |
| clean_1200 條數 1150–1250 | 通過（1248） |
| 無黏連詞條（>3 詞抽查） | 通過（0 條，括號詞條除外且均為代名詞/助動詞衍生格） |
| 與 doc 1200 重合率 ≥95% | 通過（96.8%，扣轉檔破損後 97.3%） |

## 六、需人工裁決的詞條

1. **cowboy、even、railroad、shake、toe** — doc 說是基本 1200，但 PDF 沒畫底線。若以 doc 為準，可手動加進 1200。
2. **sports vs sport、scared（doc 誤植 sacred）** — 已按 PDF 原樣保留。
3. **73 條跨類重複** 已去重（保留首次出現）；若要保留分類資訊需另外輸出。
4. **set、steak** 在 PDF 2000 表出現兩次語境（(TV) set / (beef) steak 在 doc），PDF 只列裸字，照 PDF 保留。
