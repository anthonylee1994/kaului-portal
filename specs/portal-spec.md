# Kaului Portal Spec

Kaului 嘅 admin 後台(web)。對接 `backend` repo 嘅 `/v1/admin/*`,供營運人員處理舉報、封鎖用戶、睇系統健康。

- 契約來源(以此為準):`backend/specs/phase-5-spec.md` §7(report / ban / admin)、§10(metrics);實作喺 `backend/src/admin/`
- **Admin API 刻意唔入 `openapi.json`**(`backend/specs/phase-6-spec.md` §1、§12 第 8 項),所以 portal **冇** `gen:api` 可用;型別要手寫(§5)
- 狀態:Draft v0.1

---

## 1. 目標與非目標

**目標**

1. 舉報隊列:列出 open report,睇 evidence snapshot,一鍵 dismiss 或 ban。
2. 用戶查詢:輸入 user id,睇狀態同舉報統計,ban / unban。
3. 系統健康:睇 metrics、dead-letter jobs。
4. 單人營運夠用:最少 click、唔會誤 ban。

**非目標(MVP)**

- 多 admin / 角色權限(backend 只有單一 `ADMIN_TOKEN`,Phase 5 §2 已定)。
- 用戶清單 / 搜尋、聊天全文瀏覽、`admin_actions` 審計紀錄瀏覽(backend 冇對應 endpoint,見 §10)。
- 被 ban 用戶申訴流程。
- 手機版優化(桌面瀏覽器優先,但版面唔好爛)。

---

## 2. 後端事實(portal 必須遵守)

### 2.1 驗證

| 項目               | 行為                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Header             | `Authorization: Bearer <ADMIN_TOKEN>`(≥ 32 字元;普通 user token 無效)                                                               |
| `ADMIN_TOKEN` 未設 | **所有** `/v1/admin/*` 回 `404 NOT_FOUND`(假裝 admin 唔存在)                                                                        |
| Token 錯           | `401 UNAUTHENTICATED`,並計入 per-IP 失敗限流                                                                                        |
| 失敗限流           | 同一 IP **1 分鐘內失敗第 11 次起**,之後所有 request(**連 token 啱嘅都係**)回 `429`,帶 `Retry-After`,直至窗口過去。成功 request 唔計 |
| 與 user API 關係   | 獨立 extractor,唔受 `api_limiter` 影響,唔會回 `403 ACCOUNT_BANNED`                                                                  |

所以 portal 登入畫面要分辨:`404` = 「後台未啟用」、`401` = 「Token 錯」、`429` = 「試太多次,等 N 秒」。**唔好**同一個「登入失敗」帶過。

### 2.2 通用格式

- Base:`{VITE_API_BASE}/v1`(本地 `http://localhost:8080/v1`,正式 `https://api.kaului.com/v1`)。
- 時間:epoch **毫秒**(`created_at`、`resolved_at`、`failed_at`、`last_active_at`、`server_now`)。
- ID:UUIDv7 字串;列表 keyset 分頁(`id DESC`)。
- 錯誤 body:`{ "error": { "code", "message", "details" } }`;欄位驗證錯 = `400 VALIDATION_FAILED` 且 `details.field` 指明欄位(admin 會見到 `note` / `limit` / `status` / `before`)。
- Request body 一律 `deny_unknown_fields`:**唔好**多送欄位。
- 回應帶 `X-Request-Id`(CORS 已 expose),錯誤畫面要顯示佢,方便對 server log。

### 2.3 CORS(必須先處理)

Phase 5 假設 admin 只俾 curl 用,所以冇為 admin 做 CORS 設計。但 CORS layer 係全域嘅(`ALLOWED_ORIGINS`),已 allow `Authorization` / `Content-Type` header 同 `GET/POST`,所以:

- **做法**:將 portal origin 加入 backend 嘅 `ALLOWED_ORIGINS`(逗號分隔,例如 `http://localhost:5173,http://localhost:5174,https://admin.kaului.com`)。**唔使改 backend code。**
- 注意 portal dev port **唔可以同 PWA 撞**(PWA 用 5173),portal 用 `5174` 並 `--strictPort`。
- 代價:PWA 同 portal 共用同一個 allow-list。可接受,因為真正嘅保護係 `ADMIN_TOKEN`,唔係 CORS。
- 備選(唔建議):portal 部署時做 same-origin reverse proxy 轉發 `/v1/admin/*`,免 CORS,但多一層部署。

---

## 3. Endpoints

全部需要 `AdminAuth`(§2.1)。

