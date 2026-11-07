# Phase 7 Spec：收尾（Hardening、部署、E2E）

上游：`portal-spec.md` §11 P7（並引用 §5.2、§6、§8.1、§9）、`ui-spec.md` §5（Toast）、§8、§10、§11。預估 **1–1.25 日**（`portal-spec.md` 原估 0.75 日；補上 Playwright 基建、閒置登出的測試與 CSP 實測後上調）。依賴：P1–P6 全部完成。

**這是最後一個 phase，不加新頁面、不加新 backend 能力。** 目標：

1. 補齊 `portal-spec.md` §6 錯誤處理表的缺口（全域 `429` toast、error toast 規則），並逐行核對。
2. 閒置 30 分鐘自動登出。
3. 部署設定：`vercel.json`（SPA rewrite + 安全 headers + CSP）、`public/robots.txt`。
4. Playwright E2E（`portal-spec.md` §9 的 5 個場景）。
5. 全站文案 / 用詞 sweep、`ui-spec.md` §11 驗收清單走一遍。
6. 上線到 `https://portal.kaului.com`。

---

## 1. 前置條件

| 項目           | 要求                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1–P6 已完成   | `pnpm test`、`pnpm build` 全綠                                                                                                                          |
| 現有機制       | `sessionStore.logout({reason})` + `/login` 的 `logoutReason` 提示（P1）；`<Toast.Provider>` 位於 router 外（`app.tsx`）；`apiClient` 的 response interceptor |
| Backend 運行中 | `ADMIN_TOKEN` 已設；`ALLOWED_ORIGINS` 含 `http://localhost:5174`（E2E 用）                                                                             |
| 上線所需帳號   | Vercel（連 GitHub repo）、`kaului.com` DNS 管理權限、backend 部署與重啟權限（§9，**由使用者操作**）                                                     |
| 不需要         | 改 backend code；新頁面；深色模式；多語言；用戶列表 / by-target 舉報（`portal-spec.md` §10 缺口）                                                       |

---

## 2. 範圍

**做**

- 全域 `429` toast；error toast 統一規則（§3）。
- 閒置自動登出（§4）。
- `vercel.json`、`public/robots.txt`（§5）。
- Playwright 基建與 5 個場景（§6）。
- 錯誤處理表核對、文案 / 用詞 sweep、UI 驗收清單（§7）。
- 部署 runbook（§9）。

**不做**：見 §13。

---

## 3. Toast 規則（§6 錯誤處理表的補漏）

### 3.1 `401` @ 已登入：維持現狀，**不加 toast**

`portal-spec.md` §6 寫「toast『登入已失效』」，但 P1 已實作為「清除 session → 導向 `/login` → 登入頁顯示一次性提示（`login.expired`）」。兩者同時存在會重複通知。

**決定**：以現有的登入頁提示為準（已有測試，且使用者落在登入頁時一定看得到），§6 該行視為已滿足；於 §7.1 核對表註明。

### 3.2 全域 `429` toast

`api/client.ts` 的 response interceptor：`apiError.status === 429` 且 `!config?.skipAuthRedirect`（登入探測自有倒數 UI，不重複）時呼叫 `notifyRateLimited(apiError)`。

```ts
// src/api/notifyRateLimited.ts
export function notifyRateLimited(error: ApiError): void;
```

- 文案 `common.rateLimitedToast`：「請求太頻繁，請於 {n} 秒後再試」，`n = error.retryAfter ?? 60`。
- 樣式 `toast.danger`，`timeout = n * 1000`（**此為「error toast 不自動消失」的明文例外**：限流有自然到期，過期後仍掛著會誤導）。
- **去重**：模組級 `suppressedUntil = Date.now() + n * 1000`；在此之前再收到 `429` 不再出 toast。目的：Health 每 15 秒輪詢遇 `429` 時不洗版（P6 §5.4 把全域 toast 留給本 phase）。
- 不放進 `sessionStore`；`notifyRateLimited` 為獨立檔，方便測試與以 `vi.mock` 隔離。
- 頁面原有的 `ErrorCard` 倒數 / stale 提示**保留**，toast 只是補充。

