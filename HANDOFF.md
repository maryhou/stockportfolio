# HANDOFF — WealthTrack 投資日誌

> 最後更新:2026-08-10。給下一個接手的人(或下一次 Claude session)的交接文件。
> 架構與目錄結構詳見 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 專案是什麼

台股(上市/上櫃)交易、股息與投資組合追蹤 PWA。React 18 + Vite + TypeScript + Tailwind,
Firebase(Google 登入 + Firestore 雲端同步),Vercel serverless functions 代理 TWSE/TPEx/Yahoo 行情。

- 正式站:https://mystockportfolio.vercel.app
- 本機開發:`npm run dev`(port 5174)
- 測試:`npm test`(Vitest,82 tests)/ 型別:`npx tsc --noEmit`

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

### 2026-07-30(續):匯出改為完整備份(含 settings)

原本「匯出資料」只存 `stocks`(買/賣/股息都在,巢狀於各股票下),**但不含 settings**
(券商清單、稅率、股息預設匯費、主題),還原到新裝置時設定會遺失。已改為完整備份:

- **匯出**(`ProfileView.tsx` `handleExport`)格式改為
  `{ version: 1, exportedAt, stocks, settings }`;卡片副標改「完整備份:交易・股息・設定」。
- **匯入**新增 `parsePortfolioJson`(`validateImport.ts`),自動辨識兩種格式:
  舊的**純陣列**(stocks-only)照舊支援;新的**物件格式**則一併驗證還原 settings。
  settings 逐欄驗證(`parseSettings`/`parseBroker`:userName/taxRate 必填、brokers 至少一筆、
  theme 限三值、dividendTransferFee 選填),格式錯誤丟 `設定格式錯誤`。舊的 `parseStocksJson`
  保留不動(仍被測試使用)。
- **App**(`App.tsx` onImport)匯入若帶 settings 就套用(setSettings + 存 localStorage + 雲端),
  toast 顯示「資料與設定已匯入」;純 stocks 備份則顯示「資料已匯入」、設定不動。
- 測試 48→61:新增 `parsePortfolioJson` 的新格式往返、舊陣列相容、settings 驗證拒絕案例。
- **維護提醒**:改 `AppSettings` / `Broker` 型別時,記得同步 `parseSettings`/`parseBroker`
  與測試(和 stocks 那條維護規則同理)。

### 2026-07-31:現價盤中顯示昨收的 bug 修復

使用者反應「股票現價不是最新現價」。診斷:TWSE mis `getStockInfo.jsp` 的 `z`
(最新成交價)欄位在盤中**經常是 `"-"`** —— 它只反映當下約 5 秒快照內有沒有成交,
沒成交就空白(實測 10:00 盤中所有股票的 `z` 同時空白達數分鐘)。原本 `z` 空就直接
退回 `y`(昨收),於是整個交易時段都顯示昨天收盤價(2330 顯示 2205,實際約 2382,差 ~8%)。

- 修法:新增 `pickPrice()` 取價優先序 **最新成交 `z` → 最佳買/賣價中間價
  (`b`/`a` 首檔平均,盤中即時報價)→ 昨收 `y`(僅真正收盤且無報價時)**。
  跌停/漲停只剩單邊時用該邊;皆無則跳過該檔。
- 兩處平行實作都要改且**須保持同步**:`api/prices.ts`(正式站 edge proxy,手機走這條)
  與 `src/utils/fetchPrices.ts`(dev 直連 TWSE;瀏覽器 CORS 會擋,dev 看不到即時價是正常的)。
- 測試:新增 `src/utils/fetchPrices.test.ts`(6 例,用 2026-07-31 實錄的 2330 資料),
  共 61→67 tests。已用 Node 對 live API 實跑驗證(2330 2205→2382.5 等)。
- 中間價會出現 .5(如 2382.5),非合法 tick,但為盤中估值,遠比昨收準確;可接受。

### 2026-07-31(續):股息頁 desktop 分欄 + 自動估算匯入多筆 bug

- **Desktop 版面分左右**([DividendView.tsx](src/components/DividendView.tsx)):原本單欄在 desktop
  全寬拉伸。`lg:` 以上改成兩欄 grid —— 左欄(總覽卡+歷年股息+月度股息)`lg:sticky lg:top-6`
  捲動時固定,右欄=股息紀錄清單。mobile 完全不動(維持 `space-y-4` 單欄堆疊)。
