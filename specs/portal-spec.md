# Kaului Portal Spec

Kaului 的管理後台（web），對接 `backend` repo 的 `/v1/admin/*`，供營運人員處理舉報、封鎖用戶及查看系統健康狀態。

- 契約來源（以此為準）：`backend/specs/phase-5-spec.md` §7（report / ban / admin）、§10（metrics）；實作位於 `backend/src/admin/`
- **Admin API 刻意不納入 `openapi.json`**（`backend/specs/phase-6-spec.md` §1、§12 第 8 項），因此 portal **沒有** `gen:api` 可用，型別須手寫（§5）
- 狀態：Draft v0.1

---

## 1. 目標與非目標

**目標**

1. 舉報隊列：列出 open report，查看 evidence snapshot，可一鍵 dismiss 或 ban。
2. 用戶查詢：輸入 user id，查看狀態及舉報統計，並可 ban / unban。
3. 系統健康：查看 metrics 及 dead-letter jobs。
4. 單人營運即可應付：操作步驟最少，且不易誤封。

**非目標（MVP）**

- 多 admin / 角色權限（backend 僅有單一 `ADMIN_TOKEN`，Phase 5 §2 已定案）。
- 用戶清單 / 搜尋、聊天全文瀏覽、`admin_actions` 審計紀錄瀏覽（backend 沒有對應 endpoint，見 §10）。
- 被 ban 用戶的申訴流程。
- 手機版優化（以桌面瀏覽器為優先，但版面不可毀壞）。

---

## 2. 後端事實（portal 必須遵守）

### 2.1 驗證

| 項目               | 行為                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Header             | `Authorization: Bearer <ADMIN_TOKEN>`（≥ 32 字元；一般 user token 無效）                                                                  |
| `ADMIN_TOKEN` 未設 | **所有** `/v1/admin/*` 回傳 `404 NOT_FOUND`（假裝 admin 不存在）                                                                          |
| Token 錯誤         | `401 UNAUTHENTICATED`，並計入 per-IP 失敗限流                                                                                             |
| 失敗限流           | 同一 IP **1 分鐘內失敗第 11 次起**，其後所有 request（**包括 token 正確者**）一律回傳 `429` 並帶 `Retry-After`，直至窗口過去。成功的 request 不計入 |
| 與 user API 的關係 | 獨立 extractor，不受 `api_limiter` 影響，亦不會回傳 `403 ACCOUNT_BANNED`                                                                  |

因此 portal 的登入畫面須區分：`404` =「後台未啟用」、`401` =「令牌不正確」、`429` =「嘗試次數過多，請 N 秒後再試」。**不可**以同一個「登入失敗」訊息帶過。

### 2.2 通用格式

- Base：`{VITE_API_BASE}/v1`（本地 `http://localhost:8080/v1`，正式 `https://api.kaului.com/v1`）。
- 時間：epoch **毫秒**（`created_at`、`resolved_at`、`failed_at`、`last_active_at`、`server_now`）。
- ID：UUIDv7 字串；列表採 keyset 分頁（`id DESC`）。
- 錯誤 body：`{ "error": { "code", "message", "details" } }`；欄位驗證錯誤 = `400 VALIDATION_FAILED`，且 `details.field` 會指明欄位（admin 會遇到 `note` / `limit` / `status` / `before`）。
- Request body 一律啟用 `deny_unknown_fields`：**不可**多送欄位。
- 回應帶有 `X-Request-Id`（CORS 已 expose），錯誤畫面須顯示，以便比對 server log。

### 2.3 CORS（必須先處理）

Phase 5 假設 admin 僅供 curl 使用，因此未針對 admin 設計 CORS。但 CORS layer 為全域設定（`ALLOWED_ORIGINS`），已允許 `Authorization` / `Content-Type` header 及 `GET/POST`，因此：

- **做法**：將 portal origin 加入 backend 的 `ALLOWED_ORIGINS`（以逗號分隔，例如 `http://localhost:5173,http://localhost:5174,https://portal.kaului.com`）。**無須修改 backend 程式碼。**
- 注意 portal 的 dev port **不可與 PWA 衝突**（PWA 使用 5173），portal 使用 `5174` 並加上 `--strictPort`。
- 代價：PWA 與 portal 共用同一份 allow-list。此代價可接受，因為真正的保護是 `ADMIN_TOKEN`，而非 CORS。
- 正式環境：portal 部署於 Vercel，origin 為 `https://portal.kaului.com`（§8.1）。**Vercel preview deployment 的 `*.vercel.app` origin 不在 allow-list 內**，因此 preview 無法連通 backend（被 CORS 擋下）；要驗證真實 backend，一律使用本地 dev 或 production。不建議為 preview 放寬 allow-list（`ALLOWED_ORIGINS` 不支援萬用字元）。
- 備選（不建議）：以 Vercel `rewrites` 將 `/v1/admin/*` 反向代理至 `https://api.kaului.com`，變成 same-origin 而免除 CORS；但 admin 流量會多經一層，且經 Vercel 代理後，backend 看到的 client IP 會變成 Vercel 出口 IP，**per-IP 失敗限流（§2.1）會失準**，故不採用。