### 3.3 Error toast 不自動消失、最多疊 3 個

`ui-spec.md` §5 已定：成功 toast 4 秒消失；error toast 須手動關；同時最多 3 個。P4 把此規則留給本 phase。

- 新增 `src/lib/notify.ts`：`notifySuccess(message)`、`notifyError(message)`（`timeout: 0`）。非 component，一般 function 宣告。
- 把現有直接呼叫 `toast.success` / `toast.danger` 處（`ReportDetail/ActionCard.tsx`、`User/UserActions.tsx`，以 `grep -rn "toast\." src` 為準）改為經 `notify`；之後 component 內不得直接 import `toast`（`notifyRateLimited` 除外，它是 `notify` 以外唯一允許者）。
- `Toast.Provider` 的最大同時顯示數：先查 HeroUI 3.2.7 的 `Toast.Provider` 是否有對應 prop（如 `maxVisibleToasts`）並設為 3；若無，保持現狀並於 PR 註明，不自行造輪子。
- 同一個 error toast 的 a11y：`role="alert"`（`ui-spec.md` §8）；實作若由 HeroUI 提供則只驗證，不重造。

---

## 4. 閒置自動登出

`portal-spec.md` §5.2 標「MVP 可選」，因 `ADMIN_TOKEN` 是萬能憑證且 portal 為公開網址，**本 phase 納入**。

### 4.1 行為

`src/hooks/useIdleLogout.ts`（`export function useIdleLogout()`），掛在 `AdminShell`（只有登入後才會 mount）。

```ts
export const IDLE_LOGOUT_MS = 30 * 60 * 1000;
```

1. **活動事件**（掛在 `document`，`{passive: true}`）：`pointerdown`、`keydown`、`wheel`、`touchstart`。每次只更新 `lastActivityRef = Date.now()`，不 setState、不重設計時器（零成本）。
2. **檢查**：`setInterval` 每 30 秒比對 `Date.now() - lastActivityRef.current >= IDLE_LOGOUT_MS`，成立即 `sessionStore.getState().logout({reason: "idle"})`。
3. **回前景立即檢查**：`visibilitychange` 變為可見時馬上檢查一次（背景分頁的 timer 會被瀏覽器節流、筆電睡眠後 timer 也不準，因此用**時間戳比對**而非單一 `setTimeout(30min)`）。
4. **Health 輪詢不算活動**（它是程式發的請求，不是人）；也就是不在 `apiClient` 層刷新 `lastActivity`。
5. unmount 清除 interval 與所有監聽；登出後 hook 隨 `AdminShell` unmount，不會殘留。
6. 不跨分頁同步（token 在 `sessionStorage`，本就每個分頁各自獨立）。

### 4.2 登入頁提示

- `sessionStore`：`logoutReason` 型別由 `"expired" | null` 擴為 `"expired" | "idle" | null`；`logout(options?: {reason?: "expired" | "idle"})`。
- `/login`：`showExpired` 改為依 `logoutReason` 決定文案：`expired` → `login.expired`（既有）；`idle` → `login.idleLoggedOut`「因閒置超過 30 分鐘，已自動登出」。同樣只顯示一次、讀取後 `clearLogoutReason()`。
- 重新登入後導回原頁（既有 `redirect` 機制）；閒置登出時 `RequireAuth` 已保留 `pathname + search`，**不需要額外處理**。

---

## 5. 部署檔案

### 5.1 `vercel.json`（repo 根目錄）

內容以 `portal-spec.md` §8.1 為準（`rewrites` + 5 個安全 headers + CSP），**逐字採用**，僅在下列情況調整：