- **匯入多筆只存一筆 bug**:使用者反應「自動估算」一次匯入多筆,toast 跳了 N 次成功但頁面只多一筆。
  根因:匯入 `onConfirm` 用 `items.forEach(onSaveDividend)`,每次 `handleSaveDividend` 都讀
  **同一份舊的 `stocks` closure**、各自 `setStocks` 互相覆蓋,只剩最後一筆(toast 每筆都觸發故看似全存)。
  修法:新增 [mergeDividends.ts](src/utils/mergeDividends.ts) `mergeImportedDividends()` 把整批一次
  摺疊進 stocks,`handleImportDividends`(App.tsx)只呼叫一次 `update()`,toast 改「已匯入 N 筆」。
  回歸測試 [mergeDividends.test.ts](src/utils/mergeDividends.test.ts) 5 例(含 0056/006208/00919 三檔情境)。
  **教訓**:任何「一個 tick 內對同一 state 連續多次 setState」都要用單次摺疊或 functional update,
  不要在迴圈裡呼叫讀取當前 state closure 的 handler。

### 2026-07-31(續):現價來源標示 + 已公告未除息 ETF 配息

- **現價盤中/收盤狀態標示**:延續當天的現價修復(z 空退中間價)。盤中現價可能是即時成交或
  買賣中間價、收盤後是收盤價,使用者難分辨新鮮度。新增 [marketStatus.ts](src/utils/marketStatus.ts)
  `getMarketStatus()`(TWSE 週一~五 09:00–13:30 台灣時區,`getTimezoneOffset` 校正故不分裝置時區)
  與 [MarketStatusBadge.tsx](src/components/MarketStatusBadge.tsx):盤中「盤中·即時」(綠點)、
  其餘「已收盤·收盤價」(灰)。放在首頁投組卡(`tone="onDark"`)與個股明細現價旁。
  **未處理國定假日**(當天會誤顯示盤中,但價格不會變動,影響輕微;要精確需接假日行事曆)。3 測試。
- **已公告未除息的 ETF 配息**(解掉下方「已知問題」那條):TWSE etfDiv 剛公告時金額欄為空,
  舊解析整列跳過 → 使用者看不到。改為保留該列標 `cashPerShare: null`(待公告)+ 過濾髒年份,
  抽出純函式 [parseEtfDivRows()](src/utils/fetchDividends.ts)。新增股息建議清單待公告列顯示
  「金額尚未公告·點此帶入日期」、點選帶入除息/發放日但金額留空自填;自動估算批次匯入跳過待公告列。
  `DividendRecord.cashPerShare` 型別改為 `number | null`。4 測試(共 79)。

### 2026-08-03:股息「配息調整」欄位

**問題**:app 用「每股配息 × 持有股數」快速估算應得股息,但 ETF 實際發放是各所得類別
(如 財產交易所得 76、股利所得 54C)**分別四捨五入後加總**,與估算常差 ±1 元
(實例:0050 每股 0.6 × 46 = 27.6→估 28,實發 20+7=27)。無 API 可查各類別占比,需人工對帳。

- **資料模型**:`DividendTransaction` 新增選用 `dividendAdjustment?: number`(帶正負號的元;
  為 0 時不寫入,維持 Firestore 乾淨,與 healthFeeExempt 等既有慣例一致)。
- **計算**([calculations.ts](src/utils/calculations.ts)):`calcDividendNet` 加選用第 4 參數
  `adjustment = 0` → `max(0, gross − health − transfer + adjustment)`。**套在最終 net、不動 gross**,
  刻意不干擾健保費/匯費那套免扣+手動覆寫邏輯(那塊最敏感)。新增 `formatSignedNTD`(顯示 +/−)。
- **編輯只在編輯頁,明細唯讀**(經使用者測試後定案)([DividendView.tsx](src/components/DividendView.tsx)):
  - **新增/編輯 sheet**:「配息調整(元)」正式輸入欄 + 試算多一條「配息調整」線 —— 唯一可修改的入口。
  - **第一層明細 modal**:唯讀。只在 `dividendAdjustment` 非 0 時顯示一條純文字「配息調整 ±$X」列
    (label 旁有資訊 i,值為 0 或不存在時整列隱藏,保持乾淨)。
    - **一度做過**明細內可直接編輯的小輸入框(onBlur 存檔),使用者測試後覺得第一層應保持唯讀、
      乾淨清楚,故拿掉輸入框改純文字。`commitAdjustment` 已移除;`rebuildAndSave` 保留
      (仍被 `toggleFee` 使用,切費用時會保留既有的 `dividendAdjustment`)。
- **說明 modal**:明細唯讀列的「配息調整」label 右邊有資訊 i,點開說明(琥珀 i 圖示 +
  沿用 app 既有 說明 modal 樣式,`z-[210]` 疊在 bottom sheet 之上,點背景關閉;
  文案指引「可在編輯頁輸入正負值微調」+ ETF 各所得類別分別進位的原因)。