| Method | Path                                                       | 用途                               | 成功回應                                |
| ------ | ---------------------------------------------------------- | ---------------------------------- | --------------------------------------- |
| GET    | `/admin/reports?status=open\|all&before=<id>&limit=1..100` | 舉報列表(預設 `open`、`limit` 50)  | `200 { items: ReportItem[], has_more }` |
| GET    | `/admin/reports/{id}`                                      | 單個舉報,**含 `evidence`**         | `200 ReportItem`                        |
| POST   | `/admin/reports/{id}/dismiss`                              | 結案(唔處罰),body `{ note? }`      | `200 ReportItem`(最新狀態)              |
| POST   | `/admin/reports/{id}/ban`                                  | 由舉報 ban target,body `{ note? }` | `200 { status: "banned" }`              |
| GET    | `/admin/users/{id}`                                        | 用戶摘要                           | `200 AdminUser`;唔存在 `404`            |
| POST   | `/admin/users/{id}/ban`                                    | ban,body `{ note? }`               | `200 { status: "banned" }`              |
| POST   | `/admin/users/{id}/unban`                                  | 解封,body `{ note? }`              | `200 { status: "active" }`              |
| GET    | `/admin/jobs/failed?limit=1..100`                          | dead-letter jobs(預設 50)          | `200 { items: FailedJobItem[] }`        |
| GET    | `/admin/metrics`                                           | 系統快照                           | `200` JSON(§3.2)                        |

### 3.1 語意重點

- **列表唔帶 `evidence`**(`null` / 缺),要開 detail 先有。Portal 唔好喺列表度預期有證據。
- **`note`**:選填、trim、≤ 200 字元,超過 `400`(`details.field = "note"`)。UI 加字數計數,500ms 前就擋。
- **Idempotent**:
  - dismiss 已非 open 嘅 report → `200` 返現況,唔報錯。
  - ban 已 banned 嘅 user → `200`,唔寫審計。unban 非 banned → `200` no-op。
  - ban `deleted` 或唔存在嘅 user → `404`。
- **Ban 副作用**(UI 確認框要講清楚):對方所有 open match 被關閉(對方只見「match 冇咗」)、pending hello 靜默過期、push subscription 刪除、針對佢嘅**所有** open report 自動結案(`actioned`)、佢開住嘅 SSE 即斷。Reporter **唔會**收到通知。
- **Unban 唔恢復**:match / hello / push subscription 都唔返嚟,Title / profile 會自然返嚟。UI 要寫明。
- **Ban 局限**:帳號係 device-based,被 ban 者可以開新帳號。UI 唔好暗示「ban 咗就搞掂」。
- **`report/{id}/ban` vs `users/{id}/ban`**:前者審計記 `report.ban`(帶 report id),後者記 `ban`。喺舉報頁處理一律用前者。

### 3.2 資料形狀(手寫型別,放 `src/api/types.ts`)

```ts
type ReportReason =
  "spam" | "harassment" | "inappropriate" | "underage" | "other";
type ReportStatus = "open" | "dismissed" | "actioned";
type UserStatus = "active" | "banned" | "deleted";

interface ReportItem {
  id: string;
  reporter_id: string;
  target: { id: string; status: UserStatus; open_reports: number };
  reason: ReportReason;
  detail: string | null; // ≤ 500 字
  status: ReportStatus;
  created_at: number;
  resolved_at: number | null;
  evidence?: Evidence | null; // 只喺 GET /reports/{id};超過 90 日會被清成 null
}

interface Evidence {
  title: string | null; // target 舉報當刻嘅 active Title
  avatar_url: string | null;
  messages: EvidenceMessage[]; // reporter ↔ target 最近 20 則,新→舊;冇互動 = []
}

interface EvidenceMessage {
  id: string;
  sender_id: string;
  kind: "text" | "image";
  body: string | null;
  image_url: string | null;
  created_at: number;
}

interface AdminUser {
  id: string;
  status: UserStatus;
  created_at: number;
  last_active_at: number;
  inbox_count: number;
  open_reports: number;
  total_reports: number;
  has_active_title: boolean;
}

interface FailedJobItem {
  id: string;
  kind: string;
  attempts: number;
  last_error: string | null;
  failed_at: number;
}
```

`/admin/metrics` 回應(`backend/src/metrics.rs::snapshot`):