---

## 3. Endpoints

全部需要 `AdminAuth`（§2.1）。

| Method | Path                                                       | 用途                                | 成功回應                                |
| ------ | ---------------------------------------------------------- | ----------------------------------- | --------------------------------------- |
| GET    | `/admin/reports?status=open\|all&before=<id>&limit=1..100` | 舉報列表（預設 `open`、`limit` 50） | `200 { items: ReportItem[], has_more }` |
| GET    | `/admin/reports/{id}`                                      | 單一舉報，**含 `evidence`**         | `200 ReportItem`                        |
| POST   | `/admin/reports/{id}/dismiss`                              | 結案（不處罰），body `{ note? }`    | `200 ReportItem`（最新狀態）            |
| POST   | `/admin/reports/{id}/ban`                                  | 由舉報封鎖 target，body `{ note? }` | `200 { status: "banned" }`              |
| GET    | `/admin/users/{id}`                                        | 用戶摘要                            | `200 AdminUser`；不存在則 `404`         |
| POST   | `/admin/users/{id}/ban`                                    | 封鎖，body `{ note? }`              | `200 { status: "banned" }`              |
| POST   | `/admin/users/{id}/unban`                                  | 解除封鎖，body `{ note? }`          | `200 { status: "active" }`              |
| GET    | `/admin/jobs/failed?limit=1..100`                          | dead-letter jobs（預設 50）         | `200 { items: FailedJobItem[] }`        |
| GET    | `/admin/metrics`                                           | 系統快照                            | `200` JSON（§3.2）                      |

### 3.1 語意重點

- **列表不帶 `evidence`**（`null` / 缺漏），須開啟詳情才有。Portal 不可在列表預期有證據。
- **`note`**：選填、會 trim、≤ 200 字元，超過則回傳 `400`（`details.field = "note"`）。UI 須加上字數計數，於送出前即攔截。
- **Idempotent**：
  - dismiss 已非 open 的 report → `200` 並回傳現況，不報錯。
  - ban 已被封鎖的 user → `200`，不寫入審計。unban 非 banned 的 user → `200`，no-op。
  - ban `deleted` 或不存在的 user → `404`。
- **Ban 副作用**（UI 確認框須清楚說明）：對方所有 open match 被關閉（對方只會看到「match 消失」）、pending hello 靜默過期、push subscription 被刪除、針對該用戶的**所有** open report 自動結案（`actioned`）、其進行中的 SSE 立即中斷。Reporter **不會**收到通知。
- **Unban 不會還原**：match / hello / push subscription 不會恢復，Title / profile 會自然恢復。UI 須明確註明。
- **Ban 局限**：帳號以裝置為基礎，被封鎖者可以另開新帳號。UI 不可暗示「封鎖後即萬事大吉」。
- **`report/{id}/ban` 與 `users/{id}/ban` 的差異**：前者的審計記為 `report.ban`（帶 report id），後者記為 `ban`。於舉報頁處理時，一律使用前者。

### 3.2 資料形狀（手寫型別，放置於 `src/api/types.ts`）

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
  evidence?: Evidence | null; // 僅 GET /reports/{id} 提供；超過 90 日會被清為 null
}