- **匯入驗證**([validateImport.ts](src/utils/validateImport.ts)):逐欄驗證 `dividendAdjustment`
  (非 number 拒絕)。**維護規則**:此欄與 `calcDividendNet` 的 adjustment 參數需保持同步。
- 測試 79→82(calcDividendNet 配息調整、validateImport 往返 + 拒絕案例)。
  已在 mobile viewport 實測:編輯 sheet 帶入與試算、明細唯讀列有/無值顯示、切匯費保留調整、
  說明 modal 開關(先備份、後還原 localStorage)。tsc + 82 tests 通過。

### 2026-08-03(續):iOS safe-area(瀏海/狀態列)頂端間距

**問題**:手機上所有頁面標題與右上角按鈕貼著狀態列,尤其股息頁右上「自動估算/新增」兩顆按鈕
被時間/電量壓到讀不清。根因:`index.html` viewport meta 缺 `viewport-fit=cover`
(所以 `env(safe-area-inset-top)` 永遠回傳 0),各頁頂端只用固定 `pt-6`(24px)不足以避開狀態列。

- **[index.html](index.html)**:viewport 加 `viewport-fit=cover`,啟用 `env(safe-area-inset-*)`。
- **[index.css](src/index.css)**:`@layer utilities` 新增 `.pt-safe-6`
  = `calc(env(safe-area-inset-top) + 1.5rem)`、`.pt-safe-3`(env + 0.75rem,備用)。
  **無瀏海裝置/桌機 env()=0 → 值等於原本 pt-6/pt-3,零回歸**;iOS 才自動多推瀏海高度。
- 各頁最上層容器 `pt-6` → `pt-safe-6`:HomeView、HoldingsView、ActivityView(3 個 render 分支)、
  ProfileView、NotificationsView、DividendView 標題列(白底列會延伸進瀏海區)。
- **[SearchOverlay.tsx](src/components/SearchOverlay.tsx)**:全螢幕 `fixed inset-0` 覆蓋層,
  原本硬寫 `pt-12`(48px)瞎猜狀態列高度 → 改 `pt-safe-6`,不同機型精準避開。
- **盤點結果**:只有 SearchOverlay 是頂端貼齊的覆蓋層需處理;底部彈出面板
  (AddTransactionSheet/EditTransactionModal/SettingsSheet/BottomSheet)貼底、
  置中彈窗(OnboardingModal/AppLock)置中,皆不碰狀態列。
- 已在 mobile viewport 實測(桌機 env=0,`.pt-safe-6` 實測 24px 確認 class 生效且無回歸;
  真實瀏海效果需 iOS 裝置才顯現)。**維護規則**:新增頂端貼齊的頁面/覆蓋層,頂 padding 一律用
  `pt-safe-*` 而非固定 `pt-N`。

### 2026-08-10:字體大小(無障礙)+ 股票搜尋修正 + 設定重整(branch `feature/font-size-and-search-fixes` → merged to main)

一次處理使用者多項回報。以下 ①②③ 為最初三項,後續(設定拆分、px→rem、色條、防跑版三處、代號上移、
成績卡堆疊)見本節末尾各條:

**① 字體太小 → 新增「字體大小」設定(年長使用者)**
- 型別([types/index.ts](src/types/index.ts)):新增 `AppFontScale = 'normal' | 'large' | 'xlarge'`、
  `AppSettings.fontScale?`、常數 `FONT_SCALE_PX = { normal:16, large:18, xlarge:20 }`(根 px)。
- 套用([App.tsx](src/App.tsx)):useEffect 依 `previewFontScale ?? settings.fontScale ?? 'normal'`
  設 `document.documentElement.style.fontSize`。**Tailwind 皆用 rem,故改根 font-size = 整個 UI 等比放大**。
  跟主題一樣有即時預覽:`previewFontScale` state + 傳 `onFontScalePreview` 給 SettingsSheet;
  存檔/匯入時 `setPreviewFontScale(null)` 清預覽,關閉設定則回退預覽(`handleClose`)。
- UI([SettingsSheet.tsx](src/components/SettingsSheet.tsx)):「字體大小」區三顆按鈕(標準/大/特大),
  各自用 inline `fontSize` 顯示放大後的「A」預覽,點擊即時預覽。**注意**:`handleSave` 原本重建
  settings 物件時漏掉 `dividendTransferFee`(存設定會把它清成 undefined 的隱性 bug),此次一併補回保留。
- 匯入驗證([validateImport.ts](src/utils/validateImport.ts)):`parseSettings` 新增 `fontScale` 逐欄驗證
  (限三值)。**維護規則**:動 `AppSettings`/`AppFontScale` 要同步這裡與測試。
