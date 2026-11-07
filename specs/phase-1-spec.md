# Phase 1 Spec:骨架 + 登入

上游:`portal-spec.md` §11 P1(並引用 §4.2、§5、§5.1、§5.2、§6、§8)。預估 **0.75 日**。依賴:P0(backend `ADMIN_TOKEN`、CORS、seed 已就緒)。

**呢個 phase 係 portal 第一行前端 code。** 目標:

1. 專案可 `pnpm dev`(`5174`)、`pnpm build`、`pnpm test`、`pnpm format`。
2. 基建層(`ApiError`、axios client、手寫型別、session store、router、shell、i18n)一次過搭好,P2 起只加頁面同 endpoint。
3. `/login` 完整可用:真 backend 登入 / 登出,三種錯誤(404 / 401 / 429)分流清楚。
4. 其餘 route 暫時係空頁。

---

## 1. 前置條件

| 項目        | 要求                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------- |
| P0 已完成   | `backend/.env` 有 `ADMIN_TOKEN`、`ALLOWED_ORIGINS` 含 `http://localhost:5174`;backend 運行中 |
| Node + pnpm | 已安裝(`pnpm -v` 可用)                                                                       |
| Port        | portal `5174`,`--strictPort`;`5173` 留俾 PWA                                                 |
| 唔需要      | 改 backend code;Vercel 部署(屬 P7)                                                           |

---

## 2. 專案初始化

### 2.1 Scaffold 注意事項

`portal/` 已有 `.gitignore`、`scripts/`、`specs/`、`.seed.local.md`,**唔好**直接喺度 `create vite` 覆蓋。做法:

1. 喺 repo 外嘅空目錄 scaffold(Vite `react-ts` template),再將檔案複製入 `portal/`。
2. `.gitignore` **合併**而唔係覆蓋:保留 `.seed.local.md`、`.env.local`,補 `node_modules`、`dist`、`*.local`。
3. `App.tsx` 改名 `app.tsx`,`export default function App` 改為 `export const App`;`main.tsx` 對應改 import。

### 2.2 依賴

| 類別     | 套件                                                                                      |
| -------- | ----------------------------------------------------------------------------------------- |
| Runtime  | `react`、`react-dom`、`react-router`、`axios`、`zustand`、`@heroui/react`(+ 其 peer deps) |
| Styling  | `tailwindcss`(跟 HeroUI 當前安裝文件指定嘅版本同 plugin 設定)、`less`                     |
| Dev/Test | `vitest`、`@testing-library/react`、`@testing-library/user-event`、`jsdom`、`prettier`    |

- HeroUI 同 Tailwind 嘅 setup 步驟以官方文件為準(版本會變),唔好抄舊教學。
- **唔裝** ESLint 設定以外嘅額外 lint 流程;**唔裝**任何 PWA / SSE / push / IndexedDB 相關套件(`portal-spec.md` §5)。

### 2.3 指令(`package.json` scripts)

| 指令          | 內容                            |
| ------------- | ------------------------------- |
| `pnpm dev`    | `vite --port 5174 --strictPort` |
| `pnpm build`  | `vite build`                    |
| `pnpm test`   | `vitest run`                    |
| `pnpm format` | `prettier --write .`            |

`build` **唔**串 `tsc`(全局規範唔跑 type check);Vite 本身會用 esbuild strip 型別。

### 2.4 環境變數

- `.env.example`:`VITE_API_BASE=http://localhost:8080`(commit)。
- `.env.development`:同上(commit,唔含 secret)。
- `.env.local` 已喺 `.gitignore`。
- `VITE_API_BASE` 缺失 → 模組載入時即 `throw new Error('VITE_API_BASE is required')`(`api/client.ts` 頂層,唔好 fallback 預設值)。值**唔含** `/v1`,尾部 `/` 要 trim。

---

## 3. 目錄(本 phase 建立嘅部分)