```jsonc
{
  "server_now": 0,
  "uptime_secs": 0,
  "db":   { "write_wait_ms": Hist, "sqlite_busy_total": 0 },
  "jobs": { "ready": 0, "locked": 0, "failed_total": 0,
            "oldest_ready_age_ms": null /* 或 number */, "latency_ms": Hist },
  "sse":  { "connections": 0, "evictions_total": 0 },
  "http": { "responses_5xx_total": 0,
            "rate_limited_total": { "api": 0, "admin_fail": 0 /* …其他 limiter 名 */ } },
  "events": { "max_id": 0 }
}
// Hist = { count, p50, p95, p99, max }(毫秒,percentile 係 bucket 上限)
```

`rate_limited_total` 嘅 key 集合由 backend `Limiter::ALL` 決定,portal **按 key 動態渲染**,唔好寫死。

---

## 4. 畫面

### 4.1 Routes

| Path           | 畫面                       |
| -------------- | -------------------------- |
| `/login`       | 輸入 Admin token           |
| `/`            | 重定向 `/reports`          |
| `/reports`     | 舉報隊列(tab:Open / All)   |
| `/reports/:id` | 舉報詳情 + evidence + 處理 |
| `/users/:id`   | 用戶摘要 + ban / unban     |
| `/health`      | Metrics + failed jobs      |

未登入訪問任何非 `/login` route → 重定向 `/login`(保留 `redirect`)。

### 4.2 `/login`

- 一個密碼欄(`type="password"`)+「登入」。
- 登入 = 用輸入嘅 token call `GET /admin/metrics`(最輕、唯一冇 path 參數嘅 GET)。`200` 先視為成功並存 token。
- 錯誤分流:`404` →「後台未啟用(server 未設定 ADMIN_TOKEN)」;`401` →「Token 不正確」;`429` →「嘗試次數過多,請 N 秒後再試」(讀 `Retry-After`,倒數期間禁用按鈕);網絡錯 →「連唔到 server」。
- **連續失敗提示**:前端自己數,第 5 次失敗起提示「同一 IP 每分鐘失敗 10 次會被鎖」。

### 4.3 `/reports`

- Tab:**Open**(預設,`status=open`)/ **All**。
- 表格欄:時間、Reason(chip)、Target(id 縮寫 + 狀態 chip)、**Target open 數**(`target.open_reports`,≥ 3 標紅,累犯指標)、Reporter(id 縮寫)、Status。
- 排序:backend 固定新→舊,portal 唔重排。
- 分頁:「載入更多」,用最後一項 `id` 做 `before`,`has_more=false` 就隱藏。**唔好用頁碼**(keyset 冇總數)。
- 點 row → `/reports/:id`。右上「重新整理」按鈕;唔自動輪詢(MVP)。
- 空狀態:Open tab 空 →「冇待處理舉報 🎉」(唔用 emoji 亦可,跟設計)。
- Open tab 內,已被其他動作結案嘅 report 唔會再出現;detail 頁處理完返回列表要 refetch。

### 4.4 `/reports/:id`

由上至下:

1. **Header**:Reason chip、Status chip、建立時間、(已結案)結案時間。
2. **Detail**:reporter 填嘅 `detail`(null 顯示「(無說明)」)。**純文字渲染,唔好用 `dangerouslySetInnerHTML`**(user 內容)。
3. **Target 卡**:id、status chip、`open_reports`;連去 `/users/:id`。
4. **Evidence**:
   - Title、頭像(`avatar_url`,`<img>` 加 `referrerPolicy="no-referrer"`、`loading="lazy"`、載入失敗顯示佔位)。
   - Messages 聊天樣式,**由舊到新顯示**(backend 係新→舊,前端 reverse);按 `sender_id` 分「舉報人 / 被舉報人」兩側;`kind=image` 顯示縮圖,點開放大。
   - `evidence == null` →「證據已過保留期(90 日)被清除」;`messages` 空 →「雙方冇聊天紀錄」。
   - 提醒條:「Evidence 係舉報當刻 snapshot,唔會更新」。
5. **操作列**(只喺 `status=open` 顯示;否則顯示唯讀結果):
   - 備註輸入(選填,≤ 200)。
   - **Dismiss**(次要按鈕)、**Ban target**(危險按鈕)。
   - Ban 需二次確認 modal,內容列出 §3.1 嘅副作用;`target.status` 已係 `banned` 時,Ban 按鈕改為禁用並提示「用戶已被封鎖」。
6. 處理成功:toast + 返回 `/reports`(或留低重新 fetch 顯示新狀態,視設計)。
7. Dismiss 回 `200` 但 `status` 唔係 `dismissed`(例如已被另一個動作結案):照實顯示最新狀態並 toast「此舉報已被處理」,唔好當成功 dismiss。

