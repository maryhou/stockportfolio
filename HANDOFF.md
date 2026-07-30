# HANDOFF — WealthTrack 投資日誌

> 最後更新:2026-07-30。給下一個接手的人(或下一次 Claude session)的交接文件。
> 架構與目錄結構詳見 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 專案是什麼

台股(上市/上櫃)交易、股息與投資組合追蹤 PWA。React 18 + Vite + TypeScript + Tailwind,
Firebase(Google 登入 + Firestore 雲端同步),Vercel serverless functions 代理 TWSE/TPEx/Yahoo 行情。

- 正式站:https://mystockportfolio.vercel.app
- 本機開發:`npm run dev`(port 5174)
- 測試:`npm test`(Vitest,45 tests)/ 型別:`npx tsc --noEmit`

## 部署(重要)

- Push 到 `main` → GitHub Actions 跑 `tsc` + `vitest` + `npx vercel --prod`。
- Vercel 專案是 **`mystockportfolio`**,scope 在 team **`maryhou-s-projects`**(不是個人帳號)。
  本機下 vercel CLI 指令要加 `--scope maryhou-s-projects`。
- 2026-06 中 Vercel 把個人帳號遷移成 team,曾導致 GitHub secrets(`VERCEL_ORG_ID`、`VERCEL_TOKEN`)
  失效,**部署靜默失敗了 16 天**(測試綠但 deploy 掛)。已於 2026-07-04 修復。
  **教訓:push 之後用 `gh run list` 確認部署真的成功。**

## 目前進度(2026-07-04)

安全審查(2026-06-25 開始)**全部收尾**:

| # | 項目 | 狀態 |
|---|---|---|
| 1 | Firestore rules 鎖定 `users/{uid}` | ✅ `4f5ed7c` |
| 2 | API proxy symbol 驗證(`api/*.ts`) | ✅ `2906e5f`,正式站已驗證 |
| 3 | 生物辨識鎖僅為 UI 閘門(localStorage 明文) | 📝 已記錄,決定不修 |
| 4 | CSP + 安全 headers(`vercel.json`) | ✅ `33c2957`,實測 CSP 有強制執行 |
| 5 | 匯入 JSON 逐欄位驗證(`src/utils/validateImport.ts`) | ✅ `c7dd5df`,15 個測試 |
| 6 | protobufjs CVE(`npm audit fix`) | ✅ `bd736ba` |

### 2026-07-06:股息可逐筆免扣健保補充費與匯款手續費

資本利得性質的配息依規定免扣健保補充費;入帳銀行若是該檔保管銀行則免匯款手續費。
自動判斷太複雜,改為逐筆手動勾選(預設都扣,與原行為相同):

- `DividendTransaction` 新增選用欄位 `healthFeeExempt?: boolean` 與
  `transferFeeExempt?: boolean`(true = 此筆免扣;預設不存在 = 照舊)。
  false 時不寫入欄位(Firestore 不收 undefined、資料保持乾淨);免扣時對應金額存 0。
- 股息明細 modal 與新增/編輯 sheet 的兩個費用列共用 `FeeToggleRow` checkbox
  (`src/components/DividendView.tsx`);明細 modal 內切換會立即重算並存檔,
  匯費勾回時回填設定的預設值。健保費未達 $20,000 門檻時維持靜態顯示、不出現 checkbox。
  編輯 sheet 的匯費輸入框在免扣時停用並回填預設值。
- **注意**:明細 modal 的 dividend 物件來自列表展開,帶有 stockId 等額外欄位,
  存檔前必須逐欄重建乾淨物件(見 `toggleFee`),直接 spread 會把垃圾欄位寫進 Firestore。
- `validateImport.ts` 已同步驗證新欄位(共 48 測試)。

### 2026-07-06(續):健保補充費金額可手動覆寫

補充保費對 ETF 只以配息中「股利所得」部分課徵(× 占比),占比每期不同且無 API 可查,
故不做占比欄位,改讓金額直接可改(使用者從銀行明細/收益分配通知書抄實扣值):