```
src/
├─ main.tsx
├─ app.tsx
├─ router.tsx                    # 路由表 + RequireAuth
├─ api/
│  ├─ types.ts                   # portal-spec §3.2 全部型別
│  ├─ errors.ts                  # ApiError
│  ├─ client.ts                  # axios instance + interceptors
│  └─ endpoints/
│     └─ metrics.ts              # 只得 getMetrics(登入探測用)
├─ session/
│  └─ sessionStore.ts
├─ pages/
│  ├─ Login/index.tsx
│  ├─ Reports/index.tsx          # 空頁佔位
│  ├─ ReportDetail/index.tsx     # 空頁佔位
│  ├─ User/index.tsx             # 空頁佔位
│  └─ Health/index.tsx           # 空頁佔位
├─ components/
│  ├─ AdminShell.tsx
│  └─ RequireAuth.tsx
├─ i18n/
│  ├─ index.ts                   # t() + 文案取用
│  └─ zhHant.ts                  # 全部 UI 文案
└─ styles/
   └─ index.less
```

規範(`~/.claude/CLAUDE.md`):

- 每個 file 一個 component,`export const ComponentName`;Component 檔 TitleCase,非 Component 檔 camelCase。
- `React.useState` / `React.useEffect`,**唔解構**;用 `<React.Fragment>`,**唔用** `<>`。
- Component 內 function 用 arrow function,**唔包** `useCallback`;非 Component 嘅一般 function 用 `function xxx()`,匿名 callback 用 arrow。
- Custom hook 用 `export function useXxx`。
- `import React` 放第一行,`.less` import 放最後。
- Memo 用 `React.memo`(portal 冇 `ReactUtil`)。

---

## 4. 基建規格

### 4.1 `api/types.ts`

原樣抄 `portal-spec.md` §3.2 嘅全部型別(`ReportReason`、`ReportStatus`、`UserStatus`、`ReportItem`、`Evidence`、`EvidenceMessage`、`AdminUser`、`FailedJobItem`),另加:

```ts
interface Hist {
    count: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
}

interface AdminMetrics {
    server_now: number;
    uptime_secs: number;
    db: {write_wait_ms: Hist; sqlite_busy_total: number};
    jobs: {
        ready: number;
        locked: number;
        failed_total: number;
        oldest_ready_age_ms: number | null;
        latency_ms: Hist;
    };
    sse: {connections: number; evictions_total: number};
    http: {
        responses_5xx_total: number;
        rate_limited_total: Record<string, number>; // key 動態,唔寫死
    };
    events: {max_id: number};
}

interface ApiErrorBody {
    error: {code: string; message: string; details?: {field?: string} | null};
}
```

全部型別 `export`。型別手寫,同 backend 脫節風險已記入 `portal-spec.md` §10 第 6 項,此處唔處理。

### 4.2 `api/errors.ts`

```ts
export class ApiError extends Error {
    status: number | null; // null = 網絡錯 / 冇 response
    code: string | null; // error.code,例如 UNAUTHENTICATED
    details: {field?: string} | null;
    requestId: string | null; // X-Request-Id
    retryAfter: number | null; // 秒;讀 Retry-After header
}
```

- 只提供一個 `normalizeError(e: unknown): ApiError` function(非 arrow)。
- `retryAfter`:header 解成整數秒;缺失或非數字 → `null`(**唔**喺 `ApiError` 內塞 fallback,fallback 由 Login 決定,見 §5.3)。
- Response body 唔符 `ApiErrorBody` 形狀(例如 5xx 出 HTML / 空 body)→ `code = null`、`message` 用 `HTTP <status>`,**唔好** throw。
- 網絡錯(`error.response` 為空)→ `status = null`。
- `ApiError` 唔保留 request headers(避免 token 經 error 外洩,§5.2)。

### 4.3 `api/client.ts`

```ts
export const apiClient = axios.create({baseURL: `${VITE_API_BASE}/v1`});
```

- **Request interceptor**:由 `sessionStore.getState().token` 讀 token,有就加 `Authorization: Bearer <token>`。若 request config 已自帶 `Authorization`(登入探測),唔覆蓋。
- **Response interceptor**(error 分支):
    1. `normalizeError`。
    2. 若 `status === 401` **且** request 唔係登入探測(config 上標記 `skipAuthRedirect: true`)**且** store 有 token → `sessionStore.getState().logout({ reason: 'expired' })`,router 會因 `RequireAuth` 導向 `/login`。
    3. `throw` 正規化後嘅 `ApiError`。
- `404` 唔喺 interceptor 處理(要按 path 分辨,由各頁負責,`portal-spec.md` §5.1)。
- `429` 唔自動重試;全局 toast 留 P7。
- **唔做** retry、唔做 optimistic update。
- 絕不 `console.log` token、request headers 或完整 error 物件。