### 4.5 `/users/:id`

- 顯示 `AdminUser` 全部欄位;`last_active_at` 同 `created_at` 顯示絕對時間 + 相對時間。
- 狀態 chip:`active` 綠、`banned` 紅、`deleted` 灰。
- 操作:`active` → 「Ban」;`banned` → 「Unban」;`deleted` → 無操作(backend 回 404)。同樣有備註 + 確認 modal。
- `404` →「用戶唔存在或已刪除」(兩者 backend 唔分)。
- 頁面頂部有「輸入 user id 查詢」輸入框(portal 全局 header 亦放一個),因為冇用戶清單。
- 連結:「呢個用戶嘅舉報」**暫時做唔到**(backend 冇 by-target 查詢),見 §10。

### 4.6 `/health`

- **Metrics 卡**(每 15 秒自動 refresh,頁面隱藏時暫停;手動刷新按鈕):
  - 概覽:uptime(人類可讀)、SSE connections、`responses_5xx_total`。
  - DB:`write_wait_ms` p50/p95/p99/max、`sqlite_busy_total`(> 0 標紅)。
  - Jobs:ready / locked / `failed_total`(> 0 標紅)、`oldest_ready_age_ms`(null 顯示「—」)、`latency_ms`。
  - Rate limited:按 key 列出 `rate_limited_total`;`api > 0` 標黃(Phase 6 要求要追查 PWA 有冇輪詢)、`admin_fail > 0` 標黃(有人撞 token)。
- **Failed jobs 表**:`kind`、`attempts`、`last_error`(截斷 + 展開)、`failed_at`。`limit=50`。後端唔提供 payload,亦冇 retry endpoint,所以**純唯讀**。
- 注意 `/admin/metrics` 自己唔計入 `admin_fail`(成功 request 唔計)。

---

## 5. 前端技術與結構

沿用 `frontend` 嘅 stack,降低維護成本,但**portal 係獨立 repo / 專案**(`portal/`),唔同 PWA 共用 build。

| 範疇                            | 選擇                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Build                           | Vite + React + TypeScript(`App.tsx` 改名 `app.tsx`,`export const App`)                                            |
| UI                              | HeroUI(`@heroui/react`)+ Tailwind CSS;自訂樣式用 Less(`.less` import 放最後)                                      |
| Router                          | `react-router`                                                                                                    |
| HTTP                            | `axios` 單一 instance + interceptors(同 frontend `api/client.ts` 風格)                                            |
| State                           | `zustand`:只放 session(token)同少量 UI state;**server data 唔做全局快取**,頁面自己 fetch(portal 資料量細、要即時) |
| 型別                            | 手寫 `src/api/types.ts`(§3.2);admin 唔入 openapi,冇生成                                                           |
| 語言                            | UI 文案 `zh-Hant`,集中喺 `i18n/`,同 frontend 一致                                                                 |
| 無 PWA / SSE / push / IndexedDB | portal 唔需要                                                                                                     |

編碼規範跟 `~/.claude/CLAUDE.md`(`React.xxx()` 不解構、`React.Fragment`、`export const Component`、hooks 用 `export function useXxx`、Component 內 arrow function 不包 `useCallback`、memo 優先 `ReactUtil.memo`、每 file 一個 component)。

```
portal/
├─ portal-spec.md
├─ .env.example               # VITE_API_BASE=http://localhost:8080
└─ src/
   ├─ main.tsx
   ├─ app.tsx
   ├─ router.tsx              # 含 RequireAuth
   ├─ api/
   │  ├─ types.ts             # §3.2
   │  ├─ client.ts            # axios instance;Bearer、錯誤正規化、X-Request-Id
   │  ├─ errors.ts            # ApiError(status, code, details, requestId, retryAfter)
   │  └─ endpoints/           # reports.ts, users.ts, jobs.ts, metrics.ts
   ├─ session/
   │  └─ sessionStore.ts      # token、login()、logout()
   ├─ pages/
   │  ├─ Login/index.tsx
   │  ├─ Reports/index.tsx            # 列表
   │  ├─ ReportDetail/index.tsx
   │  │   ├─ Evidence.tsx
   │  │   └─ ActionBar.tsx
   │  ├─ User/index.tsx
   │  └─ Health/index.tsx
   ├─ components/             # AdminShell, StatusChip, ReasonChip, ConfirmModal, IdTag, TimeText
   ├─ i18n/
   └─ styles/
```

### 5.1 API client 規則