- `img-src`：先以 `seedReports.sh` / 真實 backend 的資料確認 evidence 圖片與 avatar 實際用到的 host（`IMG_URL_PREFIX`、`avatar_url`）；有其他 host 就補進 `img-src`，並在 PR 說明來源。
- `style-src 'unsafe-inline'`：先保留；部署後若移除不影響畫面（HeroUI / Tailwind 的 runtime style），則移除並註明。**不得**為了省事加 `script-src 'unsafe-inline'` 或 `'unsafe-eval'`——Vite build 產物為外部 script，不需要。
- 不新增任何第三方 host 到 `connect-src`；只有 `'self'` 與 `https://api.kaului.com`。

### 5.2 `public/robots.txt`

```
User-agent: *
Disallow: /
```

（`public/` 目前不存在，需新建；Vite 會原樣複製到 `dist/`。）

### 5.3 設定檔自動檢查

`src/test/vercelConfig.test.ts`（Vitest，讀取根目錄 `vercel.json`）：

- JSON 可解析；有 SPA rewrite（`/(.*)` → `/index.html`）。
- 全部 5 個 headers 存在且 key / value 與 §8.1 一致。
- CSP 含 `default-src 'self'`、`frame-ancestors 'none'`、`connect-src` 含 `https://api.kaului.com`；**不含** `'unsafe-eval'`、`script-src` 內不含 `'unsafe-inline'`。
- `public/robots.txt` 含 `Disallow: /`。

目的：防止日後有人改壞或順手放寬安全 headers 而無人發現。

---

## 6. Playwright E2E

### 6.1 基建

- 新增 devDependency `@playwright/test`（版本照現有慣例**固定版本、不加 `^`**）；`pnpm e2e` = `playwright test`；`playwright.config.ts` 放根目錄。
- 檔案放 `e2e/`，命名 `*.e2e.ts`；`playwright.config.ts` 的 `testMatch: "**/*.e2e.ts"`。
- **Vitest 必須排除 `e2e/`**（`vite.config.ts` 的 `test.exclude` 加 `"e2e/**"`），否則 `pnpm test` 會嘗試跑 Playwright 檔。`pnpm test` 不得依賴 backend。
- `webServer`：`pnpm dev`（port 5174，`reuseExistingServer: true`）。
- `workers: 1`、`fullyParallel: false`：場景有順序依賴且共用同一個 backend / 同一 IP 限流額度。
- 環境變數（不入 repo；`.env.example` 加註解或於 `e2e/README` 說明）：
    - `E2E_API_BASE`（預設 `http://localhost:8080`）
    - `E2E_ADMIN_TOKEN`（與 backend `ADMIN_TOKEN` 相同）
- 缺 `E2E_ADMIN_TOKEN` 時 `globalSetup` 直接 throw 並印出說明，不要跑到一半才失敗。
- `.gitignore` 加 `playwright-report/`、`test-results/`。
- token **只經環境變數與 `page.fill` 輸入**，不寫進任何檔案、不出現在 trace / screenshot 以外的 log（trace 若含登入畫面，CI 上傳 artifact 前須確認不含真 token；本 phase 只跑本機，不接 CI）。

### 6.2 Seed helper（`e2e/seed.ts`）

- 以 `fetch` 呼叫 backend：`POST /auth/device` 建立 reporter 與 target 兩個帳號（取得各自 token / id）；`POST /v1/reports` 以 reporter token 建立舉報（可參考 `scripts/seedReports.sh` 的請求形狀）。
- 每個場景自建資料（唯一 suffix），不依賴上一個場景留下的 report；但**帳號可重用**。
- helper 只負責 seed，不負責清理（backend 無刪除 API）；README 註明 E2E 會在 DB 留下測試資料，**只可對本機 / staging 跑，不可對 production**（`globalSetup` 檢查 `E2E_API_BASE` 不含 `api.kaului.com`，是則拒絕執行）。

### 6.3 場景（對應 `portal-spec.md` §9）