### 4.4 `api/endpoints/metrics.ts`

```ts
export function getMetrics(options?: {token?: string}): Promise<AdminMetrics>;
```

- `GET /admin/metrics`。
- 有 `options.token` → 以該 token 發 request(自帶 `Authorization`)並標 `skipAuthRedirect: true`,**唔讀** store。登入探測專用:token 未確認前唔入 store。
- 無 `options` → 用 store 內 token(P6 Health 會用)。

### 4.5 `session/sessionStore.ts`

`zustand` store,只放 session:

```ts
interface SessionState {
    token: string | null;
    logoutReason: "expired" | null; // 供 /login 顯示「登入已失效」
    login: (token: string) => Promise<void>; // 成功 resolve,失敗 throw ApiError
    logout: (options?: {reason?: "expired"}) => void;
}
```

行為:

- 初始化:由 `sessionStorage['kaului.portal.token']` 讀 token(**只**用 `sessionStorage`,**嚴禁** `localStorage` / IndexedDB / cookie / URL)。
- `login(token)`:`token.trim()` 後 call `getMetrics({ token })`;**`200` 先**寫入 store + `sessionStorage`;任何錯誤 re-throw `ApiError`,**唔寫** store / storage。
- `logout()`:清 store、`sessionStorage`;`reason: 'expired'` 時設 `logoutReason`。
- 成功 `login` 時清 `logoutReason`。
- 空字串 token:`login` 直接 throw(唔發 request,唔燒失敗額度)——UI 層亦會擋,呢度係第二道。

### 4.6 `router.tsx`

| Path           | Element                            |
| -------------- | ---------------------------------- |
| `/login`       | `Login`(已登入 → 導向 `/reports`)  |
| `/`            | `<Navigate to="/reports" replace>` |
| `/reports`     | `Reports`(佔位)                    |
| `/reports/:id` | `ReportDetail`(佔位)               |
| `/users/:id`   | `User`(佔位)                       |
| `/health`      | `Health`(佔位)                     |
| `*`            | 簡單 404 頁,附返 `/reports` 連結   |