interface Evidence {
  title: string | null; // target 被舉報當下的 active Title
  avatar_url: string | null;
  messages: EvidenceMessage[]; // reporter ↔ target 最近 20 則，新→舊；沒有互動 = []
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

`/admin/metrics` 回應（`backend/src/metrics.rs::snapshot`）：

```jsonc
{
  "server_now": 0,
  "uptime_secs": 0,
  "db":   { "write_wait_ms": Hist, "sqlite_busy_total": 0 },
  "jobs": { "ready": 0, "locked": 0, "failed_total": 0,
            "oldest_ready_age_ms": null /* 或 number */, "latency_ms": Hist },
  "sse":  { "connections": 0, "evictions_total": 0 },
  "http": { "responses_5xx_total": 0,
            "rate_limited_total": { "api": 0, "admin_fail": 0 /* …其他 limiter 名稱 */ } },
  "events": { "max_id": 0 }
}
// Hist = { count, p50, p95, p99, max }（毫秒，percentile 為 bucket 上限）
```

`rate_limited_total` 的 key 集合由 backend 的 `Limiter::ALL` 決定，portal **須依 key 動態渲染**，不可寫死。

---

## 4. 畫面

### 4.1 Routes

| Path           | 畫面                       |
| -------------- | -------------------------- |
| `/login`       | 輸入 Admin token           |
| `/`            | 重新導向至 `/reports`      |
| `/reports`     | 舉報隊列（tab：Open / All） |
| `/reports/:id` | 舉報詳情 + evidence + 處理 |
| `/users/:id`   | 用戶摘要 + ban / unban     |
| `/health`      | Metrics + failed jobs      |

未登入時訪問任何非 `/login` 的 route → 重新導向至 `/login`（保留 `redirect`）。

### 4.2 `/login`

- 一個密碼欄位（`type="password"`）及「登入」按鈕。
- 登入 = 以輸入的 token 呼叫 `GET /admin/metrics`（負載最輕，且是唯一沒有 path 參數的 GET）。回應 `200` 才視為成功並儲存 token。
- 錯誤分流：`404` →「後台未啟用」；`401` →「令牌不正確」；`429` →「嘗試次數過多，請 N 秒後再試」（讀取 `Retry-After`，倒數期間停用按鈕）；網絡錯誤 →「無法連線至伺服器」。
- **連續失敗提示**：由前端自行計數，自第 5 次失敗起提示「同一 IP 每分鐘失敗 10 次將被鎖定」。

### 4.3 `/reports`

- Tab：**Open**（預設，`status=open`）/ **All**。
- 表格欄位：時間、Reason（chip）、Target（id 縮寫 + 狀態 chip）、**Target open 數**（`target.open_reports`，≥ 3 標紅，作為累犯指標）、Reporter（id 縮寫）、Status。
- 排序：backend 固定為新→舊，portal 不重新排序。
- 分頁：「載入更多」，以最後一項的 `id` 作為 `before`，`has_more=false` 時隱藏。**不可使用頁碼**（keyset 沒有總數）。
- 點擊 row → `/reports/:id`。右上角設「重新整理」按鈕；MVP 不自動輪詢。
- 空狀態：Open tab 為空時顯示「沒有待處理舉報」（不使用 emoji，依設計稿）。
- Open tab 內，已被其他動作結案的 report 不會再出現；於詳情頁處理完畢返回列表時須 refetch。

### 4.4 `/reports/:id`

由上至下：

1. **Header**：Reason chip、Status chip、建立時間、（已結案時）結案時間。
2. **Detail**：reporter 填寫的 `detail`（為 null 時顯示「（無說明）」）。**須以純文字渲染，不可使用 `dangerouslySetInnerHTML`**（屬 user 內容）。
3. **Target 卡**：id、status chip、`open_reports`；連結至 `/users/:id`。
4. **Evidence**：
   - Title、頭像（`avatar_url`，`<img>` 須加上 `referrerPolicy="no-referrer"`、`loading="lazy"`，載入失敗時顯示佔位圖）。
   - Messages 以聊天樣式呈現，**由舊到新顯示**（backend 為新→舊，前端須 reverse）；依 `sender_id` 分為「舉報人 / 被舉報人」兩側；`kind=image` 顯示縮圖，點擊後放大。
   - `evidence == null` →「證據已超過保留期限（90 日），已被清除」；`messages` 為空 →「雙方沒有聊天紀錄」。
   - 提醒條：「證據為舉報當下的快照，不會更新」。
5. **操作列**（僅於 `status=open` 時顯示；否則顯示唯讀結果）：
   - 備註輸入（選填，≤ 200）。
   - **Dismiss**（次要按鈕）、**Ban target**（危險按鈕）。
   - Ban 須經二次確認 modal，內容列出 §3.1 的副作用；若 `target.status` 已為 `banned`，Ban 按鈕改為停用並提示「用戶已被封鎖」。
6. 處理成功：顯示 toast 並返回 `/reports`（或停留於本頁重新 fetch 以顯示新狀態，視設計而定）。
7. Dismiss 回傳 `200` 但 `status` 不是 `dismissed`（例如已被另一個動作結案）：須如實顯示最新狀態並以 toast 提示「此舉報已被處理」，不可視為 dismiss 成功。

### 4.5 `/users/:id`

- 顯示 `AdminUser` 的全部欄位；`last_active_at` 與 `created_at` 顯示絕對時間 + 相對時間。
- 狀態 chip：`active` 綠、`banned` 紅、`deleted` 灰。
- 操作：`active` →「Ban」；`banned` →「Unban」；`deleted` → 無操作（backend 會回傳 404）。同樣設有備註欄位及確認 modal。
- `404` →「用戶不存在或已刪除」（backend 不區分兩者）。
- 頁面頂部設有「輸入 user id 查詢」輸入框（portal 全域 header 亦放置一個），因為沒有用戶清單。
- 連結：「此用戶的舉報」**暫時無法實作**（backend 沒有 by-target 查詢），見 §10。

### 4.6 `/health`

- **Metrics 卡**（每 15 秒自動 refresh，頁面隱藏時暫停；另設手動刷新按鈕）：
  - 概覽：uptime（人類可讀格式）、SSE connections、`responses_5xx_total`。
  - DB：`write_wait_ms` 的 p50/p95/p99/max、`sqlite_busy_total`（> 0 標紅）。
  - Jobs：ready / locked / `failed_total`（> 0 標紅）、`oldest_ready_age_ms`（為 null 時顯示「—」）、`latency_ms`。
  - Rate limited：依 key 列出 `rate_limited_total`；`api > 0` 標黃（Phase 6 要求須追查 PWA 是否有輪詢）、`admin_fail > 0` 標黃（有人嘗試猜測 token）。
- **Failed jobs 表**：`kind`、`attempts`、`last_error`（截斷 + 可展開）、`failed_at`。`limit=50`。後端不提供 payload，亦沒有 retry endpoint，因此**純唯讀**。
- 注意 `/admin/metrics` 本身不計入 `admin_fail`（成功的 request 不計）。

---

## 5. 前端技術與結構

沿用 `frontend` 的技術棧以降低維護成本，但 **portal 為獨立 repo / 專案**（`portal/`），不與 PWA 共用 build。

| 範疇                            | 選擇                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Build                           | Vite + React + TypeScript（`App.tsx` 改名為 `app.tsx`，`export const App`）                                           |
| UI                              | HeroUI（`@heroui/react`）+ Tailwind CSS；自訂樣式使用 Less（`.less` import 放最後）                                   |
| Router                          | `react-router`                                                                                                        |
| HTTP                            | `axios` 單一 instance + interceptors（風格與 frontend 的 `api/client.ts` 一致）                                       |
| State                           | `zustand`：僅存放 session（token）及少量 UI state；**server data 不做全域快取**，由頁面自行 fetch（portal 資料量小，且須即時） |
| 型別                            | 手寫 `src/api/types.ts`（§3.2）；admin 不納入 openapi，故無自動生成                                                   |
| 語言                            | UI 文案使用 `zh-Hant`（書面語），集中於 `i18n/`，與 frontend 一致                                                     |
| 無 PWA / SSE / push / IndexedDB | portal 不需要                                                                                                         |

編碼規範依循 `~/.claude/CLAUDE.md`（`React.xxx()` 不解構、`React.Fragment`、`export const Component`、hooks 使用 `export function useXxx`、Component 內的 arrow function 不包 `useCallback`、memo 優先使用 `ReactUtil.memo`、每個 file 僅一個 component）。

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
   │  ├─ client.ts            # axios instance；Bearer、錯誤正規化、X-Request-Id
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

- `baseURL = VITE_API_BASE + '/v1'`；`VITE_API_BASE` 缺失 → 啟動時即 throw（與 frontend 相同）。
- Request interceptor：加入 `Authorization: Bearer <token>`。
- Response interceptor：正規化為 `ApiError`，保留 `status`、`error.code`、`error.details.field`、`X-Request-Id`、`Retry-After`。
- **`401` / `404`（於登入後）**：
  - 已登入狀態下，任何 admin call 回傳 `401` → 清除 token 並跳轉至 `/login`（token 已被輪換）。
  - 已登入狀態下回傳 `404` 須視 path 而定：`/users/{id}`、`/reports/{id}` 的 `404` 代表「資源不存在」；只有登入探測（`/admin/metrics`）的 `404` 才代表「後台未啟用」。
- `429`：顯示 toast「請求過多，N 秒後再試」，**不自動重試**。
- 所有 mutation 按鈕於送出期間須停用，以防重複點擊。
- 不做 retry，不做 optimistic update（營運動作須以 server 回應為準）。

### 5.2 Token 處理（重要）

`ADMIN_TOKEN` 是單一萬能憑證，一旦洩漏即等同全權。

- **僅存放於 `sessionStorage`**（關閉分頁即失效）或純記憶體；**嚴禁使用 `localStorage` / IndexedDB / cookie / URL**。MVP 建議於純記憶體與 `sessionStorage` 二者擇一，預設為 `sessionStorage`，以便重新整理後維持登入。
- 輸入欄位設 `autocomplete="off"`；不可 `console.log` token；錯誤上報不得附帶 header。
- 提供「登出」功能（清除 store 及 `sessionStorage`）。
- 閒置 30 分鐘自動登出（MVP 可選）。
- Portal 部署於 Vercel（自動 HTTPS）；response headers 由 `vercel.json` 設定（§8.1）：CSP（`default-src 'self'`；`img-src` 允許圖床 `https://img.eservice-hk.net` 及 evidence 圖片 host；`connect-src` 允許 `https://api.kaului.com`）、`Referrer-Policy: no-referrer`、`X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、`X-Robots-Tag: noindex, nofollow`。
- 由於存在 IP 失敗限流：portal 不可於背景以舊 token 自動重試（會消耗失敗額度）。

---

## 6. 錯誤處理對照

| 情況                                           | 位置        | UI 行為                                      |
| ---------------------------------------------- | ----------- | -------------------------------------------- |
| `404` @ login 探測                             | `/login`    | 「後台未啟用」                               |
| `401` @ login                                  | `/login`    | 「令牌不正確」                               |
| `401` @ 已登入                                 | 任何        | 清除 session → `/login`，toast「登入已失效」 |
| `429`                                          | 任何        | 顯示 `Retry-After` 倒數；login 停用按鈕      |
| `400 VALIDATION_FAILED`，`details.field = note` | ActionBar   | 備註欄標紅 + message                         |
| `404` @ `/reports/{id}`                        | 詳情        | 「舉報不存在」+ 返回列表                     |
| `404` @ `/users/{id}`                          | 用戶        | 「用戶不存在或已刪除」                       |
| `404` @ ban / unban                            | 用戶 / 舉報 | 「用戶已刪除或不存在，無法操作」，並 refetch |
| `5xx` / 網絡錯誤                               | 任何        | 錯誤卡 + 「重試」+ 顯示 `X-Request-Id`       |

---

## 7. 安全與誤操作防護

- Ban 一律須二次確認（modal）並列出副作用；unban 同樣須確認。
- 確認 modal 內須顯示目標 id 全文，避免封鎖錯誤對象。
- 破壞性按鈕與一般按鈕須在視覺上區隔（danger 色），且不可放置於緊鄰 dismiss 的位置。
- 所有 user 提供的內容（`detail`、Title、message `body`）一律以純文字渲染；`image_url` / `avatar_url` 僅用於 `<img src>`，不可作為連結 `href` 開啟新頁面（避免 `javascript:` 及 referrer 外洩）。
- 所有變更狀態的動作均由 backend 寫入 `admin_actions` 並記錄 log（`target: "admin"`），portal 無須自行記錄審計。

---

## 8. 環境與腳本

| 變數            | 說明                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `VITE_API_BASE` | API origin，**不含 `/v1`**。`.env.development` → `http://localhost:8080`；正式環境 → `https://api.kaului.com`（Vercel 環境變數，見 §8.1） |

| 指令          | 說明                            |
| ------------- | ------------------------------- |
| `pnpm dev`    | `vite --port 5174 --strictPort` |
| `pnpm build`  | Production build                |
| `pnpm test`   | Vitest                          |
| `pnpm format` | Prettier                        |

Backend 本地聯調：

```bash
# backend/.env
ADMIN_TOKEN=$(openssl rand -hex 32)          # ≥ 32 字元
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
```

### 8.1 部署（Vercel + `https://portal.kaului.com`）

純靜態 SPA，部署於 Vercel，正式網址為 `https://portal.kaului.com`。

| 項目              | 設定                                                                                                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework preset  | Vite；Build `pnpm build`；Output `dist`                                                                                                                                                   |
| Production branch | `main`（push 即部署）                                                                                                                                                                     |
| Domain            | 於 Vercel project 新增 `portal.kaului.com`；DNS 新增 `CNAME portal → cname.vercel-dns.com`（或 Vercel 指示的值）；憑證由 Vercel 自動簽發                                                   |
| 環境變數          | `VITE_API_BASE=https://api.kaului.com`（Production）。Vite 於 **build time 內嵌**，修改後須 redeploy。`ADMIN_TOKEN` **絕不**放入 Vercel env（portal 為純前端，token 由營運人員登入時輸入） |
| Backend           | `ALLOWED_ORIGINS` 加入 `https://portal.kaului.com`（§2.3），重啟 backend 後生效                                                                                                           |
| Preview           | `*.vercel.app` 不在 allow-list 內，無法連通 backend（預期行為，見 §2.3）；preview 僅用於查看靜態畫面                                                                                       |

`vercel.json`（放置於 repo 根目錄）：

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; img-src 'self' data: https://img.eservice-hk.net; connect-src 'self' https://api.kaului.com; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        },
        { "key": "Referrer-Policy", "value": "no-referrer" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Robots-Tag", "value": "noindex, nofollow" }
      ]
    }
  ]
}
```

- `rewrites` 讓 `/reports/:id` 等深層連結於重新整理時不會 404。Vercel 會優先提供 `dist` 內實際存在的檔案（`/assets/*`），其餘才 fallback。
- `style-src 'unsafe-inline'` 是 HeroUI / Tailwind runtime style 常見的需求；若實測後不需要，則應移除。
- Evidence 圖片 host 以 backend 實際的 `IMG_URL_PREFIX` 為準（`https://img.eservice-hk.net/upload/`），如有其他 host，須補入 `img-src`。
- 新增 `robots.txt`（`Disallow: /`）作為雙重保險。

**外層保護**：Vercel 靜態站沒有 basic auth。真正的保護是 `ADMIN_TOKEN` 加上 backend 的 per-IP 失敗限流（§2.1）。可選的加強措施：Vercel Deployment Protection / Firewall 自訂規則（可用範圍視方案而定，上線前須於 dashboard 確認）。由於 portal 為公開網址，**登入頁的錯誤訊息不可洩漏多餘資訊**（§4.2 已分流 404/401/429，屬可接受範圍）。

---

## 9. 測試

- **Unit（Vitest + RTL）**：
  - `ApiError` 正規化（含 `Retry-After`、`details.field`）。
  - `sessionStore`：login 成功 / 各錯誤分流、logout 清除 `sessionStorage`。
  - Evidence 渲染：reverse 順序、`null` evidence、空 messages、image kind。
  - ActionBar：非 open 不顯示操作、banned target 停用 Ban、`note` > 200 字被攔截。
  - Dismiss 回傳非 `dismissed` 狀態時顯示「已被處理」。
- **Mock**：使用 MSW 或 axios adapter mock `/v1/admin/*`；response 形狀可參考 `backend/tests/admin.rs` 的 fixture。
- **E2E（Playwright，對真實 backend）**：
  1. 啟動 backend（`ADMIN_TOKEN` 已設定）、以 `POST /auth/device` 建立兩個帳號、以 `POST /v1/reports` 建立舉報。
  2. Portal 登入 → 看到隊列 → 開啟詳情並看到 evidence → dismiss → 隊列中該筆消失。
  3. 再建立舉報 → ban → 確認 target `status=banned`、其 open report 全數結案、以 target token 呼叫 `/v1/me` 回傳 `403 ACCOUNT_BANNED`。
  4. unban → `status=active`。
  5. 以錯誤 token 連續嘗試 11 次 → 第 11 次起回傳 `429`，其後即使使用正確 token 亦回傳 `429`（驗證 §2.1）。
- **手動**：不設定 `ADMIN_TOKEN` → login 顯示「後台未啟用」。

---

## 10. Backend 缺口與建議（portal 無法完成的事項）

以下項目須 backend 新增 endpoint 後才能實作；**MVP 不受阻塞**，但營運一段時間後會成為痛點：

| #   | 缺口                                 | 影響                                                   | 建議                                                                          |
| --- | ------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 1   | 沒有 `GET /admin/users` 列表 / 搜尋  | 只能憑 id 查詢用戶，須依賴舉報頁跳轉                   | 新增 keyset 列表，可依 `status`、`open_reports` 排序                          |
| 2   | 沒有「某 target 的所有 report」查詢  | 用戶頁看不到歷史舉報；累犯判斷僅能依靠 `total_reports` 數字 | `GET /admin/reports?target=<id>`                                              |
| 3   | 無法讀取 `admin_actions`             | 看不到誰在何時 ban / unban 過，以及備註內容            | `GET /admin/actions?user_id=`                                                 |
| 4   | `ReportItem` 沒有 reporter 摘要      | 無法判斷 reporter 是否濫用舉報                         | 加入 `reporter.status` / reporter 舉報次數                                    |
| 5   | Failed job 沒有 retry / 清除         | 看得到失敗，但須登入 server 處理                       | 視需要新增 `POST /admin/jobs/{id}/retry`                                      |
| 6   | Admin 未納入 OpenAPI                 | portal 型別須手動維護，容易與 backend 脫節             | 依 Phase 6 §12 第 8 項：另行產出獨立的 `openapi-admin.json`，portal 再 `gen:api` |
| 7   | 單一共用的 `ADMIN_TOKEN`             | 沒有個人審計（`admin_actions` 不記錄操作者）           | 多 admin 超出 Phase 5 範圍，留待日後                                          |

---

## 11. 實作階段（Implementation Phases）

每個 phase 皆為可獨立 merge、可獨立驗收的切片。順序存在依賴關係，不可跳過。每次修改程式碼後僅執行 Prettier（`pnpm format`），不執行 ESLint / type check（見全域規範）。

```
P0 前置 ─► P1 骨架+登入 ─► P2 舉報列表 ─► P3 舉報詳情 ─► P4 處理動作 ─┐
                                                                    ├─► P7 收尾
                                          P5 用戶頁（依賴 P1、P4 ConfirmModal）─┤
                                          P6 Health（僅依賴 P1）────────────────┘
```

P5、P6 之間沒有依賴，可以對調或並行。

### P0 前置：Backend 聯調環境（0.25 日）

不撰寫 portal 程式碼，先處理外部條件，否則 P1 起就會受阻。

- backend `.env` 設定 `ADMIN_TOKEN`（≥ 32 字元），並於 `ALLOWED_ORIGINS` 加入 `http://localhost:5174`（§2.3、§8）。
- 以 curl 驗證：`GET /v1/admin/metrics` 帶正確 token 回傳 `200`；瀏覽器 preflight（`OPTIONS`）帶 `Authorization` 可通過。
- 準備 seed 資料：以 `POST /auth/device` 建立兩個帳號，並以 `POST /v1/reports` 建立至少 1 筆有聊天紀錄的舉報、1 筆沒有聊天紀錄的舉報。

**驗收**：curl 可讀取 metrics；兩筆 report（有 / 沒有 evidence messages）皆存在；CORS preflight 不報錯。

### P1 骨架 + 登入（0.75 日）

**範圍**

- Vite + React + TS 專案初始化：`App.tsx` → `app.tsx`、`export const App`；安裝 HeroUI、Tailwind、Less、`react-router`、`axios`、`zustand`、Vitest + RTL；`pnpm dev` = `vite --port 5174 --strictPort`。
- `.env.example`、`.env.development`；`VITE_API_BASE` 缺失時啟動即 throw（§5.1）。
- `api/errors.ts`（`ApiError`：status、code、details、requestId、retryAfter）、`api/client.ts`（Bearer、錯誤正規化、登入後遇 `401` 清除 session）、`api/types.ts`（§3.2 全部型別）。
- `session/sessionStore.ts`：token 僅存放於 `sessionStorage`、`login()` / `logout()`（§5.2）。
- `router.tsx` + `RequireAuth`（保留 `redirect`）、`AdminShell`（header：登出、user id 查詢框；查詢框先預留位置，P5 才接線）。
- `i18n/` 骨架（`zh-Hant`，書面語）。
- `/login`：以 `GET /admin/metrics` 探測；`404` / `401` / `429`（倒數並停用按鈕）/ 網絡錯誤分流；自第 5 次失敗起顯示提示（§4.2）。

**交付**：可登入、可登出，未登入時被導向 `/login`；其餘 route 暫時為空頁。

**驗收**

- 手動：不設定 `ADMIN_TOKEN` →「後台未啟用」；錯誤 token →「令牌不正確」；連續嘗試 11 次 → `429` 倒數，期間即使使用正確 token 亦被拒絕。
- Vitest：`ApiError` 正規化（含 `Retry-After`、`details.field`）；`sessionStore` 各分流及 logout 清除 `sessionStorage`。
- 以 DevTools 確認 token 不在 `localStorage` / cookie / URL 中。

### P2 舉報列表（0.5 日）

**範圍**

- `api/endpoints/reports.ts`：`listReports`（`status`、`before`、`limit`）。
- 共用元件：`StatusChip`、`ReasonChip`、`IdTag`（id 縮寫 + 點擊複製全文）、`TimeText`（絕對 + 相對）。
- `/reports`：Open / All tab、表格（§4.3 欄位、`target.open_reports ≥ 3` 標紅）、keyset「載入更多」（`has_more=false` 時隱藏）、重新整理、空狀態、錯誤卡（顯示 `X-Request-Id`）。
- 點擊 row → `/reports/:id`（P3 才有此頁，此時可先以 404 佔位）。

**驗收**

- 手動：建立超過 50 筆 open report 以驗證分頁（或暫時調低 `limit`）；切換 tab 時不殘留舊資料；斷網時顯示錯誤卡 + 重試。
- Vitest：tab 切換時 refetch、「載入更多」以最後一項的 `id` 作為 `before`、`has_more=false` 時隱藏按鈕。

### P3 舉報詳情 + Evidence（0.75 日）

**範圍**

- `getReport`（含 `evidence`）。
- `/reports/:id`：Header、Detail（純文字）、Target 卡（連結至 `/users/:id`）、Evidence（§4.4 第 4 點）：Title、頭像（`referrerPolicy="no-referrer"`、`loading="lazy"`、失敗時顯示佔位圖）、聊天樣式 messages（**reverse 為舊→新**、依 `sender_id` 分兩側）、圖片縮圖點擊放大、`evidence == null` 與 `messages` 為空兩種提示、快照提醒條。
- 已結案的 report 顯示唯讀結果及 `resolved_at`。
- `404` →「舉報不存在」+ 返回列表。

**驗收**

- 手動：有 / 沒有聊天紀錄的兩筆 report 均顯示正確；含 `<script>`、HTML 字元的 `detail` / `body` 原樣以文字顯示。
- Vitest：Evidence 渲染——reverse 順序、`null` evidence、空 messages、`kind=image`。

### P4 處理動作（0.75 日）

**範圍**

- `dismissReport`、`banFromReport`（一律使用 `report/{id}/ban`，§3.1）。
- `ConfirmModal`（通用，P5 重用）：顯示目標 id 全文、副作用清單（§3.1 Ban 副作用 +「Ban 局限」提示）。
- `ReportDetail/ActionBar.tsx`：僅於 `status=open` 時顯示；備註欄（≤ 200 字計數，超出則攔截送出，`details.field=note` 時標紅）；Dismiss（次要）、Ban（danger，位置與 Dismiss 分開）；target 已為 `banned` → Ban 停用並顯示提示。
- 送出期間所有按鈕停用；不做 optimistic update。
- Idempotent 處理：Dismiss 回傳 `200` 但 `status !== "dismissed"` → toast「此舉報已被處理」並顯示最新狀態。
- 成功後顯示 toast，返回 `/reports` 並 refetch。
- `404` @ ban →「用戶已刪除或不存在，無法操作」並 refetch（§6）。

**驗收**

- 手動（對真實 backend）：dismiss → 列表中消失；ban → target 變為 `banned`、其他 open report 全數變為 `actioned`、以 target token 呼叫 `/v1/me` 回傳 `403 ACCOUNT_BANNED`；連點兩次不會重複送出。
- Vitest：非 open 不顯示操作、banned target 停用 Ban、`note` > 200 被攔截、Dismiss 回傳非 `dismissed` 時顯示「已被處理」。

### P5 用戶頁（0.5 日）

**範圍**

- `api/endpoints/users.ts`：`getUser`、`banUser`、`unbanUser`。
- `/users/:id`：`AdminUser` 全部欄位、狀態 chip、絕對 + 相對時間；`active` → Ban、`banned` → Unban、`deleted` → 無操作；重用 `ConfirmModal`（unban 確認內須註明「不會恢復 match / hello / push subscription」）。
- `404` →「用戶不存在或已刪除」。
- 接通 `AdminShell` 全域 user id 查詢框及頁頂查詢框（輸入前先 trim，空值不送出）。
- 「此用戶的舉報」連結**不實作**（§10 缺口 2），可放置停用狀態的提示。

**驗收**

- 手動：ban → unban 來回操作，狀態及 chip 正確更新；查詢不存在的 id 時顯示 `404` 文案；Unban 確認框內有「不會恢復」提示。

### P6 Health（0.5 日）

**範圍**

- `api/endpoints/metrics.ts`、`jobs.ts`。
- `/health` Metrics 卡：概覽 / DB / Jobs / Rate limited（§4.6 標紅標黃規則；`rate_limited_total` **依 key 動態渲染**；`oldest_ready_age_ms` 為 null 時顯示「—」）。
- 每 15 秒自動 refresh，`document.hidden` 時暫停，回到前景時立即補抓一次；另設手動刷新按鈕。
- Failed jobs 表（`limit=50`、`last_error` 截斷 + 可展開），純唯讀。
- 自動 refresh 遇到 `401` → 停止輪詢（避免消耗失敗額度，§5.2）。

**驗收**

- 手動：切換離開 tab 後 Network 沒有新 request，切回後即時補抓；以 mock 塞入一個 limiter key 以驗證動態渲染；`sqlite_busy_total > 0` / `failed_total > 0` 時標紅。
- Vitest：閾值顏色邏輯、null 顯示、動態 key 渲染。

### P7 收尾（0.75 日）

**範圍**

- 新增 `vercel.json`（SPA rewrites + 安全 headers，§8.1）及 `public/robots.txt`。
- 對照 §6 錯誤處理表逐行檢查並補漏（`429` 全域 toast、已登入時 `401` 的 toast「登入已失效」）。
- 閒置 30 分鐘自動登出（可選）。
- Playwright E2E：依 §9 的 5 個場景。
- 所有 UI 文案統一檢視並集中至 `i18n/`；執行 `pnpm format`。
- Vercel 部署（§8.1）：連接 GitHub repo、設定 `VITE_API_BASE`、綁定 `portal.kaului.com` 及 DNS、backend 的 `ALLOWED_ORIGINS` 加入 `https://portal.kaului.com` 並重啟。

**驗收**：§9 E2E 全數通過；§6 每一行均有對應的手動或自動驗證；於 `https://portal.kaului.com` 登入成功，CSP 下圖片及 API call 正常，且 console 無違規報錯；深層連結（如 `/reports/<id>`）重新整理不會 404；`curl -I` 可見 §8.1 的全部 headers。

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

比舊版估算（3.5 日）多出 1.25 日：主要是補上 P0 聯調、Evidence 渲染，以及 Vitest / E2E 的實際工時。
