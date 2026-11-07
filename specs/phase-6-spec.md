# Phase 6 Spec：系統健康（Health）

上游：`portal-spec.md` §11 P6（並引用 §3.2、§4.6、§5.1、§5.2、§6）、`ui-spec.md` §7.5、§8、§9、§10。預估 **0.5–0.75 日**（原估 0.5 日，加上輪詢規矩與 Failed jobs 展開測試後貼近上限）。依賴：P1（`AdminShell`、`apiClient`、`getMetrics`、`ErrorCard`、`TimeText`）。與 P5 無依賴。

**這是全 portal 唯一一個「自動發請求」的頁面，也是第一個純唯讀的 phase。** 目標：

1. `/health` 實頁：Metrics 四張卡（概覽 / DB / Jobs / 限流）＋ Failed jobs 表。
2. 輪詢規矩：每 15 秒自動 refresh、分頁隱藏即暫停、回前景立即補抓、`401` / `429` 不硬撐、不重疊請求。
3. 閾值標示（紅 / 黃）與動態 limiter key 渲染。
4. Metrics 與 Failed jobs **各自獨立**處理載入與錯誤。

---

## 1. 前置條件

| 項目           | 要求                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| P1 已完成      | `AdminShell`（nav 已有「系統健康」）、`/health` 路由（目前為 `pages.health` 空頁）、`apiClient`、`getMetrics`、`AdminMetrics` 型別 |
| 現有元件       | `ErrorCard`（含 `onRetry`、`X-Request-Id`、`429` 倒數）、`TimeText`（`mode="both"`）、`formatRelativeTime`                    |
| Backend 運行中 | `ADMIN_TOKEN`、`ALLOWED_ORIGINS` 已設（P0）；`GET /admin/metrics`、`GET /admin/jobs/failed` 可用                              |
| Seed           | 不需要用戶 / 舉報 seed。要驗收 Failed jobs 表與 `failed_total` 紅色，需要手動往 `jobs_failed` 插入 1–3 筆（見 §12 手動項）       |
| 不需要         | 改 backend code；retry / 清除 failed job；`/health`（liveness）、`/readyz` 探測；圖表 / 歷史曲線（`portal-spec.md` §10 缺口 5） |

**本 phase 只讀，不改動任何 backend 資料。**

---

## 2. 範圍

**做**

- `api/endpoints/jobs.ts`：`getFailedJobs`；`api/endpoints/metrics.ts`：沿用現有 `getMetrics`（不改簽名，登入探測仍依賴它）。
- `hooks/usePolling.ts`：通用輪詢 hook（§5）。
- `lib/formatUptime.ts`、`lib/healthRules.ts`（§6）。
- `pages/Health/`：`index.tsx`、`useMetrics.ts`、`useFailedJobs.ts`、`MetricCard.tsx`、`OverviewCard.tsx`、`DbCard.tsx`、`JobsCard.tsx`、`RateLimitCard.tsx`、`HistRows.tsx`、`FailedJobsTable.tsx`、`FailedJobRow.tsx`、`UpdatedAt.tsx`（§4、§7）。
- i18n 文案（§9）、`mockApi` fixture（§11.1）、Vitest（§11）。

**不做**：見 §14。

---

## 3. API 層

### 3.1 `api/endpoints/jobs.ts`

```ts
export function getFailedJobs(limit?: number): Promise<FailedJobsResponse>;
```

- `GET /admin/jobs/failed`，`params: {limit}`；預設 `limit = 50`（`FAILED_JOBS_LIMIT` 常數，放在此檔）。
- `api/types.ts` 加 `export interface FailedJobsResponse { items: FailedJobItem[]; }`（`FailedJobItem` P1 已定義）。
- 使用 store token，不帶 `skipAuthRedirect`：已登入後 `401` 由 interceptor 自動登出。
- 不 retry、不快取；背景輪詢也不加 retry（見 §5）。

### 3.2 `getMetrics`

沿用 P1：無 `options` 時使用 store token。**不得修改**其帶 `options.token` 的登入探測行為。

### 3.3 回應事實（實作須依此，不可假設）