- 已在 mobile viewport 實測:點特大 → 根 font-size 16→20px、整個 UI 放大、按鈕高亮;關閉回退 16px。
- **px→rem 補漏(2026-08-10 續)**:根 font-size 縮放**只影響 rem 文字**;全專案原有 **136 個
  `text-[Npx]` 寫死像素**(9~13px 的小標籤/badge/hint,15 檔),放大時完全不動 —— 恰好是年長者最需要
  放大的小字(例:首頁個股卡的股號 `text-[11px]`)。已用腳本全部轉成等值 rem:
  `10px→0.625rem`、`11px→0.6875rem`、`9→0.5625`、`12→0.75`、`13→0.8125`(base 16px,標準大小下
  像素完全相同、零視覺回歸;放大時才跟著變大)。實測股號 badge:標準 11px、特大 13.75px。
  **維護規則**:新增文字一律用 Tailwind 標準級距(text-xs/sm/…,皆 rem)或 `text-[x.xxxrem]`,
  **不要用 `text-[Npx]`**,否則不會隨字體大小設定放大。(icon 的 svg width/height 仍是 px,暫不隨放大,
  影響輕微;要一起放大需另外處理。)
- **反向原則:裝飾元素的尺寸「不該」隨字體放大**。個股明細列(`StockSummaryRow`)左側的彩色色條原本
  `w-2.5`(rem)會隨字體變粗、浪費空間 —— 已把**寬度**改成固定 `w-[10px]`(高度 `h-10` 保留、仍隨列高)。
  **規則**:文字用 rem(要放大);純裝飾的粗細/固定尺寸用 px(不要放大)。
- **首頁 Hero 卡底部三欄金額防跑版**([HomeView.tsx](src/components/HomeView.tsx)):三欄等寬 `flex-1`
  塞完整 NT$ 金額,7~8 位數(如 `+$2,719,608`)在 `text-sm` 下就會溢出、被卡片 `rounded-3xl overflow-hidden`
  圓角切掉(字體放大後更嚴重)。改法:值改用流動字級 `STAT_VALUE_FONT = clamp(0.6875rem, 3.2vw, 0.875rem)`
  + `whitespace-nowrap tabular-nums`,欄位加 `min-w-0`。**永遠一行、放不下自動縮小而非藏位數**(理財 App
  不截字/不縮寫)。實測 16px 與 20px 皆不 overflow(最寬 +$2,719,608 在 111px 欄內佔 87~91px)。
  用 vw 故這三格不隨字體設定等比放大,但 rem 下限讓它仍會微幅變大且保證不跑版。
  - **後續(同日):堆疊只在 mobile 生效**。原本 `stackStats` 一律上下堆疊,但桌機/平板寬螢幕(內容變寬)
    根本放得下 2 欄,堆疊反而浪費空間。改為堆疊類別都加 `md:` 還原成 2 欄(`md:flex-row`、
    `md:flex-1`、分隔線 `md:w-px` 等);對齊容器自身的 `max-w-[430px] md:max-w-full` 斷點。
    實測:375px+特大=堆疊、1000px+特大=2 欄(rootFontSize 20px 下 flexDirection 仍為 row)。
- **代號改放名稱上方(垂直堆疊)防跑版**([ActivityView.tsx](src/components/ActivityView.tsx)):
  `StockSummaryRow`(分析頁個股列)與 `TradeTileRow`(交易紀錄列)原本股名與代號**並排**
  (`名稱 <span> 代號`),字體放大時中文股名換行、代號被夾在中間 → 版面亂(如「群益台/灣精選 00919/高息」)。
  兩者都改成**代號在上(text-xs 灰)、名稱在下(text-sm 粗)** 垂直堆疊,左欄加 `min-w-0`、右側金額 `flex-shrink-0`。
  這樣不論字體大小都各佔一行、不互相擠。已在特大實測兩者皆正常。
  **規則**:列表同時要顯示代號+中文名時,用上下堆疊而非並排(中文名放大會換行擠壞並排版面)。
- **「我的投資成績」卡:字體放大時 2 欄→上下堆疊**([ProfileView.tsx](src/components/ProfileView.tsx)):
  總損益/累積報酬率原本 2 欄並排(各半卡寬),特大時 `+$2,719,608`、`+88.74%`(text-xl)被切掉。
  依 `settings.fontScale` 判斷:`stackStats = fontScale===large||xlarge` → true 時 `flex-col`(各佔整卡寬、
  分隔線改水平),normal 維持 2 欄。實測特大堆疊不切字、標準維持原 2 欄。
  **這是「依字體大小改版面」的範例**:大數字在窄欄放不下時,與其縮字(年長者看不到),不如放大模式改上下排。