- 除 `/login` 外全部包喺 `RequireAuth` + `AdminShell` 內。
- `RequireAuth`:冇 token → `<Navigate to="/login?redirect=<encoded path+search>" replace>`。
- **`redirect` 驗證**(防 open redirect):登入成功後只接受以單一 `/` 開頭、**唔係** `//` 或 `/\` 開頭、且唔係 `/login` 嘅站內 path;否則 fallback `/reports`。呢個驗證抽成 `function safeRedirect(raw: string | null): string`,可單獨測試。
- 佔位頁只顯示頁名(例如「舉報隊列(P2)」),方便驗證 routing。

### 4.7 `components/AdminShell.tsx`

- Header:左邊 logo / 名稱「Kaului Portal」+ 導覽連結(舉報、系統健康);右邊「user id 查詢框」+「登出」按鈕。
- **查詢框本 phase 只掛位**:渲染輸入框 + 按鈕,但 `isDisabled`,tooltip / placeholder 註明「P5 啟用」。P5 先接線。
- 「登出」:call `logout()`(非 expired),導向 `/login`。
- 內容區用 `<Outlet />`。
- 版面桌面優先,窄屏唔爛(header 可 wrap),**唔做**手機專門優化。

### 4.8 `i18n/`

- `zhHant.ts` 為單一文案物件(`as const`),`index.ts` 提供 `function t(key)`(型別安全 key,取值唔到就 throw,開發期即見到漏 key)。
- **本 phase 嘅所有 UI 文案**(登入頁、shell、佔位頁、404 頁)一開始就放入 `zhHant.ts`,**唔好**寫死喺 component。
- 文案語言:繁體書面語為主;沿用 `portal-spec.md` §4.2 已定嘅粵語提示字眼(例如「連唔到 server」)。

---

## 5. `/login`

### 5.1 版面

置中卡片:標題「Kaului Portal」、一個密碼欄(`type="password"`、`autocomplete="off"`、`name` 唔用 `password` 以免瀏覽器彈儲存密碼提示)、「登入」按鈕、錯誤提示區。

### 5.2 流程

1. 輸入 `trim()` 後為空 → 按鈕禁用(唔發 request)。
2. 送出:按鈕 loading + 禁用(防雙擊);call `sessionStore.login(token)`。
3. 成功 → 導向 `safeRedirect(searchParams.get('redirect'))`。
4. 失敗 → 按 §5.3 分流顯示;**輸入欄保留內容**(俾用戶改),但錯誤後唔自動 refocus 清空。
5. 若 `logoutReason === 'expired'` → 頁頂顯示 info 條「登入已失效,請重新登入」,用完即清。

### 5.3 錯誤分流

| 條件                         | 顯示                                           | 按鈕             |
| ---------------------------- | ---------------------------------------------- | ---------------- |
| `status = 404`               | 「後台未啟用(server 未設定 ADMIN_TOKEN)」      | 可再試           |
| `status = 401`               | 「Token 不正確」                               | 可再試           |
| `status = 429`               | 「嘗試次數過多,請 N 秒後再試」(N 倒數至 0)     | **倒數期間禁用** |
| `status = null`(網絡 / CORS) | 「連唔到 server」                              | 可再試           |
| 其他(`5xx` 等)               | 「伺服器錯誤,請稍後再試」+ 顯示 `X-Request-Id` | 可再試           |

- **`429` 倒數**:N = `retryAfter`;`null` 時 fallback `60` 秒(同 P0 風險表一致),並 `console.warn` 一次方便發現 header 冇 expose。倒數用 `setInterval(1000)`,unmount 時清除;歸零後錯誤提示消失、按鈕恢復。
- **連續失敗提示**:前端 component state 計數 `401` 失敗(`404` / 網絡錯唔計,因為唔會計入 backend 失敗限流);**第 5 次起**喺錯誤下加一行「同一 IP 每分鐘失敗 10 次會被鎖」。成功登入或元件 unmount 即重置。唔寫入任何 storage。
- 登入頁**唔洩漏多餘資訊**(portal 係公開網址):只顯示上表文案,唔顯示 backend 原始 `message` / `details`。
- 登入頁 Enter 鍵 = 送出。

---

## 6. 安全要求(本 phase 必須落實)

- Token 只存 `sessionStorage`;DevTools → Application 確認 `localStorage`、cookie、IndexedDB 全空,URL 冇 token。
- 輸入欄 `autocomplete="off"`;全 codebase 冇 `console.log(token)`;`ApiError` 唔帶 request headers。
- 背景唔會用舊 token 自動重試:本 phase 冇任何輪詢 / retry,`401` 已登入後即清 session(避免燒失敗額度)。
- 登出清 store + `sessionStorage`。
- 閒置 30 分鐘自動登出 **唔屬本 phase**(P7 可選)。
- `vercel.json` / CSP headers **唔屬本 phase**(P7);但 `index.html` 加 `<meta name="robots" content="noindex, nofollow">`。

---

## 7. 測試(Vitest + RTL,`jsdom` 環境)

| 範圍                 | 案例                                                                                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normalizeError`     | `401` + 標準 body → `code` / `message`;`400` + `details.field = 'note'`;`429` + `Retry-After: 30` → `retryAfter = 30`;`Retry-After` 缺失 → `null`;5xx HTML body → `code = null`;無 response → `status = null`;`X-Request-Id` 被保留 |
| `sessionStore`       | `login` 成功 → store + `sessionStorage` 有 token;`401` / `404` / `429` / 網絡錯 → throw 且**兩處都冇寫入**;空 token 唔發 request;`logout()` 清 `sessionStorage`;`logout({ reason: 'expired' })` 設 `logoutReason`                   |
| `client` interceptor | 已登入 + 非探測 request 回 `401` → 自動 `logout`;登入探測回 `401` → **唔** logout;有 token 時帶 `Authorization`                                                                                                                     |
| `safeRedirect`       | `/reports/abc?x=1` ✓;`null` → `/reports`;`//evil.com` ✗;`/\evil.com` ✗;`https://evil.com` ✗;`/login` ✗                                                                                                                              |
| `Login` page         | 空輸入按鈕禁用;四種錯誤文案正確;`429` 倒數期間按鈕禁用、歸零恢復(fake timers);第 5 次 `401` 先出「每分鐘失敗 10 次」提示;成功後導向 `redirect`                                                                                      |
| `RequireAuth`        | 無 token 訪問 `/reports/x` → 導向 `/login?redirect=%2Freports%2Fx`                                                                                                                                                                  |