- Backend 計數器（`*_total`、histogram）為**行程內記憶體**，**server 重啟即歸零**；因此 `uptime_secs` 是判讀所有累計值的前提，須放在最顯眼處。
- `rate_limited_total` 的 key 集合由 backend 決定（目前含 `api`、`admin_fail`），**不可寫死**；value 預期為非負整數，渲染前以 `Number.isFinite` 防呆，不合法者顯示「—」且**不 throw**。
- `GET /admin/jobs/failed` 依 `failed_at DESC, id DESC` 排序；backend 有 retention sweep 會刪掉過期的 dead-letter，所以 **`jobs.failed_total`（累計）可能大於表內筆數**，兩者不需相等（見 §7.4 提示）。
- Hist 的 percentile 是 **bucket 上限**（粗略值，最大為 1000 之後歸 `+Inf` 桶，由 `max` 補足），僅供看趨勢，不可顯示成精確值（不加小數）。
- `/admin/metrics` 成功不計入 `admin_fail`；本頁自動輪詢不會消耗失敗額度，**但若 token 已失效，持續打會累積 `401`**，故 `401` 必須立即停止輪詢（§5.3）。

---

## 4. 頁面

### 4.1 檔案

```
src/hooks/usePolling.ts          # 新增
src/lib/formatUptime.ts          # 新增
src/lib/healthRules.ts           # 新增
src/pages/Health/
├─ index.tsx                     # 修改：頁面骨架
├─ useMetrics.ts                 # 新增
├─ useFailedJobs.ts              # 新增
├─ MetricCard.tsx                # 新增：卡片外殼（標題 + children）
├─ OverviewCard.tsx              # 新增
├─ DbCard.tsx                    # 新增
├─ JobsCard.tsx                  # 新增
├─ RateLimitCard.tsx             # 新增
├─ HistRows.tsx                  # 新增：p50 / p95 / p99 / max 一組
├─ FailedJobsTable.tsx           # 新增
├─ FailedJobRow.tsx              # 新增：單列 + last_error 展開
└─ UpdatedAt.tsx                 # 新增：「更新於 N 秒前」
```

一個 file 一個 component；hook 用 `export function useXxx`；`lib/` 內為非 component，camelCase 檔名。

### 4.2 版面（沿用 `ui-spec.md` §7.5）

```
系統健康                         更新於 5 秒前   [重新整理]
┌概覽────────┐┌DB──────────────┐┌Jobs────────────┐┌限流──────────┐
│ 運行時間   ││ 寫入等待(ms)  ││ ready   0      ││ api       0   │
│ SSE 連線 12││ p50 p95 p99 max││ locked  0      ││ admin_fail 2 ⚠│
│ 5xx   0    ││ busy 0         ││ failed  0      ││ …(動態)      │
│            ││                ││ 最舊 —  latency││               │
└────────────┘└────────────────┘└────────────────┘└──────────────┘
失敗任務（dead-letter）
┌ kind  嘗試  最後錯誤（截斷）   失敗時間 ──────────────────────────┐
```

- 卡片格：`grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4`；每張卡 `rounded-2xl border border-black/15 bg-white p-4`，標題 `text-sm font-semibold`（`h2`）。
- 數值：`font-mono tabular-nums text-right`；label `text-black/60`。
- 頁頂標題列：`h1`（`health.title`）左，右側 `UpdatedAt` + 「重新整理」按鈕。`< sm` 換行置於標題下。
- Metrics 區與 Failed jobs 區是**兩個獨立區塊**，各自有 loading / error / ready 狀態（§4.3）。

### 4.3 兩個區塊的狀態

兩個 hook 回傳同型：`{data, phase, error, updatedAt, stale, refresh}`。

| `phase`   | 呈現                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------- |
| `loading` | 首次載入：骨架（Metrics：4 張骨架卡；Failed jobs：3 列骨架）                                              |
| `error`   | **首次載入就失敗**：`ErrorCard` + 重試（`refresh`），顯示 `X-Request-Id`；輪詢**繼續**（§5.4）            |
| `ready`   | 顯示數據。若最近一次更新失敗（`stale = true`），**保留舊數據**並於區塊頂部顯示一條 `role="status"` 提示（§4.4） |

- **已有數據後的失敗不切到 `error`**：保留舊數據、不閃爍（`ui-spec.md` §7.5），僅加 stale 提示。
- Metrics 失敗不影響 Failed jobs，反之亦然。

### 4.4 Stale 提示

`stale = true` 時，區塊頂部一條灰色細條（樣式沿用 `ConfirmModal` 內 `note` 的 zinc 變體）：「更新失敗，目前顯示的是 {n} 秒前的數據」。

- `{n}` 隨 `UpdatedAt` 的計時同步增加。
- 下一次輪詢成功即自動消失。
- 不重複 `ErrorCard`、不彈 toast（避免每 15 秒一次的噪音）。

### 4.5 `UpdatedAt`