- 編輯 sheet 新增「健保補充費(元)」輸入框:預設依 2.11% 公式自動算並隨金額連動;
  一旦手動改過即轉手動模式、停止自動重算,附「重算 (2.11%)」按鈕可回到自動。
- **不新增資料欄位**:手動與否用「存值 ≠ 公式值」推斷(`isHealthFeeManual`),
  舊資料、validateImport 都不用動。手動時 UI 標示「(手動)」且不套用 2 萬門檻判斷。
- 明細 modal 的 `toggleFee` 只重算被切換的那個費用,另一個保留原值 ——
  否則切匯費會把手動健保費重算蓋掉(已修)。健保費從免扣勾回時會回到公式值
  (手動值不保留,要精確金額進編輯改)。「重算」按鈕附 refresh icon。
- **觀察項**:自動化測試中曾「一次性」讀到無法由程式碼產生的存檔值(健保費=10),
  以完全相同步驟重演三次皆正確、無法重現,判斷是測試工具連點的 artifact。
  若實際使用出現健保費異常值,代表有真的 race condition,回頭從
  `handleSaveDividend`/`toggleFee` 查起。

### 2026-07-06(續):股息頁「歷年股息」總覽卡（ec633ec）

使用者要求年份切換更明顯、要有「長期投資紀錄」的成就感：

- Hero 卡與月度圖表之間新增「歷年股息」卡：從第一筆紀錄年份**連續**列到今年
  （中間沒紀錄的年份以 $0 保留），每年一條金額比例橫條，點年份即切換月度圖表
  與紀錄清單，並同時清除月份篩選。卡片跟著個股篩選 chips 連動，右上角顯示累計。
- 超過 `YEAR_COLLAPSE_LIMIT`（= 5，`DividendView.tsx` 頂部常數）年時預設收合，
  只列最近 5 年 + 「顯示更多（還有 N 年）」按鈕，展開後可收合。
- Hero 卡金額下方加「自 X 年起 · 累計 N 筆入帳」。
- 原本藏在月度圖表標題旁、`years.length > 1` 才出現的年份切換小箭頭已移除，
  由總覽卡取代。
- 防髒資料保險絲：年距超過 15 年（如 TWSE 髒日期「-1893 年」被存進來）時，
  退回只列「有紀錄的年份 + 今年」、不逐年填滿。
- 已在 preview 以 2020–2026 七年假資料實測（先備份、後還原 localStorage）；
  tsc + 48 tests 通過。

### 2026-07-30:分析頁圓餅圖互動化與 mobile 點擊優化

分析頁(`ActivityView.tsx` 的 `PortfolioOverview`)投資組合圓餅圖(`DonutChart.tsx`)一系列 UI 優化,
讓使用者一眼看出各檔占比、點擊即看個股明細:

- **圖例顯示占比 %**:每檔圖例後加上占比(一位小數,`tabular-nums` 對齊)。
  占比 = 該檔(持倉市值 + 已回收淨額)÷ 圓餅總和,與圓環比例完全一致。
- **點擊區塊看明細**:`DonutChart` 新增 `interactive` 模式。點某個 slice → 其他 slice 淡化
  (opacity 0.25),圓環中心改顯示該檔「檔名 / 占比% / 股數 / 目前市值」。
  再點同一 slice、或點中心空白處即取消。明細列由 `Segment.rows`(選用欄位)帶入,
  在 `ActivityView` 組成(股數 = 剩餘股數;目前市值 = 剩餘股數 × 現價,遵守隱藏金額開關)。
- **圓環放大加粗**:`size` 180→220、`strokeWidth` 26→36,大區塊更好點、中心明細更好讀。
- **圖例 ↔ 圓餅雙向連動**:選取狀態從 `DonutChart` 內部 state 提升到 `PortfolioOverview`
  的 `donutActive`,以受控 props(`activeIndex` / `onActiveChange`)共用。
  `DonutChart` 保留「未給 props 就用內部 state」的後備,不影響其他呼叫端。
  切換「目前持倉 / 累積績效」分頁時會 `setDonutActive(null)` 重置(避免索引錯位)。
