# 詞靈系統實作計畫

> **For agentic workers:** 依 task 順序執行，每個 task 結尾都有可獨立驗證的交付物。Spec：`docs/superpowers/specs/2026-07-11-word-spirits-design.md`

**Goal:** 在字鬥英雄加入「字綴親和詞靈」——詞源星圖＋20 寵養成＋影子對戰，形成學習↔養成閉環。

**Architecture:** 純前端模組（petstore 純邏輯 / petgraph Canvas / pet 養成 UI / petbattle 對戰）＋一支 Vercel serverless（快照/排行），資料層 `data/pets.json`，狀態 localStorage `vd_pets`，雲端沿用共用 Upstash（`vd:pet` 前綴隔離）。

**Tech Stack:** Vanilla JS（IIFE 模組，同現有風格）、Canvas 2D、Upstash Redis REST、codex-image2 生圖。

## Global Constraints
- 全站水彩墨風：新頁一律 `.wc-card` 上圖下文；色票用既有 CSS tokens（--bg/--ink/--accent）
- localStorage 鍵一律 `vd_` 前綴；雲端鍵一律 `vd:pet` 前綴（共用 DB 隔離）
- 不改動 `VDGame.onAnswer` 簽名；寵物層以事件掛在外圍
- 圖片載入失敗一律 onerror 退 emoji；三平台部署（Vercel/CF/Netlify），API base 非 vercel domain 指回 vercel.app（同 cloud.js）
- 每個 task 完成即 `node --check` 全部改動檔＋git commit

---

### Task 1：資料層 `data/pets.json` ＋驗證腳本

**Files:** Create `data/pets.json`、`scripts/validate-pets.mjs`

20 詞靈定射（id/名/系/主題/affix 清單/技能組/圖檔前綴）。172 綴分組如下（member 數見 affixes.json）：

| # | 詞靈 | 系 | 字綴 |
|---|---|---|---|
| 1 | 墨影狐 inkfox | 字首 | un- dis- mis- in-(否定) in-(內) im- |
| 2 | 迴時龜 timeturtle | 字首 | re- pre- pro- de- |
| 3 | 凌霄鷹 skyhawk | 字首 | ex- out- over- super- sur- up- inter- trans- tele- sub- under- |
| 4 | 同心犬 bonddog | 字首 | co- con- com- en- be- a- auto- uni- |
| 5 | 沛靈鹿 vigordeer | 字尾 | -ful -ous -ious -ive -ative |
| 6 | 型墨貓 formcat | 字尾 | -al -ial -ual -ical -ic |
| 7 | 百變狸 shifttanuki | 字尾 | -less -able -ible -ish -some -y -ary -ward |
| 8 | 成事熊 deedbear | 字尾 | -ment -tion -ation -ition -sion |
| 9 | 靜湖鵝 lakegoose | 字尾 | -ity -ance -ence -ure -cy -ency |
| 10 | 疆域獅 realmlion | 字尾 | -ship -hood -dom -age -ism -ery -ory -ology -graphy -meter |
| 11 | 眾相猿 folkape | 字尾 | -ee -ant -ent -er -or -ist -ian |
| 12 | 化形蜥 morphlizard | 字尾 | -ize -ify -ate -en -ly -th -teen -ty |
| 13 | 千目蝶 eyebutterfly | 字根 | spect/spic vis/vid aud phon photo scop sign sens/sent tang/tact mem cred |
| 14 | 書靈兔 scriberabbit | 字根 | dict scrib/script graph/gram log/logue liter voc/vok test spond/spons nov |
| 15 | 馱風駝 windcamel | 字根 | port duc/duct mit/miss fer tract ject pel/puls |
| 16 | 疾風馬 galehorse | 字根 | ven/vent cede/ceed/cess grad/gress migr mob/mot/mov cur/cours flu cycl cir/circ mid/medi loc ped |
| 17 | 巧匠鼠 craftmouse | 字根 | struct form fac/fact/fect techn man/manu corp/corpor plic/ple junct/join sect/sec part fin rect/reg |
| 18 | 岩甲犀 rockrhino | 字根 | pos/pon sta/sti pend/pens tend/tens vert/vers flect/flex rupt clud/clos solv/solu vac/void press cid/cide |
| 19 | 生木靈 lifesprite | 字根 | bio gen nat viv/vit spir path cor/card sol astro/aster micro var |
| 20 | 望城龍 citydragon | 字根 | dem pop/publ urb cent uni equ liber val/vail grat/grac serv gard/guard firm cap/cept/ceive prehend/prehens tele |

技能池（skills 欄引用 id）：`combo`連擊增傷15%/疊、`guard`受擊減傷20%、`lastres`血<30%增傷50%、`first`開場先手一擊、`leech`造傷10%吸血、`resonate`詞源之力>60%再+25%傷。每寵 3 槽=池中固定 3 技（Lv5/12/20 解鎖），data 內指定。