- 顯示「更新於 N 秒前」（`< 60` 秒）、「更新於 N 分鐘前」（`>= 60` 秒）。`updatedAt` 為**最近一次成功**回應的 client 時間（`Date.now()`），不使用 `server_now`（避免 client / server 時鐘差造成負數）。
- 每秒重算（`setInterval` 1 秒，unmount 清除）；分頁隱藏時**不需**暫停（開銷可忽略，且回前景時數字不會跳）。
- 尚無成功回應（`updatedAt === null`）→ 不顯示。
- 以 Metrics 的 `updatedAt` 為準（Failed jobs 與其同節奏刷新，不另顯示第二個時間）。

### 4.6 「重新整理」按鈕

- 同時觸發 Metrics 與 Failed jobs 的 `refresh()`。
- 任一請求 in-flight 時按鈕停用並顯示 `Loader2` spinner（防連點；與 §5.2 的「不重疊請求」一致）。
- 手動 refresh 失敗的呈現規則同 §4.3（有數據 → stale 提示；無數據 → `error`）。
- 按鈕不 reset 15 秒計時（簡單可預測；計時器照常走）。

---

## 5. 輪詢規矩（`hooks/usePolling.ts`）

```ts
export function usePolling(
    task: () => Promise<void>,
    options: {intervalMs: number; enabled: boolean}
): {trigger: () => Promise<void>};
```

行為：

1. **首次**：mount 時立即執行一次 `task`（`enabled` 為 true 時）。
2. **週期**：每 `intervalMs` 執行 `task`；用 `setInterval`，unmount / `enabled=false` 時清除。
3. **不重疊**：上一次 `task` 未完成（ref 旗標）時，週期觸發 **略過**，不排隊；`trigger()`（手動）同樣受此旗標保護，in-flight 時直接 return 現有 promise。
4. **分頁隱藏暫停**：監聽 `visibilitychange`。`document.hidden` → 清除計時器；回到前景 → **立即補抓一次**再重啟計時器。隱藏期間不發任何請求。
5. **`enabled` 切換**：變 false 即清除並移除監聽；變 true 視同 mount（立即抓一次）。
6. `task` 以 ref 持有最新版本，避免 `intervalMs` 不變時因 closure 過期而用舊 state，且**不要**把 `task` 放進 effect deps 造成重設計時器。

### 5.1 `intervalMs`

`HEALTH_POLL_MS = 15_000`，常數放 `pages/Health/index.tsx` 頂部（或 `lib/healthRules.ts`），測試以 fake timers 推進。

### 5.2 過期回應

- `useMetrics` / `useFailedJobs` 各自以 `requestSeq` 丟棄過期回應（與 `useReport` / `useUser` 同型），unmount 時 `requestSeq++`，**unmount 後不 setState**（無 React warning）。
- 不用 `AbortController`（理由同 `useReport`：client 把 cancel 轉成 `ApiError`，看起來像真故障）。

### 5.3 `401`

- 已登入後 `401`：interceptor 已登出並導向 `/login`，頁面隨即 unmount。**hook 另須在 `error.status === 401` 時自行停止輪詢**（`enabled=false`），防止登出與 unmount 之間的空窗再打出請求（會累積失敗額度，`portal-spec.md` §5.2）。
- 不顯示本區塊的 `ErrorCard` / stale 提示（頁面即將離開）。

### 5.4 `429` 與其他錯誤

- `429`：記錄 `pausedUntil = Date.now() + (error.retryAfter ?? 60) * 1000`；在此之前，**週期觸發略過**（手動 `trigger` 仍可嘗試）。到期後下一個 tick 自然恢復。**不另外 toast**（全域 `429` toast 屬 P7）；有數據 → stale 提示，無數據 → `ErrorCard`（內含 `429` 倒數）。
- `5xx` / 網絡錯誤：照常下一個 tick 重試，**不加 backoff**（15 秒本身已很疏）。
- 所有錯誤皆不 `console.log` 完整 error 物件。

---

## 6. 純函式（`lib/`）

### 6.1 `formatUptime(secs: number): string`

| 條件           | 輸出範例      |
| -------------- | ------------- |
| `>= 86400`     | `3 日 4 時`   |
| `>= 3600`      | `4 時 12 分`  |
| `>= 60`        | `12 分鐘`     |
| `< 60`         | `不足 1 分鐘` |

- 向下取整；省略為 0 的下級單位**不省略**（`3 日 0 時` 保持原樣，避免閱讀時以為漏資料）。
- 負值 / 非有限數 → 「—」，不 throw。
- 文案走 `health.uptime*`（§9），`formatUptime` 內不放硬編碼中文。

### 6.2 `healthRules.ts`

```ts
export type Severity = "ok" | "warn" | "danger";

export function dbBusySeverity(total: number): Severity;            // > 0 → danger
export function failedJobsSeverity(total: number): Severity;        // > 0 → danger
export function limiterSeverity(key: string, total: number): Severity; // key=api|admin_fail 且 > 0 → warn；其他 key → ok
```