- `baseURL = VITE_API_BASE + '/v1'`;`VITE_API_BASE` 缺失 → 啟動即 throw(同 frontend)。
- Request interceptor:加 `Authorization: Bearer <token>`。
- Response interceptor:正規化成 `ApiError`,保留 `status`、`error.code`、`error.details.field`、`X-Request-Id`、`Retry-After`。
- **`401` / `404`(於已登入後)**:
  - 已登入狀態下任何 admin call 回 `401` → 清 token,跳 `/login`(token 被輪換)。
  - 已登入狀態下回 `404` 要看 path:`/users/{id}`、`/reports/{id}` 嘅 `404` 係「資源唔存在」;只有 login 探測(`/admin/metrics`)嘅 `404` 先代表「後台未啟用」。
- `429`:顯示 toast「請求過多,N 秒後再試」,**唔自動重試**。
- 所有 mutation 按鈕送出期間禁用,防雙擊。
- 唔做 retry、唔做 optimistic update(營運動作要以 server 回應為準)。

### 5.2 Token 處理(重要)

`ADMIN_TOKEN` 係單一萬能憑證,洩漏 = 全權。

- **只存 `sessionStorage`**(關 tab 即失效)或純記憶體;**嚴禁 `localStorage` / IndexedDB / cookie / URL**。MVP 建議純記憶體 + `sessionStorage` 兩者擇一,默認 `sessionStorage` 方便 refresh。
- 輸入欄 `autocomplete="off"`;唔 `console.log` token;錯誤上報唔帶 header。
- 提供「登出」(清 store + `sessionStorage`)。
- 閒置 30 分鐘自動登出(MVP 可選)。
- Portal 部署需 HTTPS;加 CSP(`default-src 'self'`;`img-src` 允許圖床 `https://img.eservice-hk.net` 同 evidence 圖片 host;`connect-src` 允許 API origin)、`Referrer-Policy: no-referrer`、`X-Frame-Options: DENY`。
- 因為 IP 失敗限流:portal 唔好喺背景自動用舊 token 重試(會燒失敗額度)。

---

## 6. 錯誤處理對照

| 情況                                           | 位置        | UI 行為                                   |
| ---------------------------------------------- | ----------- | ----------------------------------------- |
| `404` @ login 探測                             | `/login`    | 「後台未啟用」                            |
| `401` @ login                                  | `/login`    | 「Token 不正確」                          |
| `401` @ 已登入                                 | 任何        | 清 session → `/login`,toast「登入已失效」 |
| `429`                                          | 任何        | 顯示 `Retry-After` 倒數;login 禁用按鈕    |
| `400 VALIDATION_FAILED`,`details.field = note` | ActionBar   | 備註欄標紅 + message                      |
| `404` @ `/reports/{id}`                        | 詳情        | 「舉報唔存在」+ 返回列表                  |
| `404` @ `/users/{id}`                          | 用戶        | 「用戶唔存在或已刪除」                    |
| `404` @ ban / unban                            | 用戶 / 舉報 | 「用戶已刪除或唔存在,無法操作」,refetch   |
| `5xx` / 網絡錯                                 | 任何        | 錯誤卡 + 「重試」+ 顯示 `X-Request-Id`    |

---

## 7. 安全與誤操作防護

- Ban 一律二次確認(modal),列出副作用;unban 亦確認。
- 確認 modal 內顯示目標 id 全文,避免 ban 錯人。
- 破壞性按鈕同普通按鈕視覺分離(danger 色),唔放喺貼近 dismiss 嘅位置。
- 所有 user 提供內容(`detail`、Title、message `body`)當純文字渲染;`image_url` / `avatar_url` 只用於 `<img src>`,唔當連結 `href` 開新頁(避免 `javascript:` / 外洩 referrer)。
- 所有改狀態嘅動作由 backend 寫 `admin_actions` + log(`target: "admin"`),portal 唔需要自己記審計。

---

## 8. 環境與腳本

| 變數            | 說明                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE` | API origin,**唔含 `/v1`**。`.env.development` → `http://localhost:8080`;`.env.production` → `https://api.kaului.com` |

| 指令          | 說明                            |
| ------------- | ------------------------------- |
| `pnpm dev`    | `vite --port 5174 --strictPort` |
| `pnpm build`  | Production build                |
| `pnpm test`   | Vitest                          |
| `pnpm format` | Prettier                        |

Backend 本地聯調:

```bash
# backend/.env
ADMIN_TOKEN=$(openssl rand -hex 32)          # ≥ 32 字元
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
```