- **關於字體大小自動存檔**:已用「清除 fontScale → reload → 靜置 20 秒(含 15 秒輪詢週期)零操作」實測,
  值維持 (unset)、16px 不變 —— **確認沒有自動/週期性存 settings 的 bug**(輪詢只存 stocks)。
  存 settings 只發生在:onboarding、儲存按鈕、匯入、雲端登入還原。驗證期間 localStorage 一度殘留
  xlarge 純粹是瀏覽器自動化誤點「儲存」造成,非程式問題。

**② 打完整股號帶 A 尾碼搜不到(00991A、00403A)**([AddTransactionSheet.tsx](src/components/AddTransactionSheet.tsx))
- 根因:`searchTwStocks` 把 query `toLowerCase()`,卻用未轉小寫的 `code.startsWith(q)` 比對。
  主動式 ETF 代號含大寫尾碼(`00991A`),`"00991A".startsWith("00991a")` = **false** → 純數字搜得到、
  一打到 A 就消失。修法:`code.toLowerCase().startsWith(q)`(大小寫不敏感)。實測 00991A 已帶出「主動復華未來50」。

**③ 剛上市新股搜不到 / 擔心現價撈不到(009826)**
- **現價本來就 OK**:價格走 symbol 查 TWSE/TPEx,不依賴 [twStocks.json](src/data/twStocks.json)。
  curl mis API 確認 009826 有現價(y=10.22、買賣報價)。使用者看到的只是**搜尋(名稱)撈不到**——
  twStocks.json 是靜態快照,上市不到一週的新股不在裡面。
- 修法:本地清單查無、但輸入像完整股號時,對**線上即時查名**。mis `getStockInfo` 的 `n` 欄一上市就有名稱
  (009826 = 「貝萊德世界股票」)。
  - 新增 [api/lookup.ts](api/lookup.ts) edge proxy(`GET /api/lookup?symbol=` → `{code,name}`),
    複用 mis + 同一組股號 regex(**維護規則**:regex 與 api/prices、api/history、api/dividends 保持一致)。
  - 新增 [lookupStock.ts](src/utils/lookupStock.ts) `lookupStockName()`:prod 走同源 `/api/lookup`,
    dev 直連 mis(**dev 會被 CORS 擋是正常的**,同 fetchPrices)。永不 throw,查無回 null。
  - AddTransactionSheet:輸入變動時 debounce 450ms 觸發查名(seq guard 防舊結果覆蓋),
    dropdown 顯示「線上查詢中…」spinner、查到就變一列可點的建議、查不到顯示
    「查無此代號的線上資料,可直接在下方手動輸入名稱」的 fallback 提示。
  - 已實測:dev 因 CORS 走 fallback(直接 fetch mis 回 Failed to fetch 已確認);
    **正式站端到端已驗證:`GET /api/lookup?symbol=009826` → `{"code":"009826","name":"貝萊德世界股票"}`。**
- tsc + 82→83 tests 通過(新增 fontScale 驗證測試)。

### 2026-08-10(續):設定頁拆成兩個 modal(推線前優化,同一 branch)

使用者反應「偏好設定」全塞在一個 modal 裡找不到東西。改成像「資料管理」的可探索列表:
- **[ProfileView.tsx](src/components/ProfileView.tsx)**:移除右上角齒輪(舊的隱藏入口)與原本獨立的
  「費用計算說明」卡。新增小標題「個人設定」區(白底卡、兩列、風格同 資料管理):
  - **偏好設定**(sliders icon)→ 開 preferences modal:個人(使用者名稱)・介面主題・字體大小・隱私。
  - **券商設定**(百分比 icon,琥珀)→ 開 broker modal:券商費率・交易稅・費用計算說明。
- **[SettingsSheet.tsx](src/components/SettingsSheet.tsx)**:同一元件加 `section: 'preferences' | 'broker'`
  prop(export `SettingsSection`),用 `{section === ...}` 分別 render 兩組;標題隨 section 切換。
  **費用計算說明搬進 broker modal**(改用當前編輯中的 brokers/taxRateInput 即時計算,取代原 ProfileView 靜態卡)。
  **存檔邏輯不變** —— state 對所有欄位都從 settings 初始化,任一 modal 存檔都保留另一組欄位(無資料遺失)。
- **[App.tsx](src/App.tsx)**:`showSettings: boolean` → `settingsSection: SettingsSection | null`;
  ProfileView props `onSettingsClick` → `onOpenPreferences` / `onOpenBrokerSettings`。