- 非有限數一律 `ok`（防呆，不誤報）。
- **未知 limiter key 不標色**（只有 spec 明定的兩個 key 有語意；其他只列出數值）。
- 顏色以 `Severity → class` 對照表集中放一處（`MetricValue` 的樣式表，見 §7.6），不在各卡散寫。

---

## 7. 各卡內容

### 7.1 `OverviewCard`（概覽）

| label       | 值                                                          |
| ----------- | ----------------------------------------------------------- |
| 運行時間    | `formatUptime(uptime_secs)`（置頂、字級稍大，因其為判讀其餘累計值的前提） |
| SSE 連線    | `sse.connections`                                           |
| 5xx 總數    | `http.responses_5xx_total`（**不標色**：spec 未定義閾值，不自創） |

卡片底部灰字小注：「累計值於 server 重啟後歸零」（`health.countersResetNote`），僅此卡出現一次，其他卡不重複。

### 7.2 `DbCard`

- 標題下一行：「寫入等待（ms）」→ `HistRows`（`db.write_wait_ms`）。
- `sqlite_busy_total`：`dbBusySeverity` → `danger` 時紅色 + 「⚠」。

### 7.3 `JobsCard`

| label       | 值                                                                       |
| ----------- | ------------------------------------------------------------------------ |
| ready       | `jobs.ready`                                                             |
| locked      | `jobs.locked`                                                            |
| failed      | `jobs.failed_total`；`failedJobsSeverity` → `danger` 時紅色 + 「⚠」      |
| 最舊待處理  | `oldest_ready_age_ms === null` → 「—」；否則人類可讀（`< 1000` → `N ms`；`< 60000` → `N.N 秒`；其餘 → `N 分 N 秒`） |
| latency     | `HistRows`（`jobs.latency_ms`）                                          |

- 「最舊待處理」的格式化放 `lib/formatDuration.ts`（非 component，camelCase），純函式 + 測試。

### 7.4 `RateLimitCard`（限流）

- 依 `rate_limited_total` 的 key **動態**逐行渲染：`font-mono` key + 右側數值。
- key 以字母序排序（排序後渲染，使順序不隨 JSON 欄位順序跳動）。
- `limiterSeverity` 決定樣式與 tooltip：
  - `api > 0`：黃色 + 「⚠」，tooltip（`title`）「檢查 PWA 有冇輪詢」。
  - `admin_fail > 0`：黃色 + 「⚠」，tooltip「有人撞 token」。
- **Tooltip 不是唯一資訊來源**：觸控與鍵盤看不到 `title`，因此黃色行同時帶有 `⚠` 與 `sr-only` 說明文字（同一句話），不依賴 `title`。
- 沒有任何 key → 灰字「冇限流紀錄」（`health.noRateLimits`）。

### 7.5 `HistRows`

```ts
{hist: Hist}
```

- 一行四格：`p50 / p95 / p99 / max`，每格 label 小字、數值 `font-mono tabular-nums`，單位 ms 於卡片小標「（ms）」說明，**不逐格附單位**。
- `count` 放整組的 `title`（「樣本數 N」）；`count === 0` 時四格顯示「—」（避免 `0 0 0 0` 被誤讀成「超快」）。
- 數值原樣顯示，不加小數、不千分位。

### 7.6 數值樣式（集中）

`Severity → class`：

| Severity | 樣式                                              |
| -------- | ------------------------------------------------- |
| `ok`     | 預設文字                                          |
| `warn`   | `text-amber-700` + 「⚠」（`aria-hidden`）+ `sr-only` 說明 |
| `danger` | `text-red-700 font-bold` + 「⚠」（`aria-hidden`）+ `sr-only` 說明 |

- 顏色**必定**搭配「⚠」與文字，不只靠顏色（`ui-spec.md` §7.5、§8）。
- `sr-only` 文字：danger →「異常」、warn →「注意」（`health.severityDanger` / `severityWarn`）。

### 7.7 `FailedJobsTable` / `FailedJobRow`

- 語意 `<table>`；欄：`kind`（`font-mono`）、`attempts`（右對齊）、`last_error`、`failed_at`（`<TimeText mode="both" />`）。
- **純唯讀，不放任何按鈕**（除下方的展開 / 收起）。
- `last_error`：
  - `null` →「—」。
  - 預設 `line-clamp-2`；僅在**實際溢出**時才顯示「展開」按鈕（`scrollHeight > clientHeight`，於 `useLayoutEffect` 量測，`last_error` 變動時重量）。
  - 展開後 `font-mono text-xs whitespace-pre-wrap break-words`，按鈕文字變「收起」，`aria-expanded` 同步。
  - 純文字渲染（backend 字串，不可 `dangerouslySetInnerHTML`）。
  - jsdom 無版面，`scrollHeight` / `clientHeight` 皆 0 → 測試須以 `Object.defineProperty` stub（§11）。