| #   | 場景                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 登入：未登入開 `/reports` 被導向 `/login?redirect=…`；輸入正確 token → 回到 `/reports`；重新整理仍維持登入；登出後回 `/login`                                                   |
| 2   | Dismiss：seed 一筆 open report → 隊列看到 → 開詳情看到 evidence → dismiss（含確認）→ 返回隊列、該筆消失                                                                          |
| 3   | Ban：再 seed 一筆 → 詳情 ban（modal 確認）→ target 為 `banned`、其 open report 全數 `actioned`；以 target token 打 `GET /v1/me` 得 `403 ACCOUNT_BANNED`（用 helper `fetch`）     |
| 4   | Unban：開 `/users/:target` → unban（modal 確認，含「不會恢復」提示）→ chip 變 `active`                                                                                         |
| 5   | 限流（**必須最後執行**）：以錯誤 token 連續登入嘗試 11 次 → 第 11 次起出現 `429` 倒數且按鈕停用；其後輸入正確 token 仍被拒                                                       |

- 場景 5 會讓該 IP 被鎖約 1 分鐘（見 `portal-spec.md` §2.1）。以 `test.describe.serial` 保證順序；README 註明跑完 E2E 後約 1 分鐘內不要手動登入。
- 場景 5 同時順帶驗證 §3.2：`429` 倒數出現於登入頁，**不應**另外彈出全域 toast（登入探測已排除）。
- 選擇器優先用 role / label（`getByRole`、`getByLabel`），因 component 內零硬編碼中文，測試可直接 import `i18n` 字串比對，避免文案改動時散落字面量。
- 不用固定 `waitForTimeout`；一律等條件（`expect(...).toBeVisible()`）。

---

## 7. 核對與 sweep

### 7.1 `portal-spec.md` §6 錯誤處理表核對

逐行填入「實作位置」與「驗證方式」；缺的補測試或補實作。預期結果（實作時以實際為準，**不符就修**）：

| §6 情況                           | 預期實作位置                              | 驗證                              |
| --------------------------------- | ----------------------------------------- | --------------------------------- |
| `404` @ login 探測                | `pages/Login`                             | `Login.test.tsx`                  |
| `401` @ login                     | `pages/Login`                             | `Login.test.tsx`                  |
| `401` @ 已登入                    | `api/client.ts` → 登入頁提示（見 §3.1）   | `client.test.ts`、`Login.test.tsx` |
| `429`                             | `ErrorCard` 倒數、login 停用、**全域 toast（§3.2）** | 各頁測試、`notifyRateLimited.test.ts` |
| `400` `details.field = note`      | `NoteField` / ActionCard                  | `NoteField.test.tsx`              |
| `404` @ `/reports/{id}`           | `pages/ReportDetail`                      | 該頁測試                          |
| `404` @ `/users/{id}`             | `pages/User`                              | `User.test.tsx`                   |
| `404` @ ban / unban               | ActionCard / UserActions                  | 該二者測試                        |
| `5xx` / 網絡錯誤                  | `ErrorCard`（含 `X-Request-Id` + 重試）   | `ErrorCard.test.tsx` + 各頁       |

同時核對 `ui-spec.md` §5 的狀態規則：每個 async 區塊有 loading / empty / error 三態。

### 7.2 文案與用詞 sweep

- `grep -rnP "[\x{4e00}-\x{9fff}]" src --include=*.tsx --include=*.ts` 排除 `src/i18n/`、`*.test.*` 後，**不得有結果**（「—」「⚠」不屬此範圍）。
- 用詞統一（`ui-spec.md` §10）：UI 可見文字不得出現 `ban` / `unban` / `dismiss` 作為動詞字眼（backend 欄位名、`kind` 等除外）；一律「封鎖 / 解除封鎖 / 駁回」。
- 所有新增文案走 `i18n/zhHant.ts`（§8），不留 TODO 字串；移除不再使用的 key（`pages.*` 若已無使用者則整個移除）。

### 7.3 `ui-spec.md` §11 清單

整份驗收清單（視覺一致、互動、內容安全、無障礙 / 響應式、Repo）實際走一遍，結果寫在 PR 描述；不通過者修掉，不得留「之後再修」。重點抽查：