野生梯度 `wild`: 10 層 `{name, lv, acc, dropTier}`，lv 2→28、acc 0.5→0.9、dropTier common→legendary。

**驗證：** `node scripts/validate-pets.mjs` 斷言：(a) 172 綴不重不漏（跟 data/affixes.json 逐一比對，含兩個 in- 與 tele/uni 字首字根同形要分開計）(b) 每寵 skills 存在於池 (c) 20 寵 id 唯一。輸出 `ALL CLEAN`。

---

### Task 2：純邏輯層 `js/petstore.js` ＋自測腳本

**Files:** Create `js/petstore.js`、`scripts/test-petstore.mjs`；Modify `index.html`（script tag）

**Interfaces（Produces）：**
```js
VDPets = {
  init(),                       // 載 vd_pets ＋ data/pets.json
  list(),                       // [{...def, owned, lv, stage, power, atk, hp, equip, skills, deco}]
  adopt(id),                    // 首隻免費；之後 cost = 100 + 50×(已擁有數-1)
  levelUp(id),                  // cost = 20 + 10×lv 字幣；Lv10/25 回傳 {evolved:stage}
  power(id),                    // 詞源之力 P = 家族已學字數/家族總字數（VDStore.box(w)>=0 算已學）
  atk(id), hp(id),              // atk=(10+2lv)×(1+P)+equipAtk；hp=100+6lv+equipHp
  equip(id, item), unequip(id, slot),   // item={slot,name,ico,tier,atk,hp}
  rollDrop(dropTier),           // 掉落生成：common atk/hp 2-4、rare 5-8、legendary 10-15
  skillsOf(id),                 // 已解鎖技能（lv>=5/12/20）
  setDeco(id, deco), setActive(id), active(),
  affixStats(),                 // 172 綴各自 {form, kind, learned, total, pct} — 給星圖與統計
  topAffixes(n), weakAffixes(n),
  petRating, petWin(), petLose(),        // 積分勝+20敗-10地板0
  snapshot(),                   // {nick, petId, lv, atk, hp, skills, rating} 供上傳
}
```
狀態存 `vd_pets`：`{owned:{id:{lv,equip:{},deco,exp}}, active, rating, wildFloor}`。

**驗證：** `node scripts/test-petstore.mjs`（stub localStorage/VDStore/fetch）斷言：領養扣幣、升級曲線、P=0 與 P=1 的 atk 差 2 倍、Lv10 回傳 evolved、掉落數值落在檔位區間。輸出 `ALL PASS`。

---

### Task 3：詞源星圖 `js/petgraph.js`（graph 頁）

**Files:** Create `js/petgraph.js`；Modify `js/app.js`（view graph）、`index.html`、`css/style.css`

- Canvas 力導向：主圖節點=20 寵（外環錨定）＋172 綴（力導向），邊=所屬關係；節點半徑/透明度 ∝ `affixStats().pct`；寵物節點顯示小頭像圖
- 互動：拖曳平移、滾輪縮放、點寵物→高亮其家族、點字綴→下方展開該家族單字子圖（`.dex-cell` 同款格牆：灰/藍/金），再點字→VDGame.toast 字義
- 側欄（wc-card）：總已學字數、最熟 Top5（pct% 條）、最弱 Top5 附「去練」鈕（`VDStore.sub` 不動，直接把該家族未學字 enroll 前 10 個→跳閃卡）
- 力模擬 requestAnimationFrame，200 幀後凍結省電；離開頁面 cancelAnimationFrame

**驗證：** Chrome 實測：星圖 render、點 un- 展開 9 字、學過的字亮、Top5 統計與 dex 數字一致。

---

### Task 4：養成 UI `js/pet.js`（pets 頁）

**Files:** Create `js/pet.js`；Modify `js/app.js`、`index.html`、`css/style.css`

- 清單：20 張 `.wc-mcard`（未領養=灰剪影+領養價；已領養=當前階段圖+Lv+戰力）
- 詳情（wc-card 上圖下文）：階段圖（stage1/2/3 依 lv）、屬性條（atk/hp/P%）、升級鈕（顯示費用；Lv10/25 觸發進化動畫=vg-levelup 同款全螢幕+換圖）、技能 3 槽（未解鎖顯示 Lv 條件）、裝備 4 槽（點槽卸下）、裝飾選單（🎀👑🧣👓 CSS 疊角）、特寫鈕（全螢幕 modal：大圖+CSS 呼吸動效+潑墨底）、「出戰」設 active
- 詞源之力區：顯示家族字綴 chips＋「學這家族的字」鈕（同 Task 3 去練邏輯）

**驗證：** Chrome：領養墨影狐→升級→裝飾→特寫→設出戰，重整後狀態保留。

---

### Task 5：對戰 `js/petbattle.js`（pets 頁內「對戰」入口）

**Files:** Create `js/petbattle.js`；Modify `index.html`、`css/style.css`