- **展開狀態以 job `id` 為 key 保存在列元件內**；輪詢刷新時列以 `key={item.id}` 保持穩定，**展開中的列不會被收起**。
- 列表筆數 < `jobs.failed_total` 時，表頭下方顯示灰字「僅顯示最近 {n} 筆（累計失敗 {total}）」，說明兩者可能不等（§3.3）。`failed_total` 為 0 且表為空時不顯示。
- 空狀態：「冇失敗任務」（`health.noFailedJobs`）。
- 表外層 `overflow-x-auto`（`< sm` 橫向捲動）。

---

## 8. 無障礙

- 自動刷新**不搶焦點**、不重設捲動位置、不重新 mount 已展開的列。
- 「更新於」不使用 `aria-live`（每秒變動會洗版）；**stale 提示**才用 `role="status"`（變化少且有意義）。
- 「重新整理」按鈕有可見文字；pending 時 `aria-busy`。
- 每張卡是 `<section aria-labelledby>`，標題 `h2`。
- 展開 / 收起按鈕有 `aria-expanded`、`aria-controls`（指向該列的 `last_error` 元素 id，id 含 job id，需對 `:` 等字元安全，用 `useId`）。
- 色彩規則見 §7.6。`text-black/60` 不再更淡（`ui-spec.md` §8）。

---

## 9. i18n 文案

`i18n/zhHant.ts`（component 內**零硬編碼中文**，繁體書面語；沿用 `ui-spec.md` §7.5 已定的粵語提示字眼）：

```ts
// 移除
pages.health                         // "系統健康（P6）"（`pages` 若因此變空物件，整個移除）

// 新增
health: {
    title: "系統健康",
    refresh: "重新整理",
    updatedSecondsAgo: "更新於 {n} 秒前",
    updatedMinutesAgo: "更新於 {n} 分鐘前",
    staleNote: "更新失敗，目前顯示的是 {n} 秒前的數據",
    overviewTitle: "概覽",
    dbTitle: "DB",
    jobsTitle: "Jobs",
    rateLimitTitle: "限流",
    uptime: "運行時間",
    sseConnections: "SSE 連線",
    responses5xx: "5xx 總數",
    countersResetNote: "累計值於 server 重啟後歸零",
    writeWait: "寫入等待（ms）",
    sqliteBusy: "SQLite busy",
    jobsReady: "ready",
    jobsLocked: "locked",
    jobsFailed: "failed",
    oldestReady: "最舊待處理",
    latency: "latency（ms）",
    histCount: "樣本數 {n}",
    rateLimitApiHint: "檢查 PWA 有冇輪詢",
    rateLimitAdminFailHint: "有人撞 token",
    noRateLimits: "冇限流紀錄",
    severityWarn: "注意",
    severityDanger: "異常",
    uptimeDaysHours: "{d} 日 {h} 時",
    uptimeHoursMinutes: "{h} 時 {m} 分",
    uptimeMinutes: "{m} 分鐘",
    uptimeUnderMinute: "不足 1 分鐘",
    durationMs: "{n} ms",
    durationSeconds: "{n} 秒",
    durationMinutesSeconds: "{m} 分 {s} 秒",
    failedJobsTitle: "失敗任務（dead-letter）",
    colKind: "kind",
    colAttempts: "嘗試",
    colLastError: "最後錯誤",
    colFailedAt: "失敗時間",
    expand: "展開",
    collapse: "收起",
    noFailedJobs: "冇失敗任務",
    failedJobsTruncated: "僅顯示最近 {n} 筆（累計失敗 {total}）",
    unavailable: "—",
},
```

- 「—」用 `health.unavailable`，不在 component 內寫字面量。
- 用詞統一（`ui-spec.md` §10）；`kind` / `ready` / `locked` / `failed` / `latency` 為 backend 欄位名，保持英文以便與 log / DB 對照。

---

## 10. 安全要求