部署:純靜態(SPA fallback 到 `index.html`),建議獨立子網域(如 `admin.kaului.com`),並限制來源 IP / 加 basic auth 之類外層保護(視部署平台)。

---

## 9. 測試

- **Unit(Vitest + RTL)**:
  - `ApiError` 正規化(含 `Retry-After`、`details.field`)。
  - `sessionStore`:login 成功 / 各錯誤分流、logout 清 `sessionStorage`。
  - Evidence 渲染:reverse 順序、`null` evidence、空 messages、image kind。
  - ActionBar:非 open 唔顯示操作、banned target 禁用 Ban、`note` > 200 字被擋。
  - Dismiss 回非 `dismissed` 狀態時顯示「已被處理」。
- **Mock**:用 MSW 或 axios adapter mock `/v1/admin/*`;可由 `backend/tests/admin.rs` 嘅 fixture 抄 response 形狀。
- **E2E(Playwright,對真 backend)**:
  1. 啟動 backend(`ADMIN_TOKEN` 已設)、用 `POST /auth/device` 開兩個帳號、`POST /v1/reports` 製造舉報。
  2. Portal 登入 → 見隊列 → 開詳情見 evidence → dismiss → 隊列消失。
  3. 再造舉報 → ban → 確認 target `status=banned`、其 open report 全部結案、用 target token call `/v1/me` 得 `403 ACCOUNT_BANNED`。
  4. unban → `status=active`。
  5. 錯 token 連試 11 次 → 第 11 次起 `429`,再用啱 token 都 `429`(驗證 §2.1)。
- **手動**:`ADMIN_TOKEN` 唔設 → login 顯示「後台未啟用」。

---

## 10. Backend 缺口與建議(portal 做唔到嘅嘢)

以下需要 backend 加 endpoint,先至可以做;**MVP 唔阻塞**,但營運一段時間後會痛:

| #   | 缺口                              | 影響                                                 | 建議                                                                     |
| --- | --------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | 冇 `GET /admin/users` 列表 / 搜尋 | 只可憑 id 查人,要靠舉報頁跳轉                        | 加 keyset 列表,可按 `status`、`open_reports` 排序                        |
| 2   | 冇「某 target 嘅所有 report」查詢 | 用戶頁睇唔到歷史舉報;累犯判斷靠 `total_reports` 數字 | `GET /admin/reports?target=<id>`                                         |
| 3   | 冇讀取 `admin_actions`            | 睇唔到邊個幾時 ban / unban 過、備註內容              | `GET /admin/actions?user_id=`                                            |
| 4   | `ReportItem` 冇 reporter 摘要     | 無法判斷 reporter 係咪濫舉報                         | 加 `reporter.status` / reporter 舉報次數                                 |
| 5   | Failed job 冇 retry / 清除        | 睇到失敗但要登入 server 處理                         | 視需要加 `POST /admin/jobs/{id}/retry`                                   |
| 6   | Admin 唔入 OpenAPI                | portal 型別要手維護,容易同 backend 脫節              | 按 Phase 6 §12 第 8 項:另出獨立 `openapi-admin.json`,portal 再 `gen:api` |
| 7   | 單一共用 `ADMIN_TOKEN`            | 冇個人審計(`admin_actions` 唔記邊個做)               | 多 admin 超出 Phase 5 範圍,留待日後                                      |

---

## 11. 實作階段(Implementation Phases)

每個 phase 都係一個可獨立 merge、可獨立驗收嘅切片。順序有依賴,唔好跳。每次改完代碼只跑 Prettier(`pnpm format`),唔跑 ESLint / type check(見全局規範)。

```
P0 前置 ─► P1 骨架+登入 ─► P2 舉報列表 ─► P3 舉報詳情 ─► P4 處理動作 ─┐
                                                                    ├─► P7 收尾
                                          P5 用戶頁(依賴 P1、P4 ConfirmModal)─┤
                                          P6 Health(只依賴 P1)────────────────┘
```

P5、P6 之間冇依賴,可以對調或並行。

### P0 前置:Backend 聯調環境(0.25 日)

唔寫 portal code,先搞掂外部條件,否則 P1 起就會撞牆。

- backend `.env` 設 `ADMIN_TOKEN`(≥ 32 字元)同 `ALLOWED_ORIGINS` 加入 `http://localhost:5174`(§2.3、§8)。
- 用 curl 驗:`GET /v1/admin/metrics` 帶啱 token 回 `200`;瀏覽器 preflight(`OPTIONS`)帶 `Authorization` 通過。
- 準備 seed 數據:用 `POST /auth/device` 開兩個帳號,`POST /v1/reports` 造最少 1 個有聊天紀錄嘅舉報、1 個冇聊天紀錄嘅舉報。