- **mobile 點擊優化**:圖例改為按鈕並加大點擊區(`px-2.5 py-1.5` + 圓角),
  選中時有灰色膠囊底色回饋(手機無 hover)。**細段(如 1.1% / 1.2%)弧角僅約 4°、
  直接點圓餅很難中,圖例就是它們的可靠替代點擊路徑** —— 因此未再加 slice 隱形擴大熱區。
- 已在 desktop 與 375px mobile viewport 實測點擊/連動/取消;tsc + 48 tests 通過。

## 未完成 / 待辦

0. ~~**Vercel token 短效問題**~~:**2026-07-30 永久解決**。歷史上多次因 CLI 登入核發的
   短效 token 失效導致部署靜默失敗(7/4、7/6、7/30 各一次)。7/30 這次由使用者到
   Vercel dashboard → Account Settings → Tokens 建立 **No Expiration** token
   (scope = team `Maryhou's projects`)、`gh secret set VERCEL_TOKEN` 更新後部署成功。
   token 不再過期,此問題不會再發生。**但每次 push 後仍應 `gh run list` 確認部署真的綠**
   (歷史上 token 失效都是靜默的,養成確認習慣仍有價值)。
1. **手機實測登入**:CSP 上線後,建議用手機以真實 Google 帳號完整登入一次確認
   (自動化驗證已涵蓋載入與登入起手流程,但完整 OAuth 流程需要真人)。
2. **Vite 8 升級**(擱置):`npm audit` 剩 esbuild/vite 兩條,只影響本機 dev server,
   要升 Vite 8(breaking)才能清掉。
3. ~~**CI Node 20 deprecation 警告**~~:**2026-07-30 已處理** —— `deploy.yml` 的
   `actions/checkout` 與 `actions/setup-node` 由 `@v4` 升到 `@v5`(改用 Node 24 執行),
   清掉每次部署的 deprecation 警告。app 自身 build/test 仍用 `node-version: '20'`(與警告無關)。

## 已知問題(已決定暫不處理)

### 已公告但未除息的 ETF 配息不會出現在建議清單(2026-07-04 診斷)

- **現象**:使用者反應新增股息時看不到 006208 已公告的 2026 年配息(4.75,除息 7/16)。
- **原因**:上市 ETF 股息來自 TWSE `etfDiv` API(`src/utils/fetchDividends.ts` 瀏覽器直查)。
  公告初期該 API 的「收益分配金額」欄位是 `null`(約除息日前後才補上),
  解析器遇到金額 NaN 會整列跳過。Yahoo 備援只有歷史除息日,也幫不上。
- **決定**:先不修。TWSE 補上金額後,現有流程會自動撈到(無快取)。
- **附註**:此 API 偶爾回傳髒資料(除息日年份出現「106年」「-1893年」),
  同一查詢連打兩次結果可能不同。若未來要修,方向是:金額 null 的列保留並標示
  「金額尚未公告」讓使用者自填 + 丟棄年份不合理的列。
- **快速確認法**:`curl "https://www.twse.com.tw/rwd/zh/ETF/etfDiv?stkNo=<代號>&startDate=<YYYYMM01>&endDate=<YYYYMM01>&response=json"` 看金額欄。

## 維護規則(改壞會靜默出事的地方)

- **CSP 白名單**:前端要連任何新的外部網域,必須同步加進 `vercel.json` 的
  `Content-Security-Policy`,否則該功能上線後會被瀏覽器擋掉。
- **股號 regex**:`^[0-9]{4,6}[A-Z]?[0-9]?$`(在 `api/*.ts` 三處)。
  不要「簡化」成 `^[0-9]{4,6}[A-Z]?$` —— 那會拒絕真實特別股股號如 `2887Z1`。
- **匯入格式**:改 `src/types/index.ts` 的資料模型時,記得同步
  `src/utils/validateImport.ts` 與其測試,否則使用者匯入新格式備份會失敗。