- **注意**:只有「儲存設定」按鈕會存檔(`onSave` 唯一呼叫點),預覽/關閉都不存(關閉會 revert 主題+字體預覽)。
- 已在 mobile viewport 實測:個人設定兩列、兩 modal 內容分組正確、字體預覽仍即時、關閉回退;
  tsc + 83 tests 通過。(驗證途中瀏覽器自動化誤點過 儲存,把 fontScale='large' 存進 localStorage,
  已手動清回原狀——非程式 bug。)

### 2026-08-10(續):更新內容 modal + 系統公告

- **通知中心公告**([App.tsx](src/App.tsx) `SYSTEM_ANNOUNCEMENTS`):新增本次優化兩則系統公告
  (字體大小、股票搜尋),既有使用者下次開啟由 `loadNotifications` 注入一次。
- **更新內容 modal**([WhatsNewModal.tsx](src/components/WhatsNewModal.tsx)):每個版本首次開啟主動彈一次,
  列出本版重點 + 「立即調整字體大小」CTA(關閉並開 `偏好設定`)。版本控制:`APP_VERSION`(現 `2026.08.10`)
  對 `stock-tracker-last-seen-version`(localStorage);既有使用者(有資料)且版本不符才彈,全新使用者
  只標記版本不打擾 onboarding。**改版規則:① 更新 `APP_VERSION` ② 改寫 `WHATS_NEW` 內容
  ③(如需公告)在 `SYSTEM_ANNOUNCEMENTS` 加一則新 id。** 已實測:彈出、CTA 跳偏好設定、關閉後重載不再彈。

### 2026-08-10(續):通知中心點擊開詳情 modal

原本通知卡只有帶 `actionType` 的能點(且描述 `line-clamp-2` 被截斷,系統公告看不到全文)。改為
**每一則都可點開詳情**([NotificationDetailModal.tsx](src/components/NotificationDetailModal.tsx)):
- 點卡片 → 開 modal 顯示完整標題/時間/全文(不截斷)+ 標記該則已讀。
- 有 `actionType` 者在 modal 內顯示 CTA(stock→「查看持股」、activity→「查看交易紀錄」),點了關閉並導覽。
- `NotificationsView` 的 `TYPE_CONFIG` 改 export 供 modal 重用;卡片一律可點(移除 isClickable 閘門)。
- App:`notificationDetail` state;`handleNotificationClick` 開 modal、`handleNotificationAction` 導覽。
- 已實測:系統公告開全文、到價通知開 CTA 並成功跳到個股頁。

### 2026-08-10(續):首頁 Hero 三欄金額響應式 + 隨字體放大 + 去 $

首頁 Hero 卡底部三欄(已實現損益／累積總損益／總回收金額)一系列優化
([HomeView.tsx](src/components/HomeView.tsx)),核心是「大數字 + 字體放大」下不跑版又要放得夠大:

- **容器左右 padding**:三欄外層加 `style={{ padding: '0 10px' }}`(固定 px、不隨字體縮放),
  讓左右緣與上方「投資組合價值/大金額」對齊。
- **響應式欄數(依 `settings.fontScale`,`metricsGridCols`)**:從原本 flex+直線分隔改成 grid,
  窄螢幕字體放大時自動減欄避免擠壓 —— **標準→3 欄、大→2 欄、特大→1 欄**;`md:` 以上寬螢幕
  一律 `md:grid-cols-3`。移除原 `w-px` 直線分隔(在 2/1 欄或換行會亂),改用 `gap-x-2`。
  卡片無固定高度,grid 換行時**高度自動撐開**、不截字/不重疊。
- **標籤隨字體放大**:三個標籤 `text-[0.625rem]`(10px)→ `text-xs`(rem,會隨字體設定放大)。
- **金額隨字體放大且防溢出(`STAT_VALUE_FONT_BY_SCALE`)**:金額字級改成依 `fontScale` 分級的 clamp,
  **`clamp(下限rem, 3.9vw, 上限rem)`** —— rem 下限/上限隨根字級放大、中間 3.9vw 依螢幕寬防溢出:
  - normal `clamp(0.75rem, 3.9vw, 1.125rem)` / large `clamp(0.9375rem, 3.9vw, 1.375rem)` /
    xlarge `clamp(1.125rem, 3.9vw, 1.5rem)`。
  - 手機放大→版面轉 2/1 欄、欄變寬,rem 下限把金額頂大;桌機維持 3 欄、vw 大則由 rem 上限封頂不爆欄。
  - **實測 6 組合(標準/大/特大 × 手機 375/桌機 768)最寬 `+$2,719,608` 皆有餘裕不截字**
    (最緊是手機標準 3 欄,欄僅 ~100px、金額 14.6px 留 ~4px)。