- 全頁唯讀：不發任何 `POST` / `PUT` / `DELETE`；不顯示 job `payload`（backend 本就不回，前端也不猜測欄位）。
- `last_error`、`kind` 為 backend 字串，**一律純文字渲染**；不作為 `href`、不 `dangerouslySetInnerHTML`。
- 輪詢**不得**在 token 失效後繼續（§5.3），避免累積失敗額度與被 IP 限流鎖住（`portal-spec.md` §5.2）。
- 不做背景重試（超出 §5 規定的週期輪詢以外）；`401` 後不以舊 token 重試。
- 不 `console.log` token、回應、完整 error 物件。
- 不把 metrics / failed jobs 寫入 URL、storage、log。
- `last_error` 可能含內部資訊：僅顯示於已通過 `ADMIN_TOKEN` 驗證的頁面，**不提供「複製」或匯出**（MVP 不需要，也避免外流）。

---

## 11. 測試（Vitest + RTL）

### 11.1 測試基建

`src/test/mockApi.ts`：

- 既有 `metricsFixture` 不動；加 `metricsReply(overrides?)` 輔助（合併 `metricsFixture`，方便覆蓋 `db.sqlite_busy_total`、`jobs.failed_total`、`http.rate_limited_total`）。
- 加 `failedJobFixture(overrides?: Partial<FailedJobItem>)`（遞增 id、`kind: "push.send"`、`attempts: 5`、`last_error: "boom"`）與 `failedJobsReply(items)`。

輪詢測試用 `vi.useFakeTimers()`；`document.hidden` / `visibilitychange` 以 `Object.defineProperty(document, "hidden", …)` + `document.dispatchEvent(new Event("visibilitychange"))` 模擬；記得 `afterEach` 還原。

### 11.2 案例