**驗收**:curl 可讀到 metrics;兩個 report(有 / 冇 evidence messages)存在;CORS preflight 唔報錯。

### P1 骨架 + 登入(0.75 日)

**範圍**

- Vite + React + TS 專案初始化:`App.tsx` → `app.tsx`、`export const App`;裝 HeroUI、Tailwind、Less、`react-router`、`axios`、`zustand`、Vitest + RTL;`pnpm dev` = `vite --port 5174 --strictPort`。
- `.env.example`、`.env.development`;`VITE_API_BASE` 缺失啟動即 throw(§5.1)。
- `api/errors.ts`(`ApiError`:status、code、details、requestId、retryAfter)、`api/client.ts`(Bearer、錯誤正規化、`401` 已登入後清 session)、`api/types.ts`(§3.2 全部型別)。
- `session/sessionStore.ts`:token 只存 `sessionStorage`、`login()` / `logout()`(§5.2)。
- `router.tsx` + `RequireAuth`(保留 `redirect`)、`AdminShell`(header:登出、user id 查詢框,查詢框先掛位,P5 先接線)。
- `i18n/` 骨架(`zh-Hant`)。
- `/login`:`GET /admin/metrics` 探測;`404` / `401` / `429`(倒數禁用)/ 網絡錯分流;第 5 次失敗起提示(§4.2)。

**交付**:可登入、可登出、未登入被導向 `/login`;其餘 route 暫時係空頁。

**驗收**

- 手動:唔設 `ADMIN_TOKEN` → 「後台未啟用」;錯 token → 「Token 不正確」;連試 11 次 → `429` 倒數,期間用啱 token 亦被拒。
- Vitest:`ApiError` 正規化(含 `Retry-After`、`details.field`);`sessionStore` 各分流同 logout 清 `sessionStorage`。
- DevTools 確認 token 唔喺 `localStorage` / cookie / URL。

### P2 舉報列表(0.5 日)

**範圍**

- `api/endpoints/reports.ts`:`listReports`(`status`、`before`、`limit`)。
- 共用元件:`StatusChip`、`ReasonChip`、`IdTag`(id 縮寫 + 點擊複製全文)、`TimeText`(絕對 + 相對)。
- `/reports`:Open / All tab、表格(§4.3 欄位、`target.open_reports ≥ 3` 標紅)、keyset「載入更多」(`has_more=false` 隱藏)、重新整理、空狀態、錯誤卡(顯示 `X-Request-Id`)。
- 點 row → `/reports/:id`(P3 先有頁,此時可先 404 佔位)。

**驗收**

- 手動:造 > 50 個 open report 驗分頁(或用 `limit` 暫時調細);切 tab 唔殘留舊資料;斷網顯示錯誤卡 + 重試。
- Vitest:tab 切換 refetch、「載入更多」用最後一項 `id` 做 `before`、`has_more=false` 隱藏按鈕。

### P3 舉報詳情 + Evidence(0.75 日)

**範圍**

- `getReport`(含 `evidence`)。
- `/reports/:id`:Header、Detail(純文字)、Target 卡(連去 `/users/:id`)、Evidence(§4.4 第 4 點):Title、頭像(`referrerPolicy="no-referrer"`、`loading="lazy"`、失敗佔位)、聊天樣式 messages(**reverse 成舊→新**、按 `sender_id` 分兩側)、圖片縮圖點開放大、`evidence == null` 同 `messages` 空兩種提示、snapshot 提醒條。
- 已結案 report 顯示唯讀結果同 `resolved_at`。
- `404` →「舉報唔存在」+ 返回列表。

**驗收**

- 手動:有 / 冇聊天紀錄嘅兩個 report 都顯示正確;含 `<script>`、HTML 字元嘅 `detail` / `body` 原樣顯示為文字。
- Vitest:Evidence 渲染——reverse 順序、`null` evidence、空 messages、`kind=image`。

### P4 處理動作(0.75 日)

**範圍**