HTTP 層 mock:用 axios adapter mock(或 MSW,二擇一,P2 起沿用同一個);fixture 形狀抄 `backend/tests/admin.rs`。

---

## 8. 驗收標準(Definition of Done)

全部要打剔:

**自動**

- [ ] `pnpm test` 全綠(§7 全部案例)。
- [ ] `pnpm build` 成功。
- [ ] `pnpm format` 後 `git diff` 冇格式變動。

**手動(對 P0 嘅真 backend)**

- [ ] `pnpm dev` 起喺 `5174`;`5174` 被佔用時直接報錯而唔係跳 port。
- [ ] 唔設 `ADMIN_TOKEN` 重啟 backend → 登入顯示「後台未啟用」(驗完設返)。
- [ ] 錯 token → 「Token 不正確」;第 5 次起出現鎖 IP 提示。
- [ ] 連試 11 次錯 token → 第 11 次起 `429` + 倒數、按鈕禁用;倒數期間用**啱** token 亦被拒(驗證 `portal-spec.md` §2.1);倒數完可恢復登入。
- [ ] 停咗 backend → 「連唔到 server」。
- [ ] 啱 token → 進入 `/reports`(佔位);refresh 後仍登入(`sessionStorage`);關 tab 再開 → 要重新登入。
- [ ] 未登入直接開 `/reports/xyz` → 導向 `/login?redirect=%2Freports%2Fxyz`,登入後返到原頁。
- [ ] `/login?redirect=//evil.com` 登入後落 `/reports`,唔會跳出站。
- [ ] 已登入時 backend 輪換 `ADMIN_TOKEN` 後任何 admin call → 清 session、跳 `/login`、顯示「登入已失效」(P1 只得 metrics call,可用 DevTools 手動 call 驗,或留 P6 一併驗)。
- [ ] 登出 → 回 `/login`,`sessionStorage` 已清。
- [ ] DevTools 確認 token 唔喺 `localStorage` / cookie / IndexedDB / URL。
- [ ] 所有可見文案來自 `i18n/zhHant.ts`(`grep` component 內冇硬編碼中文)。

**Repo**

- [ ] `git status` 只見預期新檔;`.env.local`、`.seed.local.md`、`node_modules`、`dist` 冇被 track;`ADMIN_TOKEN` 冇出現喺任何 tracked 檔案。

---

## 9. 風險與處理

| 風險                                            | 徵兆                          | 處理                                                                        |
| ----------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| Scaffold 覆蓋咗現有 `.gitignore` / `scripts/`   | `.seed.local.md` 突然被 track | 照 §2.1 喺外部目錄 scaffold 再複製;`git diff` 檢查 `.gitignore`             |
| CORS 擋咗 `Retry-After`                         | `429` 但 `retryAfter = null`  | Fallback 60 秒 + `console.warn`;回報 backend 補 `expose_headers`(P0 §2.2 D) |
| 驗證 `429` 時鎖咗自己 IP                        | 啱 token 都 `429`             | 等窗口過去;同一輪只做一次 11 連試                                           |
| HeroUI / Tailwind 版本改動令教學過時            | 樣式唔生效 / build 錯         | 以官方當前安裝文件為準,唔好抄舊 config                                      |
| `type="password"` 被瀏覽器 / 密碼管理員彈出儲存 | 彈窗要求儲存 token            | `autocomplete="off"`、`name` 避開 `password`;如仍彈,改 `new-password`       |
| 開發期 React StrictMode 令 effect 跑兩次        | 倒數 interval 重複            | effect 一律有 cleanup;倒數邏輯用單一 interval ref                           |
| 手寫型別同 backend 脫節                         | P2+ runtime 欄位 undefined    | 以 `backend/tests/admin.rs` fixture 為準;已記 `portal-spec.md` §10 #6       |

---

## 10. 唔屬於本 phase

- 任何列表 / 詳情 / 用戶 / health 頁嘅實際內容(P2–P6;本 phase 只佔位)。
- `reports.ts`、`users.ts`、`jobs.ts` endpoints(各自 phase 建立)。
- `StatusChip`、`ReasonChip`、`IdTag`、`TimeText`、`ConfirmModal`(P2 / P4)。
- 全局 `429` toast、`401` toast、閒置自動登出、`vercel.json`、`robots.txt`、E2E、Vercel 部署(P7)。
- User id 查詢框接線(P5)。