- **三欄金額去掉 `$`**(僅這三欄,其他 UI 不動):金額本身已很長,去 $ 更乾淨、更利於放大。
  新增 [calculations.ts](src/utils/calculations.ts) `formatAmount()`(= formatNTD 的整數化千分位但不帶符號,
  `maximumFractionDigits: 0`)。**注意**:別用現成 `formatNumber`(未整數化,會跑出 `+2,719,608.2` 小數)。
  正負號(+/−)與隱藏金額(`• • •`)邏輯不變。
- **維護規則重申**:此三欄的文字一律用 rem/clamp(要隨字體放大);裝飾/固定間距(如那個 10px padding)
  才用 px。改此區版面時 `metricsGridCols` 與 `STAT_VALUE_FONT_BY_SCALE` 要一起想「手機減欄 vs 桌機 3 欄」兩種寬度。
- 已在 preview 實測(mobile 375 標準/大/特大、desktop/768 3 欄)並用 span 量測防截字;tsc + 83 tests 通過。
- **附帶**:`.claude/launch.json` dev server 固定 5174 加 `--strictPort`(埠被佔用直接報錯、不靜默漂移)。

### 2026-08-11:匯入持倉支援配股（股票股利）（branch `feature/import-stock-dividend`）

**需求**：股票股利（配股）是免費取得的股票，沒有均價/總成本，只有獲配股數。匯入持倉時要能只填股數。

- **資料模型**（[types/index.ts](src/types/index.ts)）：`BuyTransaction` 加選用 `stockDividend?: boolean`。
  配股 = `price:0, fee:0, imported:true, stockDividend:true` 的買入。**沿用現有計算不用改**：
  `calcAvgCost` 把 0 成本股數攤進分母 → **均價自動攤低**；`calcTotalInvested` +0；`calcRemainingShares` +N。
  （實測：006208 原 9774股@86.35，登記 1000 配股 → 10774股@78.34，總成本不變。）
- **新增**（[AddTransactionSheet.tsx](src/components/AddTransactionSheet.tsx)）：匯入持倉分頁，股票選擇下方加
  checkbox「此為配股（股票股利）」（`isStockDividend`）。勾選後：banner 換文案、日期→「配股基準日」、
  **隱藏均價/總成本、只留「獲配股數」單欄**、試算顯示「取得成本 $0」、按鈕→「確認登記配股」。
  `priceN` 在配股時固定 0；送出/disabled guard 放寬成「只需股數+日期」。離開分頁自動 reset 勾選。
- **編輯**（[EditTransactionModal.tsx](src/components/EditTransactionModal.tsx)）：**必須同步處理，否則配股 price=0
  會被 `!priceN` guard 擋住無法編輯、且存檔會掉旗標**。偵測 `isDividendTx`、只編輯獲配股數、guard 放寬、
  存檔保留 `stockDividend:true`。
- **顯示配股標示**（琥珀「配」badge、「配股 +N 股」、「免費配股」）：[ActivityView.tsx](src/components/ActivityView.tsx)
  交易明細列 + `TradeTileRow`；[HomeView.tsx](src/components/HomeView.tsx) 最近交易 `RecentItem`。
  判斷順序 `isDividend` 先於 `isImported`（配股也帶 imported）。列表 map 要多帶 `stockDividend` 欄位。
- **匯入驗證**（[validateImport.ts](src/utils/validateImport.ts)）：`parseBuy` 逐欄驗證 `stockDividend`（非 boolean 拒絕）。
  **維護規則**：此欄與資料模型/顯示需同步。
- 測試 83→86（validateImport 配股往返 + 拒絕、calcAvgCost 配股攤低均價）。
- **UI 小字**：匯入試算兩行提示（一般匯入「後續新增的買賣交易…」＋配股「配股免費取得…」）由
  `text-[0.625rem]` 改 `text-xs`（rem，隨字體設定放大）。
- 已在 mobile viewport 端到端實測：勾選切換、欄位隱藏/改名、試算、送出攤低均價、首頁/明細配股標示；tsc + 86 tests 通過。

### 2026-08-11(續):Toast 優化 — 刪除可復原（Undo）+ 主題感知玻璃質感（branch `feature/toast-undo-ios`）

刪除交易/股息容易誤刪且沒有救回機制；toast 樣式也想更 iOS。

- **Undo 復原**（[App.tsx](src/App.tsx)）：`showToast` 加選用第三參數 `action?: { label, onClick }`；
  有 action 的 toast 停留 6 秒（無 action 3 秒）。新增 `dismissToast(id)` 供動作點擊後立即關閉。
  `handleDeleteTx` / `handleDeleteDividend` 刪除前先存 `prevStocks` 快照，toast 帶「復原」按鈕，
  點擊 `update(prevStocks)` 還原（handleDeleteTx 連同 `selectedStockId` 一起還原，涵蓋「刪最後一筆→個股被移除→導航返回」的情況）。