- 純鍵盤完成：登入 → 開舉報 → 駁回 / 封鎖（含 modal）。
- 1280 / 1024 / 768 / 375 寬度無橫向爆版（表格內捲動除外）。
- Icon-only 按鈕全部有 `aria-label`。
- 路由切換後 focus 移到頁標題（`ui-spec.md` §5）；若某頁漏做，在此補。

---

## 8. i18n 文案

`i18n/zhHant.ts`（繁體書面語）：

```ts
common: {
    // …既有
    rateLimitedToast: "請求太頻繁，請於 {n} 秒後再試",
},
login: {
    // …既有
    idleLoggedOut: "因閒置超過 30 分鐘，已自動登出",
},
```

- 若 `common` / `login` 內既有 key 命名風格不同，照既有風格，不為此重構。
- 「30 分鐘」寫死在文案裡；若日後 `IDLE_LOGOUT_MS` 改動須同步（於常數旁加註解）。

---

## 9. 部署 runbook（使用者操作，非自動）

> 對外動作：以下步驟會影響公開網址與 production backend，**實作者只準備好檔案與步驟，不代為執行**；每一步須使用者確認。

1. **Vercel**：連接 GitHub repo；Framework preset = Vite；Build `pnpm build`；Output `dist`；Production branch `main`。
2. **環境變數**：`VITE_API_BASE=https://api.kaului.com`（Production）。`ADMIN_TOKEN` **不得**放進 Vercel。修改後須 redeploy（build time 內嵌）。
3. **Domain**：Vercel 加 `portal.kaului.com`；DNS 加 `CNAME portal → cname.vercel-dns.com`（或 Vercel 指示的值）；等憑證簽發。
4. **Backend**：`ALLOWED_ORIGINS` 加 `https://portal.kaului.com`（保留 localhost 條目與否由使用者決定），**重啟 backend**。
5. **外層保護**：上線前於 Vercel dashboard 確認 Deployment Protection / Firewall 可用範圍（視方案）；如有可用且合適的規則再決定是否啟用。這是可選強化，不阻擋上線。
6. Preview（`*.vercel.app`）不在 allow-list 內，連不到 backend 屬預期；不要為了 preview 去放寬 `ALLOWED_ORIGINS`。

---

## 10. 安全要求

- `vercel.json` 的 CSP 與 §5.3 測試不得被放寬（`'unsafe-eval'`、`script-src 'unsafe-inline'`、萬用 `*` host 皆禁止）。
- E2E 與 seed helper：token 只來自環境變數；拒絕對 production API 執行（§6.2）。
- 閒置登出必須**清除 `sessionStorage` 的 token**（走既有 `logout()`），不是只導向 `/login`。
- `notifyRateLimited` 與所有 toast 文案**不得**帶入 token、完整 error 物件、`X-Request-Id` 以外的 header。
- 不 `console.log` token、回應、完整 error 物件。
- `robots.txt` 只是雙重保險，不是保護機制；真正保護仍是 `ADMIN_TOKEN` + backend per-IP 失敗限流。

---

## 11. 測試（Vitest + RTL；E2E 見 §6）

| 範圍                       | 案例                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `notifyRateLimited`        | 首次 `429` 出 toast，文案帶 `retryAfter`；缺 `Retry-After` 用 60；去重窗口內再呼叫不出第二個；窗口過後（fake timers）可再出                                                                 |
| `client` interceptor       | `429` 非探測 → 呼叫 `notifyRateLimited`；`429` 帶 `skipAuthRedirect`（登入探測）→ **不**呼叫；其他狀態不呼叫；既有 `401` 行為不變                                                           |
| `notify`                   | `notifyError` 以 `timeout: 0` 呼叫；`notifySuccess` 用預設逾時                                                                                                                             |
| `useIdleLogout`            | 29 分 59 秒無活動 → 不登出；30 分鐘 → `logout({reason:"idle"})`；中途 `pointerdown` / `keydown` 重新計時；`visibilitychange` 回前景時超時 → 立即登出；unmount 後無 timer / 監聽殘留          |
| `sessionStore`             | `logout({reason:"idle"})` 設定 reason 並清除 storage                                                                                                                                       |
| `Login`                    | `idle` reason → 顯示 `login.idleLoggedOut` 一次後清除；`expired` 既有行為不變                                                                                                              |
| `AdminShell`               | 掛載後有 idle 偵測（以 fake timers 驗證超時登出並導向 `/login`）                                                                                                                           |
| `vercelConfig`             | 見 §5.3                                                                                                                                                                                    |
| 回歸                       | P1–P6 既有測試全綠；`ActionCard` / `UserActions` 改走 `notify` 後原有 toast 斷言仍通過（必要時更新 mock 目標）                                                                              |