- 選模式：🌿 野生試煉（10 層，過層解鎖下層）／👤 影子對戰（Task 6 接雲端，先留 stub 顯示「連線中」）
- 回合制沿用 bt-arena 版型：我方=active 寵（圖+HP 條）、敵方=野生詞靈（用對應寵物圖+色相濾鏡）；答對→寵物出招 `dmg = atk×(1+combo技能加成)`，技能依 skillsOf 觸發（first 開場、guard 減傷、lastres/resonate 條件增傷、leech 回血）；答錯→敵方以 acc 機率反擊
- 勝利：`VDPets.rollDrop(層.dropTier)` 掉裝（chestAnim 同款開箱卡展示，點擊裝上或入包）＋字幣＋`petWin()`；失敗 `petLose()`；結算含 milestoneHtml
- 出題用 `VDQuiz.randomQuestion(VDApp.scopeWords())`；`VDGame.onAnswer(correct,'battle',combo)` 照掛（寵物對戰同樣餵每日任務/週任務）

**驗證：** Chrome：打穿第 1 層掉 common 裝、裝上後 atk 上升、第 10 層掉 legendary。

---

### Task 6：雲端 `api/pets.js` ＋影子對戰接線＋排行榜

**Files:** Create `api/pets.js`；Modify `js/petbattle.js`、`js/cloud.js`（不動既有功能，只加 API base 常數複用）

**API 契約（Vercel serverless，Upstash REST）：**
```
POST /api/pets {op:'submit', snap:{nick,petId,lv,atk,hp,skills,rating}}  → 寫 vd:petpool（LPUSH+LTRIM 200）＋ vd:petboard:global（ZADD by atk+rating，ZREMRANGEBYRANK 保 50）
POST /api/pets {op:'opponent', rating}   → 從 vd:petpool 隨機取 8 挑 rating 最接近者回傳
POST /api/pets {op:'board'}              → Top50 [{nick,petId,lv,atk,rating}]
```
- 影子對戰：開打前 submit 自己→取 opponent→敵方=對方快照（AI acc = 0.5 + 0.35×min(1, 對方atk/我方atk)），勝敗改 petRating 並重 submit
- 排行榜頁籤（pets 頁）：Top50 表（名/寵圖標/Lv/戰力/積分），自己上榜行高亮
- 無金鑰/失敗時 graceful：影子對戰退「敵方=隨機野生強化版」，榜顯示「連線不到雲端」

**驗證：** curl 三個 op round-trip；Chrome 打一場影子戰、榜上看到自己。

---

### Task 7：美術批次（60 進化圖＋3 頁首圖＋選單卡）

**Files:** Create `img/pets/{id}_s{1,2,3}.png`×60、`img/ui/h_graph.png`、`img/ui/h_pets.png`、`img/ui/h_arena.png`、`img/ui/m_graph.png`、`img/ui/m_pets.png`

- prompt 產生器腳本：每寵 3 段（幼年=圓潤幼體、成熟=挺立成體、完全體=威嚴+發光紋章），統一 STYLE 段（黑墨線+透明水彩+淡藍奶油+留白+NO text）＋每寵主題物件（墨影狐=月下墨霧、迴時龜=背馱沙漏…20 組寫進腳本）
- `wc_lane_runner.sh` 4 線並行（每線 ~16 張）；逐張 300s timeout、>1MB 落盤驗證、SKIP 可重跑；完成 sips -Z 640 入 `img/pets/`、備份 ~/Downloads
- 頁首圖 3 張（星圖=星空詞網、詞靈=群獸集結、競技=雙獸對峙）+ 選單卡 2 張（可裁自頁首圖）

**驗證：** `ls img/pets | wc -l` = 60；抽 6 張人工檢視風格一致。

---

### Task 8：整合上架

**Files:** Modify `js/app.js`（選單新增「詞靈」分組：詞靈夥伴/詞源星圖/詞靈競技 3 卡）、`index.html`、`css/style.css`；sync `~/projects/vocab-duel-{cf,netlify}`

- 選單三張 wc-mcard；heroStrip 尾端加 active 寵小頭像（點了進 pets）
- 全量驗證：validate-pets、test-petstore、node --check 全 js、三平台部署、Chrome 走完驗收清單（spec 驗收段 4 條）
- git push、更新 memory `project_vocab_duel_deploy.md`、vault 紀錄

---

## 執行順序與依賴
1 → 2 →（3、4 可並行）→ 5 → 6 → 8；Task 7 生圖在 Task 1 完成後即可背景開跑（4 線約 1-1.5 小時），與 2-6 平行。

## 風險
- 60 張生圖是最長工時（背景跑，程式先用 emoji 佔位 onerror 已保底）
- 力導向圖效能：只跑 192 節點主圖，已控
- Upstash 免費額度：petpool 上限 200、榜上限 50，寫入量低