- **主題感知玻璃**（[Toast.tsx](src/components/Toast.tsx)）：`ToastContainer` 收 `theme` prop
  （App 傳 `(previewTheme ?? settings.theme) ?? 'default'`，與 root `data-theme` 同源），
  `ToastItem` 依 `dark = theme==='dark'` 切換：
  - 深色主題 → 黑色玻璃 `bg-gray-900/70` + `backdrop-blur-2xl` + 白字 + 藍300 復原
  - 預設／中性色 → 白色玻璃 `bg-white/70` + `backdrop-blur-2xl` + 深字 + 藍600 復原
  - 成功=綠圈白勾、錯誤=紅圈白驚嘆（SVG 圖示，取代原本純文字 ✓/✕），復原鈕有 undo 箭頭圖示。
  - **維護規則**：新增主題時若非 dark 系，會自動走白玻璃分支；要另設樣式再擴充 `dark` 判斷。
- **驗證踩雷**：dev HMR 有時序差，改 `theme` prop 當下畫面可能還是舊樣式，**要硬重載**才準；
  toast 只存活 3~6 秒，用 MutationObserver 在出現瞬間攔 className 才驗得到（實測 dark theme = `bg-gray-900`）。
- tsc + 86 tests 通過（本次純 UI，無新增測試）。已實測：刪除→復原還原、dark=黑玻璃 / 預設=白玻璃。

### 2026-08-12:匯入失敗改用 error toast（統一成功/失敗回饋）（branch `feature/import-error-toast`）

匯入成功走頂端 toast，但失敗原本是 ProfileView 卡片內的內嵌紅字（位置不一致、不會自動消失）。改為統一。

- **[ProfileView.tsx](src/components/ProfileView.tsx)**：移除 `importError` state 與內嵌紅字 `<p>`；
  新增 prop `onImportError: (msg: string) => void`，`handleFileChange` 的 catch 改呼叫它。
- **[App.tsx](src/App.tsx)**：ProfileView 加 `onImportError={(msg) => showToast(msg, 'error')}`。
  這是**目前 app 唯一實際觸發 `'error'` 型 toast 的地方**（其餘 13 個都是 success）。
- error toast = 紅圈驚嘆玻璃，主題邏輯與 success 相同（深色→黑玻璃、預設/中性→白玻璃）。
- **驗證踩雷**：改 prop 期間 HMR 時序差會讓 ProfileView 短暫拿到 undefined `onImportError` 而 crash console，
  **硬重載即恢復**（非程式問題）。用 JS 塞壞 JSON 檔（DataTransfer + dispatch change）可觸發匯入失敗來測。
- tsc + 86 tests 通過。DOM 實測 error toast：白玻璃 + `bg-red-500` 圈 + 正確訊息。

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

### ~~已公告但未除息的 ETF 配息不會出現在建議清單~~(2026-07-04 診斷 → 2026-07-31 已修)

- **現象**:使用者反應新增股息時看不到 006208 已公告的 2026 年配息(4.75,除息 7/16)。
- **原因**:上市 ETF 股息來自 TWSE `etfDiv` API(`src/utils/fetchDividends.ts` 瀏覽器直查)。
  公告初期該 API 的「收益分配金額」欄位是 `null`(約除息日前後才補上),
  解析器遇到金額 NaN 會整列跳過。Yahoo 備援只有歷史除息日,也幫不上。
- **✅ 已修(2026-07-31)**:金額 null 的列改為保留並標記 `cashPerShare: null`(待公告),
  建議清單顯示「金額尚未公告·點此帶入日期」讓使用者自填;同時過濾髒年份。詳見上方 2026-07-31 條目。
- **快速確認法**:`curl "https://www.twse.com.tw/rwd/zh/ETF/etfDiv?stkNo=<代號>&startDate=<YYYYMM01>&endDate=<YYYYMM01>&response=json"` 看金額欄。

## 維護規則(改壞會靜默出事的地方)

- **CSP 白名單**:前端要連任何新的外部網域,必須同步加進 `vercel.json` 的
  `Content-Security-Policy`,否則該功能上線後會被瀏覽器擋掉。
- **股號 regex**:`^[0-9]{4,6}[A-Z]?[0-9]?$`(在 `api/*.ts` 三處)。
  不要「簡化」成 `^[0-9]{4,6}[A-Z]?$` —— 那會拒絕真實特別股股號如 `2887Z1`。
- **匯入格式**:改 `src/types/index.ts` 的資料模型時,記得同步
  `src/utils/validateImport.ts` 與其測試,否則使用者匯入新格式備份會失敗。