- `dismissReport`、`banFromReport`(一律用 `report/{id}/ban`,§3.1)。
- `ConfirmModal`(通用,P5 重用):顯示目標 id 全文、副作用清單(§3.1 Ban 副作用 + 「ban 局限」提示)。
- `ReportDetail/ActionBar.tsx`:只喺 `status=open` 顯示;備註欄(≤ 200 字計數,超出擋送出,`details.field=note` 標紅);Dismiss(次要)、Ban(danger、位置同 Dismiss 分開);target 已 `banned` → Ban 禁用 + 提示。
- 送出期間所有按鈕禁用;唔做 optimistic update。
- Idempotent 處理:Dismiss 回 `200` 但 `status !== "dismissed"` → toast「此舉報已被處理」並顯示最新狀態。
- 成功後 toast + 返回 `/reports` 並 refetch。
- `404` @ ban →「用戶已刪除或唔存在,無法操作」+ refetch(§6)。

**驗收**

- 手動(對真 backend):dismiss → 列表消失;ban → target `banned`、佢嘅其他 open report 全部變 `actioned`、用 target token call `/v1/me` 得 `403 ACCOUNT_BANNED`;雙擊唔會重複送出。
- Vitest:非 open 唔顯示操作、banned target 禁用 Ban、`note` > 200 被擋、Dismiss 回非 `dismissed` 顯示「已被處理」。

### P5 用戶頁(0.5 日)

**範圍**

- `api/endpoints/users.ts`:`getUser`、`banUser`、`unbanUser`。
- `/users/:id`:`AdminUser` 全部欄位、狀態 chip、絕對 + 相對時間;`active` → Ban、`banned` → Unban、`deleted` → 無操作;重用 `ConfirmModal`(unban 確認內寫明「唔恢復 match / hello / push subscription」)。
- `404` →「用戶唔存在或已刪除」。
- 接線 `AdminShell` 全局 user id 查詢框同頁頂查詢框(輸入前 trim,空值唔送)。
- 「呢個用戶嘅舉報」連結**唔做**(§10 缺口 2),可放 disabled 提示。

**驗收**

- 手動:ban → unban 來回,狀態同 chip 正確更新;查詢唔存在 id 見 `404` 文案;Unban 確認框有「唔恢復」提示。

### P6 Health(0.5 日)

**範圍**

- `api/endpoints/metrics.ts`、`jobs.ts`。
- `/health` Metrics 卡:概覽 / DB / Jobs / Rate limited(§4.6 標紅標黃規則;`rate_limited_total` **按 key 動態渲染**;`oldest_ready_age_ms` null 顯示「—」)。
- 15 秒自動 refresh,`document.hidden` 時暫停、回到前景立即補一次;手動刷新按鈕。
- Failed jobs 表(`limit=50`、`last_error` 截斷 + 展開),純唯讀。
- 自動 refresh 遇 `401` → 停止輪詢(避免燒失敗額度,§5.2)。

**驗收**

- 手動:切走 tab 後 Network 無新 request、切返即補;塞一個 limiter key(mock)驗動態渲染;`sqlite_busy_total > 0` / `failed_total > 0` 標紅。
- Vitest:閾值顏色邏輯、null 顯示、動態 key 渲染。

### P7 收尾(0.75 日)

**範圍**

- 部署用嘅 CSP、`Referrer-Policy: no-referrer`、`X-Frame-Options: DENY`(§5.2),SPA fallback 到 `index.html`;`.env.production`。
- 對照 §6 錯誤處理表逐行過一次,補漏(`429` 全局 toast、`401` 已登入 toast「登入已失效」)。
- 閒置 30 分鐘自動登出(可選)。
- Playwright E2E:依 §9 嘅 5 個場景。
- 全部 UI 文案過一次集中到 `i18n/`;`pnpm format`。
- 部署文件:CORS origin 要加入正式 `ALLOWED_ORIGINS`、外層 IP 限制 / basic auth 建議。

**驗收**:§9 E2E 全綠;§6 每一行都有對應手動或自動驗證;正式環境 CSP 下圖片、API call 正常,冇 console 違規報錯。

### 工時總覽

| Phase | 內容        | 預估       | 依賴   |
| ----- | ----------- | ---------- | ------ |
| P0    | 聯調環境    | 0.25 日    | —      |
| P1    | 骨架 + 登入 | 0.75 日    | P0     |
| P2    | 舉報列表    | 0.5 日     | P1     |
| P3    | 舉報詳情    | 0.75 日    | P2     |
| P4    | 處理動作    | 0.75 日    | P3     |
| P5    | 用戶頁      | 0.5 日     | P1、P4 |
| P6    | Health      | 0.5 日     | P1     |
| P7    | 收尾 + E2E  | 0.75 日    | 全部   |
| 合計  |             | 約 4.75 日 |        |

比舊版估算(3.5 日)多 1.25 日:主要係補返 P0 聯調、Evidence 渲染同 Vitest / E2E 嘅真實工時。
