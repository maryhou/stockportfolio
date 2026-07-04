# HANDOFF — WealthTrack 投資日誌

> 最後更新:2026-07-04。給下一個接手的人(或下一次 Claude session)的交接文件。
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

## 未完成 / 待辦

1. **手機實測登入**:CSP 上線後,建議用手機以真實 Google 帳號完整登入一次確認
   (自動化驗證已涵蓋載入與登入起手流程,但完整 OAuth 流程需要真人)。
2. **Vite 8 升級**(擱置):`npm audit` 剩 esbuild/vite 兩條,只影響本機 dev server,
   要升 Vite 8(breaking)才能清掉。
3. **CI Node 20 deprecation 警告**:GitHub Actions 提示 actions 該升 Node 24,尚未處理。

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