---

## 12. 驗收標準（Definition of Done）

**自動**

- [ ] `pnpm test` 全綠（含 P1–P6 既有測試；不需要 backend）。
- [ ] `pnpm build` 成功，`dist/` 內有 `robots.txt`。
- [ ] `pnpm e2e`（對本機 backend）5 個場景全數通過。
- [ ] `pnpm format` 後 `git diff` 無格式變動（留意會掃 `design/`，如有變動須還原）。
- [ ] §7.2 的 grep：component 內無硬編碼中文。

**手動（本機）**

- [ ] `429`：登入頁連錯至被鎖 → 倒數與停用按鈕仍在，**無**重複 toast；已登入後以 DevTools 製造 `429` 回應（Local Overrides）→ 出現一個 toast，短時間內不再疊第二個。
- [ ] Error toast（如 ban 時 `404`）不自動消失、可手動關；成功 toast 4 秒後消失；連續觸發多個時最多同時顯示 3 個（若 HeroUI 無此選項，PR 註明）。
- [ ] 閒置登出：暫時把 `IDLE_LOGOUT_MS` 改為 1 分鐘驗證 → 無操作 1 分鐘後被導向 `/login` 並顯示「因閒置…」、`sessionStorage` 已無 token；**驗證完務必改回 30 分鐘**（PR diff 中不得留下測試值）。
- [ ] 停在 `/health`（持續自動輪詢）時，閒置計時**不被輪詢重設**，仍會登出。

**手動（上線後，`https://portal.kaului.com`）**

- [ ] 登入成功；evidence 圖片與 avatar 於 CSP 下正常顯示；API 呼叫正常；DevTools console **無** CSP 違規報錯。
- [ ] 深層連結（如 `/reports/<id>`）重新整理不 404。
- [ ] `curl -I https://portal.kaului.com/` 見到 `portal-spec.md` §8.1 的全部 headers（CSP、`Referrer-Policy`、`X-Frame-Options`、`X-Content-Type-Options`、`X-Robots-Tag`）；`/robots.txt` 回 `Disallow: /`。
- [ ] 從非允許 origin（如 `*.vercel.app` preview）無法呼叫 backend（預期行為，確認 `ALLOWED_ORIGINS` 沒被放太寬）。
- [ ] Token 不在 URL / `localStorage` / cookie；Network 中只有預期的 `/v1/admin/*` 請求。

**Repo**

- [ ] `git status` 只見預期檔案（§14）。
- [ ] `ui-spec.md` §11 清單結果已記於 PR 描述；`portal-spec.md` §6 核對表已填。

---

## 13. 風險與處理