| 範圍                   | 案例                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jobs` endpoint        | `GET /admin/jobs/failed` 帶 `limit=50`；可覆寫 `limit`；`401` 已登入 → logout                                                                                                                 |
| `formatUptime`         | `90061 → 1 日 1 時`；`3720 → 1 時 2 分`；`125 → 2 分鐘`；`30 → 不足 1 分鐘`；`0 → 不足 1 分鐘`；負值 / `NaN` → 「—」                                                                          |
| `formatDuration`       | `250 → 250 ms`；`2500 → 2.5 秒`；`125000 → 2 分 5 秒`；`null` 由呼叫端處理                                                                                                                    |
| `healthRules`          | `dbBusySeverity(0/1)`；`failedJobsSeverity(0/3)`；`limiterSeverity("api",1)=warn`、`("admin_fail",1)=warn`、`("api",0)=ok`、`("other",99)=ok`；`NaN` → ok                                      |
| `usePolling`           | mount 立即一次；每 15 秒再一次；in-flight 時 tick 被略過（只發 1 個）；`hidden` 後推進 60 秒**無請求**；回前景**立即補抓一次**且恢復週期；`enabled=false` 停止；unmount 清除計時器與監聽        |
| `useMetrics`           | 首次失敗 → `error`；之後輪詢成功 → `ready`；**已有數據後失敗 → 保留舊數據且 `stale = true`**，下次成功清除；`401` → 停止輪詢（之後推進計時器無新請求）；`429` → 在 `Retry-After` 內略過週期 tick；過期回應被丟棄；unmount 後無 setState warning |
| `useFailedJobs`        | 同上；且與 Metrics **互不影響**（一邊 500，另一邊正常顯示）                                                                                                                                    |
| `OverviewCard`         | uptime 人類可讀；SSE、5xx 顯示；5xx 不標色                                                                                                                                                    |
| `DbCard`               | `busy = 0` 一般；`busy > 0` 紅色 + 「⚠」 + `sr-only`「異常」；`count = 0` 的 Hist 顯示「—」                                                                                                   |
| `JobsCard`             | `failed_total > 0` 紅色；`oldest_ready_age_ms = null` 顯示「—」；有值時格式化                                                                                                                  |
| `RateLimitCard`        | **動態 key**：塞入 `{api: 0, admin_fail: 2, custom_x: 7}` → 三行都渲染、字母序；`admin_fail` 黃 + 「有人撞 token」；`custom_x` 不標色；空物件 → 「冇限流紀錄」；非有限數值 → 「—」不 throw          |
| `FailedJobsTable`      | 欄位與 `TimeText`（絕對 + 相對）；`last_error = null` → 「—」；**溢出才顯示展開**（stub `scrollHeight`）；展開 / 收起切換與 `aria-expanded`；**輪詢刷新後展開中的列仍展開**；空狀態；筆數 < `failed_total` 顯示截斷提示；`last_error` 內含 `<b>` 以純文字顯示 |
| 頁面                   | 載入 → 四張卡 + 表；Metrics 失敗 → `ErrorCard` + 重試成功，Failed jobs 區塊不受影響；「更新於」隨時間遞增；手動「重新整理」同時刷新兩邊且 in-flight 時按鈕停用；stale 提示出現與消失；`AdminShell` 的「系統健康」nav 於 `/health` 高亮 |
| 回歸                   | P1–P5 既有測試全綠；`Login` 的探測（`getMetrics({token})`）行為不變                                                                                                                           |

頁面測試以 `createMemoryRouter`（`/health` + `/login` 路由）包起來；handler 以 `url` 分流。

---

## 12. 驗收標準（Definition of Done）

**自動**

- [ ] `pnpm test` 全綠（含 P1–P5 既有測試）。
- [ ] `pnpm build` 成功。
- [ ] `pnpm format` 後 `git diff` 無格式變動（留意 `pnpm format` 會掃 `design/`，如有變動須還原）。

**手動（對 P0 真 backend）**

- [ ] **載入**：打開 `/health`，四張卡與 Failed jobs 區都出現；uptime 為人類可讀；Hist 顯示整數、無小數。
- [ ] **自動 refresh**：DevTools Network 每 15 秒一個 `GET /admin/metrics` 與一個 `GET /admin/jobs/failed`；「更新於」每秒遞增、refresh 後歸零。
- [ ] **分頁隱藏**：切到別的 tab 一分鐘 → Network **沒有**新請求；切回後**立即**出現一組請求，之後恢復 15 秒節奏。
- [ ] **不重疊**：DevTools 設 Slow 3G，持續觀察 → 不會出現兩個同 endpoint 的請求同時在飛；手動「重新整理」連點只發 1 組，期間按鈕停用。
- [ ] **閾值**：
  - `sqlite_busy_total > 0` 或 `jobs.failed_total > 0` → 紅色 + 「⚠」（如無法自然產生，以單元測試覆蓋並於 PR 註明；`failed_total` 可由下方插入 failed job 後等待 backend 計數，若計數器不隨 DB 插入變動則以單測覆蓋）。
  - `admin_fail`：於**另一個無痕視窗**的登入頁故意輸錯令牌 **1–2 次**（**不要超過 3 次**，同 IP 每分鐘失敗 10 次會被鎖），回 `/health` 於下一次 refresh 看到 `admin_fail > 0` 黃色 + 「有人撞 token」。
  - `oldest_ready_age_ms` 為 `null` 時顯示「—」。
- [ ] **動態 key**：以瀏覽器 DevTools 的 Local Overrides（或暫時 mock）在回應 `rate_limited_total` 加一個假 key → 該行出現、不標色、順序為字母序；移除後消失。
- [ ] **Failed jobs**：以 sqlite 往 `jobs_failed` 插入 1–3 筆（欄位 `id, kind, payload, attempts, last_error, created_at, failed_at`；其中一筆 `last_error` 為多行長字串、一筆為 `NULL`）→ 下一次 refresh 出現；長錯誤預設 2 行 + 「展開」，短錯誤與 `NULL` **無**展開鈕；展開後下一次自動 refresh **仍保持展開**；表為最新在上。完成後把插入的測試資料刪除。
- [ ] **錯誤與 stale**：停掉 backend → 已有數據下，下一次 refresh 後出現「更新失敗…」提示且舊數據**不消失、不閃爍**；重啟 backend → 提示在下一次 refresh 自動消失。首次載入時停掉 backend → 該區塊 `ErrorCard` + 重試；重啟後按重試成功。
- [ ] **獨立錯誤**：（可用 DevTools 封鎖 `jobs/failed` 的 URL）Metrics 正常顯示，Failed jobs 區單獨顯示 `ErrorCard`；反之亦然。
- [ ] **`401`**：於另一個分頁登出前，先改壞 sessionStorage 內 token（DevTools）→ 下一次 refresh 後被導向 `/login`；Network 在跳轉後**不再**有 `/admin/*` 請求。
- [ ] **響應式**：`>= 1280` 四欄、`768–1279` 兩欄、`< 768` 單欄；`< 640` Failed jobs 表可橫向捲動、標題列換行。
- [ ] **鍵盤**：Tab 可到「重新整理」與每個「展開」；Enter / Space 可切換；focus ring 可見。
- [ ] `grep` component 內無硬編碼中文（含「—」「⚠」以外的字面量）。
- [ ] DevTools：token 不在 URL；無 `console.log` 輸出；本頁只有 `GET /admin/metrics`、`GET /admin/jobs/failed`，**沒有任何非 GET 請求**。

**Repo**

- [ ] `git status` 只見預期檔案（§13）。

---

## 13. 交付物（預期變動檔案）

```
新增
  src/api/endpoints/jobs.ts(+ .test.ts)
  src/hooks/usePolling.ts(+ .test.tsx)
  src/lib/formatUptime.ts(+ .test.ts)
  src/lib/formatDuration.ts(+ .test.ts)
  src/lib/healthRules.ts(+ .test.ts)
  src/pages/Health/useMetrics.ts
  src/pages/Health/useFailedJobs.ts
  src/pages/Health/MetricCard.tsx
  src/pages/Health/OverviewCard.tsx
  src/pages/Health/DbCard.tsx
  src/pages/Health/JobsCard.tsx
  src/pages/Health/RateLimitCard.tsx
  src/pages/Health/HistRows.tsx
  src/pages/Health/FailedJobsTable.tsx
  src/pages/Health/FailedJobRow.tsx
  src/pages/Health/UpdatedAt.tsx
  src/pages/Health/Health.test.tsx          # 頁面 + hooks + 各卡整合測試
修改
  src/api/types.ts                          # + FailedJobsResponse
  src/pages/Health/index.tsx                # 空頁 → 實頁
  src/i18n/zhHant.ts                        # §9
  src/test/mockApi.ts                       # + metricsReply / failedJobFixture / failedJobsReply
```

---

## 14. 風險與處理

| 風險                                           | 徵兆                                                  | 處理                                                                                           |
| ---------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `401` 後仍在輪詢                               | 登出後 Network 仍見 `/admin/*` 請求，累積失敗額度被鎖 | hook 見 `401` 即 `enabled=false`；專屬測試（§5.3、§11）                                          |
| 隱藏分頁仍在打請求                             | 背景分頁持續耗 backend                                | `visibilitychange` 清計時器；專屬測試；手動驗收                                                  |
| 請求重疊 / 回應亂序                            | 慢網絡下舊數據蓋掉新數據；請求堆積                    | in-flight 旗標略過 tick + `requestSeq` 丟棄過期回應（§5.1、§5.2）                               |
| 每 15 秒閃爍或跳版                             | 刷新時整塊骨架 / 展開的列被收起                       | 已有數據時保留舊數據；列 `key={id}`、展開狀態在列內；專屬測試                                    |
| 把 `failed_total` 與表筆數當成同一個數         | 營運以為資料遺失                                      | 截斷提示說明兩者可不等（§7.7）；§3.3 記錄原因                                                    |
| Server 重啟使累計值歸零被誤判為「問題消失」    | `failed_total` / `admin_fail` 突然變 0                 | 概覽卡把 uptime 置頂 + 小注「累計值於 server 重啟後歸零」（§7.1）                                |
| 寫死 limiter key                               | backend 新增 limiter 後 portal 看不到                 | 動態渲染 + 字母序；專屬測試（§7.4）                                                              |
| 只靠顏色 / `title` 傳達異常                    | 色盲、觸控、鍵盤使用者看不到                          | 一律「⚠」+ `sr-only` 文字；tooltip 僅為輔助（§7.4、§7.6）                                        |
| Hist percentile 被當精確值                     | 營運據此做精細判斷                                    | 不加小數；§3.3 註明為 bucket 上限；僅供趨勢                                                      |
| `count = 0` 顯示 `0 0 0 0`                     | 被誤讀為「延遲極低」                                  | `count === 0` 顯示「—」（§7.5）                                                                  |
| 展開鈕偵測在 jsdom 失效                        | 測試永遠看不到展開鈕                                  | 測試 stub `scrollHeight` / `clientHeight`（§7.7、§11）                                           |
| 驗收誤觸發 IP 失敗限流                         | 手動測 `admin_fail` 連輸太多次被鎖                    | 驗收項限定 **1–2 次**（§12）                                                                     |
| 驗收往 DB 插入的測試 failed job 殘留           | 之後 `failed_total` / 表長期有雜訊                    | 驗收最後刪除插入的資料（§12）                                                                    |
| `429` 時仍硬打                                 | 加劇限流                                              | `pausedUntil` 略過週期 tick（§5.4）；專屬測試                                                    |

---

## 15. 不屬於本 phase

- Retry / 清除 failed job、顯示 job payload（backend 無對應能力，`portal-spec.md` §10 缺口 5）。
- 歷史曲線 / 趨勢圖 / 警報通知 / 閾值可設定（MVP 只做當下快照與固定閾值）。
- `/health`（liveness）、`/readyz` 探測。
- 全域 `429` / `401` toast、閒置自動登出、CSP / `vercel.json`、Playwright E2E（P7）。
- 用戶頁 / 舉報頁的任何改動。
- 輪詢間隔使用者可調、暫停 / 恢復開關（MVP 固定 15 秒）。
- `server_now` 的顯示或時鐘偏差校正。
- 多 admin / 操作者審計（`portal-spec.md` §10 缺口 7）。