| 風險                                                  | 徵兆                                              | 處理                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| CSP 擋掉 evidence 圖片 / avatar                       | 上線後圖片全破、console 報 `img-src` 違規          | §5.1 先查實際 host；上線驗收明列；只補具體 host，不用 `*`                                      |
| CSP 擋掉 HeroUI / Tailwind inline style               | 上線後版面崩壞                                    | 保留 `style-src 'unsafe-inline'`（§5.1），日後再試移除                                         |
| 本地無法驗證 `vercel.json` headers                    | `vite dev` / `preview` 不套用 headers              | §5.3 的設定檔測試把關結構；真實效果以上線後 `curl -I` + console 驗收                           |
| E2E 場景 5 鎖住 IP，影響後續手動測試或場景             | 場景 5 之後登入全 `429`                           | `describe.serial` 且排最後；README 註明約 1 分鐘冷卻                                           |
| E2E 誤打 production                                   | production DB 出現測試帳號 / 舉報、IP 被鎖         | `globalSetup` 拒絕 `api.kaului.com`（§6.2）                                                    |
| `pnpm test` 誤跑到 Playwright 檔                      | Vitest 報錯或卡住                                 | `e2e/**` 加入 `test.exclude`；副檔名 `*.e2e.ts`（§6.1）                                         |
| Health 輪詢被當成使用者活動                           | 停在 `/health` 的 admin 永不閒置登出               | 活動只來自 DOM 事件，不在 `apiClient` 層刷新（§4.1 第 4 點）；專屬手動驗收                      |
| 背景分頁 timer 被節流，閒置登出延遲                   | 回前景才登出或延後數分鐘                          | 時間戳比對 + `visibilitychange` 立即檢查（§4.1）                                               |
| `429` toast 洗版                                      | Health 輪詢遇限流每 15 秒彈一次                   | 去重窗口 = `Retry-After`（§3.2）；專屬測試                                                     |
| 同時存在 `401` toast 與登入頁提示                     | 使用者看到兩次「登入已失效」                      | 決定不加 toast（§3.1）                                                                         |
| 閒置驗證用的 1 分鐘常數被 commit                      | 正式環境 1 分鐘就登出                             | 驗收項要求改回；`useIdleLogout` 測試以常數 `IDLE_LOGOUT_MS` 斷言為 30 分鐘                     |
| 放寬 `ALLOWED_ORIGINS` 為了 preview                   | 任意 `*.vercel.app` 可打 admin API                | §9 第 6 點明文禁止                                                                             |

---

## 14. 交付物（預期變動檔案）

```
新增
  vercel.json
  public/robots.txt
  playwright.config.ts
  e2e/README.md
  e2e/globalSetup.ts
  e2e/seed.ts
  e2e/portal.e2e.ts
  src/api/notifyRateLimited.ts(+ .test.ts)
  src/lib/notify.ts(+ .test.ts)
  src/hooks/useIdleLogout.ts(+ .test.tsx)
  src/test/vercelConfig.test.ts
修改
  src/api/client.ts                          # 429 → notifyRateLimited（排除 skipAuthRedirect）
  src/api/client.test.ts
  src/session/sessionStore.ts(+ .test.ts)    # reason 加 "idle"
  src/pages/Login/index.tsx(+ .test.tsx)     # idle 提示
  src/components/AdminShell.tsx              # 掛 useIdleLogout
  src/pages/ReportDetail/ActionCard.tsx      # toast → notify
  src/pages/User/UserActions.tsx             # toast → notify
  src/app.tsx                                # Toast.Provider 最大顯示數（若支援）
  src/i18n/zhHant.ts                         # §8
  vite.config.ts                             # test.exclude e2e/**
  package.json / pnpm-lock.yaml              # + @playwright/test、e2e script
  .gitignore                                 # playwright-report/、test-results/
  specs/portal-spec.md                       # §6 核對結果（如與實作有出入則同步更正）
```

---

## 15. 不屬於本 phase

- Backend 缺口：用戶列表、by-target 舉報、`admin_actions` 瀏覽、個人化審計、`openapi-admin.json`（`portal-spec.md` §10）。
- CI 流程（GitHub Actions 跑 `pnpm test` / `pnpm e2e`）、E2E 對 staging / production 運行。
- 深色模式、多語言切換、手機專屬版面、品牌 logo / favicon（`ui-spec.md` §12）。
- 閒置時長可設定、閒置前倒數警告 modal（MVP 固定 30 分鐘、直接登出）。
- 跨分頁同步登出。
- 錯誤監控 / 上報服務（Sentry 等）。
- Vercel Firewall / Deployment Protection 的實際啟用（§9 第 5 點只要求確認，不要求啟用）。
