# Phase 2 Spec:舉報列表

上游:`portal-spec.md` §11 P2(並引用 §3、§4.3、§5.1、§6)、`ui-spec.md` §4、§5、§7.1。預估 **0.5 日**。依賴:P1(client、session、shell、i18n 已落地)+ P0 seed(R1、R2)。

**呢個 phase 係第一個「真數據頁」。** 目標:

1. `/reports` 完整可用:Open / All tab、表格、keyset「載入更多」、重新整理、loading / empty / error 三態。
2. 建立後續 phase 重用嘅共用元件:`StatusChip`、`ReasonChip`、`IdTag`、`TimeText`、`ErrorCard`。
3. 定好「頁面自己 fetch、唔做全局快取」嘅資料流模式(`portal-spec.md` §5),P3 / P5 / P6 照抄。

---

## 1. 前置條件

| 項目             | 要求                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------- |
| P1 已完成        | 可登入、`apiClient`、`ApiError`、`mockApi`(`src/test/mockApi.ts`)可用                        |
| Backend 運行中   | `ADMIN_TOKEN`、`ALLOWED_ORIGINS` 已設(P0)                                                    |
| Seed             | `.seed.local.md` 有 R1、R2(2 個 open report)                                                 |
| 分頁驗收         | 用 R1 + R2 配 `PAGE_SIZE = 2` 驗(`phase-0-spec.md` §2.3.2 做法 A),**唔使**造 50+ 個帳號       |
| 唔需要           | 改 backend code、`/reports/:id` 實頁(P3;P1 佔位頁已存在,row 連過去唔會 404)                  |

---

## 2. 範圍

**做**

- `api/endpoints/reports.ts`:只加 `listReports`(`getReport`、`dismissReport`、`banFromReport` 屬 P3 / P4)。
- 共用元件 5 個(§4)+ `useCountdown` hook(§4.6)。
- `/reports` 頁(§5)。
- i18n 文案(§6)、`mockApi` 小擴充(§8.1)、Vitest(§8)。

**唔做**:見 §11。

---

## 3. API 層

### 3.1 `api/types.ts`

P1 已有 `ReportItem`。新增:

```ts
export interface ReportListResponse {
    items: ReportItem[];
    has_more: boolean;
}
```

列表 `items[].evidence` 缺失或 `null`(`portal-spec.md` §3.1),型別已係 optional,列表頁**唔讀** `evidence`。

### 3.2 `api/endpoints/reports.ts`

```ts
export type ReportStatusFilter = "open" | "all";

export interface ListReportsParams {
    status: ReportStatusFilter;
    before?: string; // id of the last loaded item (keyset cursor)
    limit?: number; // 1..100, backend default 50
}

export function listReports(params: ListReportsParams): Promise<ReportListResponse>;
```

- `GET /admin/reports`,用 axios `params`。`status` **一律明確帶上**(唔靠 backend 預設);`before` / `limit` 為 `undefined` 就唔送(axios 會自動略過 `undefined`)。
- 用 store token(唔帶 `skipAuthRedirect`),所以已登入後 `401` 會由 interceptor 自動登出(P1 §4.3)。
- 唔做 retry、唔做 client 端排序(`portal-spec.md` §4.3:backend 固定新→舊)。

---

## 4. 共用元件

每個元件一個檔(`components/Xxx.tsx`),`export const`,文案全部經 `t()`。視覺細節以 `ui-spec.md` 為準,下面只寫**行為合約**同本 phase 要補嘅決定。

### 4.1 `StatusChip`

- Props:`{kind: "report" | "user"; value: ReportStatus | UserStatus}`(`ui-spec.md` §4.1 顏色 / 文案表)。
- 未知值 → 顯示原字串 + zinc,**唔 throw**。文案來自 `common.status.*`,未知值唔經 `t()`(`t()` 取唔到會 throw)。
- 顏色邏輯只喺呢個檔,其他地方唔好內嵌。

### 4.2 `ReasonChip`

- Props:`{value: ReportReason}`;`underage` 紅色,其餘 neutral;未知值同 `StatusChip` 處理。

### 4.3 `IdTag`

- Props:`{id: string; full?: boolean}`(`full` 供 P3 / P5 顯示全文;本 phase 只用短版)。
- **短版顯示 UUID 最後 8 個字元,唔係前 8 個。** 原因:backend 嘅 ID 係 UUIDv7,前 8 hex 係 timestamp 高位,約每 65 秒先變一次,seed 腳本一次過開嘅 4 個帳號(同一批舉報)前綴會完全一樣,肉眼分唔到。最後 8 hex 屬隨機部分,區分度足夠。
    - 呢個同 `ui-spec.md` §4.3「前 8 字元」同範例 `0192f3a1` 有出入,**本 phase 一併改 `ui-spec.md` §4.3 同 §7.1 示意圖**(§10 清單)。
    - 非 UUID 形狀(長度 < 8)→ 原樣顯示。
- 點擊複製全文(`navigator.clipboard.writeText`),按鈕文字短暫變「已複製」1.5 秒;複製失敗(拒絕 / 無 API)→ 靜默,唔報錯、唔變「已複製」。
- Hover tooltip 顯示全文。`<button type="button">`,`aria-label`「複製 ID」。
- **`onClick` 要 `stopPropagation`**(同 row 跳轉並存,見 §5.3)。
- 1.5 秒 timer 喺 unmount 要清,連按唔好疊 timer(單一 `ref`)。

### 4.4 `TimeText`

- Props:`{value: number; mode?: "relative" | "both"}`(epoch **毫秒**;預設 `relative`)。
- 規則完全跟 `ui-spec.md` §4.4:相對粒度、未來時間顯示「剛剛」、`<time dateTime>`、唔實時 tick。
- 絕對時間格式 `YYYY-MM-DD HH:mm:ss`,瀏覽器本地時區;用 `Intl.DateTimeFormat`,**唔**引入 dayjs / date-fns。
- 格式化邏輯抽成非 Component 函數 `formatRelativeTime(value, now)`、`formatAbsoluteTime(value)`(`src/lib/formatTime.ts`,`function` 宣告),方便單獨測試,`now` 由參數傳入而唔係喺函數內 `Date.now()`。

### 4.5 `ErrorCard`

- Props:`{error: ApiError; onRetry?: () => void; title?: string}`。
- 標題預設按 `error.status` 分流(`portal-spec.md` §6):`null` →「連唔到 server」;`429` →「請求過多」;其他 →「伺服器錯誤,請稍後再試」。`title` 有值就覆蓋。
- 有 `requestId` 就顯示 `Request ID:…`(`font-mono`),旁邊可點擊複製(複用 `IdTag` 唔啱,獨立細按鈕即可)。
- `429`:顯示「N 秒後再試」並每秒倒數(§4.6),倒數期間「重試」禁用;`retryAfter == null` 時 fallback `60`(同 P1 §5.3)。
- **唔顯示 backend 原始 `message` / `details`**(同登入頁一致)。
- `role="alert"`;樣式同 `/login` 錯誤 `Alert`(red-50 / red-200 / red-700)。

### 4.6 `hooks/useCountdown.ts`

```ts
export function useCountdown(seconds: number | null): number; // remaining seconds, 0 when done or null
```

- `seconds` 變化(包括由 `null` → 數字)即重新起算;單一 `setInterval(1000)`,effect 一律有 cleanup(StrictMode 安全,P1 §9)。
- 只供 `ErrorCard` 用。**唔改 `Login`**(已通過驗收,避免回歸);兩邊重複嘅倒數邏輯留待 P7 收尾時再決定是否合併。

---

## 5. `/reports` 頁

### 5.1 檔案

```
src/pages/Reports/
├─ index.tsx            # 頁面:標題、tabs、重新整理、狀態切換
├─ ReportsTable.tsx     # 表格 + 骨架行
├─ useReportList.ts     # 資料流 hook(export function useReportList)
```

每個 file 一個 component;`PAGE_SIZE` 定義喺 `useReportList.ts` 並 export(測試用),預設 `50`。

### 5.2 URL 同 tab

- Tab 狀態只存喺 URL:`/reports?status=open|all`。用 `useSearchParams`。
- 缺失或非法值(例如 `?status=foo`)→ 當 `open`,**唔**即時改寫 URL(避免多一個 history entry)。
- 切 tab = `setSearchParams({status}, {replace: false})`,令返回鍵可以返上個 tab。
- 預設 tab 時唔強制補 `?status=open`。
- 直接連 `/reports?status=all` refresh 後保持 All。

### 5.3 表格

欄位 / 對齊 / 互動以 `ui-spec.md` §7.1 為準,補充:

| 欄       | 資料                                    | 備註                                                             |
| -------- | --------------------------------------- | ---------------------------------------------------------------- |
| 時間     | `created_at` → `TimeText`               |                                                                  |
| 原因     | `reason` → `ReasonChip`                 |                                                                  |
| 被舉報人 | `target.id` → `IdTag` + `StatusChip`    | chip 用 `kind="user"`、`target.status`                           |
| 累犯     | `target.open_reports`                   | `≥ 3` → 紅色粗體 + 紅色 chip,**同時**有數字(色彩唔係唯一訊號)  |
| 舉報人   | `reporter_id` → `IdTag`                 |                                                                  |
| 狀態     | `status` → `StatusChip`(`kind="report"`) |                                                                  |

**累犯閾值**:`REPEAT_OFFENDER_THRESHOLD = 3`,具名常數放 `ReportsTable.tsx` 頂部(P3 Target 卡亦要用,屆時再抽出去 `lib/`)。

**整行可點**

- 用真 `<a>`(react-router `Link`)令中鍵 / Cmd+Click 開新 tab:喺「時間」欄放 `Link to={`/reports/${id}`}`,用 stretched-link(`before:absolute before:inset-0`,`<tr>` 加 `relative`)令整行可點,hover `bg-black/5`、`cursor-pointer`。
- 行內 `IdTag` 要高於 stretched-link(`relative z-10`),點擊只複製、唔跳轉(§4.3 嘅 `stopPropagation` 係第二道保險)。
- 實作以 HeroUI v3 `Table` 當前文件為準;如 `Table` 唔容許 row 內放 `relative` 定位,可改用語意 `<table>` + HeroUI class,**要求只係**:真 `<table>`、row 有真 `<a>`、鍵盤 Tab 可到達連結。
- 連結 `aria-label` 唔放 user 內容;用「開啟舉報 {shortId}」。

**窄屏**:表格外包 `overflow-x-auto`,儲存格 `whitespace-nowrap`。

### 5.4 資料流:`useReportList(status)`

```ts
export function useReportList(status: ReportStatusFilter): {
    items: ReportItem[];
    hasMore: boolean;
    phase: "loading" | "refreshing" | "ready" | "error";
    error: ApiError | null; // first-page / refresh failure
    loadMoreError: ApiError | null; // append failure, items kept
    isLoadingMore: boolean;
    refresh: () => void;
    loadMore: () => void;
};
```

- **切 tab(`status` 變)**:**先清空** `items`、`hasMore`、兩個 error,`phase = "loading"`,再 fetch 第一頁。唔可以殘留上個 tab 內容(`ui-spec.md` §5、P2 驗收)。
- **重新整理**:`phase = "refreshing"`(**保留**舊 `items`、右上 spinner),成功後以第一頁**整批取代**;失敗 → `phase = "error"` 同 `error`,**保留**舊 items 唔清(列表區頂部顯示 `ErrorCard`,舊表格仍可見)。
- **載入更多**:`before = items.at(-1).id`、`limit = PAGE_SIZE`;成功 → append;失敗 → 只設 `loadMoreError`,**保留**已載入嘅行,表格底 inline 錯誤 +「重試」(重試 = 用同一個 cursor 再 call)。`isLoadingMore` 期間再點無效(防雙擊,同一時間只有一個 append 在飛)。
- **has_more**:直接用 backend 回傳值;`false` 就隱藏按鈕,**唔**顯示「冇更多」。
- **防舊回應覆蓋新狀態**(切 tab 太快、refresh 與 loadMore 重疊):hook 內以遞增嘅 `requestSeq` ref 標記每次「第一頁 / refresh」請求;回應返嚟時 `seq` 唔係最新就丟棄。loadMore 回應同樣檢查發出時嘅 `seq`,若期間已 refresh / 切 tab 即丟棄。
    - 唔用 `AbortController`:`apiClient` interceptor 會將 cancel 都正規化成 `ApiError`,取消同真失敗分唔開,序號法簡單啲。
- unmount 後回應唔 setState(同樣靠 `requestSeq`:cleanup 時 bump)。
- **唔做**自動輪詢(MVP,`portal-spec.md` §4.3)、唔做 optimistic update、唔寫入任何全局 store 或 storage。
- 去重:keyset 分頁保證唔重複,但 append 時仍以 `id` 做一次 `Set` 過濾(防 backend 邊界 bug 令 React key 重複而爛版面)。
- `loadMore` 觸發條件:`phase` 為 `ready`、`hasMore`、冇 `isLoadingMore`。

### 5.5 頁面狀態

| 狀態                      | 呈現                                                                              |
| ------------------------- | --------------------------------------------------------------------------------- |
| Loading(首次 / 切 tab)  | 表頭 + 5 行骨架;tabs、重新整理按鈕仍可用                                          |
| Refreshing                | 保留舊表格;「重新整理」按鈕 `isPending`;**唔**閃骨架                              |
| Empty(open)             | 置中 `text-black/60`:「冇待處理舉報」                                             |
| Empty(all)              | 「未有任何舉報」                                                                  |
| Error(首次 / 切 tab)    | 列表區位置顯示 `ErrorCard` + 重試;tabs 仍可用,按 tab 會重新 fetch                 |
| Error(refresh 失敗)     | 舊表格上方 `ErrorCard` + 重試                                                     |
| 載入更多失敗              | 表格底 inline 錯誤文字 +「重試」,已載入嘅行保留                                   |
| Ready                     | 表格 +(`hasMore`)置中 outline「載入更多」,載入中 `isPending`                      |

- 不用 emoji(跟 `ui-spec.md` §5,覆蓋 `portal-spec.md` §4.3 嘅「🎉」可選項)。
- `429` 全局 toast 屬 P7;本 phase 靠 `ErrorCard` 倒數處理列表頁嘅 `429`。
- 頁標題 `<h1 tabIndex={-1}>`,mount 時 focus 一次(`ui-spec.md` §5 Focus 管理);切 tab 唔重 focus。

### 5.6 標題列

```
舉報隊列                                         [重新整理]
[ 待處理 ] [ 全部 ]
```

- 「重新整理」:`phase === "loading"` 時禁用(已經喺度載入);其餘時間可點。
- Tabs 用 HeroUI `Tabs`,受控於 URL(§5.2);每個 tab 有 `aria-label`。

---

## 6. i18n 文案

新增 key(`i18n/zhHant.ts`,component 內**零硬編碼中文**):

```ts
reports: {
    title: "舉報隊列",
    tabOpen: "待處理",
    tabAll: "全部",
    tabsLabel: "舉報狀態篩選",
    refresh: "重新整理",
    loadMore: "載入更多",
    loadMoreFailed: "載入更多失敗",
    retry: "重試",
    emptyOpen: "冇待處理舉報",
    emptyAll: "未有任何舉報",
    colTime: "時間",
    colReason: "原因",
    colTarget: "被舉報人",
    colRepeat: "累犯",
    colReporter: "舉報人",
    colStatus: "狀態",
    openReport: "開啟舉報 {id}",
},
common: {
    copyId: "複製 ID",
    copied: "已複製",
    requestId: "Request ID:{id}",
    errorNetwork: "連唔到 server",
    errorRateLimited: "請求過多",
    errorRateLimitedRetry: "{seconds} 秒後再試",
    errorServer: "伺服器錯誤,請稍後再試",
    retry: "重試",
    status: {
        open: "待處理", dismissed: "已駁回", actioned: "已處置",
        active: "正常", banned: "已封鎖", deleted: "已刪除",
    },
    reason: {
        spam: "垃圾訊息", harassment: "騷擾", inappropriate: "不當內容",
        underage: "疑似未成年", other: "其他",
    },
    time: {
        justNow: "剛剛",
        minutesAgo: "{n} 分鐘前",
        hoursAgo: "{n} 小時前",
        daysAgo: "{n} 日前",
        both: "{absolute}({relative})",
    },
},
```

- 移除 `pages.reports`(「舉報隊列(P2)」佔位)。先 `grep` 確認冇其他引用(例如 `RequireAuth.test.tsx`),有就同步改。`pages.reportDetail`、`pages.user`、`pages.health` 保留(屬後續 phase)。
- `login.requestId`、`login.errorNetwork` 等 P1 key **唔搬**(唔回歸 Login);`common.*` 係新頁面用,重複文案可接受,P7 收尾統一。
- 用詞統一(`ui-spec.md` §10):封鎖 / 駁回 / 已處置 / 被舉報人 / 舉報人。

---

## 7. 安全要求

- 列表只顯示 id、enum、數字、時間,**冇 user 自由文字**(`detail` 屬 P3),本 phase 無 XSS 面;但 `IdTag` / `ErrorCard` 仍以純文字渲染,唔用 `dangerouslySetInnerHTML`。
- `before` cursor 只來自 backend 回傳嘅 `id`,唔接受 URL 參數注入(URL 只有 `status`,且做白名單校驗,§5.2)。
- 唔 `console.log` 回應內容、token、完整 error 物件(P1 §6 延續)。
- 列表請求用 store token;`401` 已登入 → interceptor 清 session 並導向 `/login`。頁面唔做任何背景重試(避免燒失敗額度,`portal-spec.md` §5.2)。

---

## 8. 測試(Vitest + RTL)

### 8.1 測試基建

`src/test/mockApi.ts` 擴充(向後兼容,P1 測試唔受影響):

- `RecordedRequest` 加 `params: Record<string, unknown>`(取自 `config.params`),因為 `listReports` 用 axios `params`,`url` 唔含 query。
- 新增 fixture `reportFixture(overrides?: Partial<ReportItem>): ReportItem` 同 `reportListReply(items, hasMore)`;fixture 形狀抄 `backend/tests/admin.rs`(`portal-spec.md` §3.2),`id` 用 UUIDv7 形狀字串。

### 8.2 案例

| 範圍                | 案例                                                                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listReports`       | 帶 `status`、`before`、`limit`;`before` 缺失時 `params` 冇 `before`;`401` 已登入 → 觸發 logout(經 interceptor)                                                                                  |
| `formatRelativeTime`| 剛好邊界:59 秒 → 剛剛;60 秒 → 1 分鐘前;59 分 → 59 分鐘前;23 時 → 23 小時前;29 日 → 29 日前;≥ 30 日 → 絕對日期;未來時間 → 剛剛                                                              |
| `IdTag`             | 短版顯示最後 8 字元;長度 < 8 原樣;點擊 `writeText` 收到全文;`writeText` reject 唔報錯、唔變「已複製」;1.5 秒後文字還原(fake timers);點擊 **唔**冒泡到父層 `onClick`                            |
| `StatusChip` / `ReasonChip` | 全部已知值文案正確;未知值顯示原字串且唔 throw;`underage` 帶紅色 class                                                                                                              |
| `ErrorCard`         | 網絡錯 / `429` / 5xx 三種標題;有 `requestId` 才顯示;`429` 倒數同「重試」禁用,歸零恢復(fake timers);**唔**顯示 backend `message`                                                                |
| `useReportList` / `Reports` | 首次 fetch 用 `status=open`;切 `all` → 先清空再 refetch 且 `params.status = "all"`;「載入更多」`before` = 最後一項 `id`、append、`has_more=false` 隱藏按鈕;load-more 失敗保留舊行並顯示 inline 重試,重試用同一 cursor;refresh 保留舊行直至回應;refresh 失敗保留舊行 + `ErrorCard`;**舊回應丟棄**:tab 快速切換,先發嘅慢回應後到,唔覆蓋新 tab 內容;`?status=foo` 當 `open`;累犯 `open_reports = 3` 有紅色標記、`2` 冇;空狀態兩種文案;row 有指向 `/reports/<id>` 嘅真 `<a href>` |

測試用 `MemoryRouter` / `createMemoryRouter` 包頁面,用 `mockApi` 控制回應時序(handler 回 pending promise 模擬慢回應)。

---

## 9. 驗收標準(Definition of Done)

**自動**

- [ ] `pnpm test` 全綠(含 P1 既有測試,證明冇回歸)。
- [ ] `pnpm build` 成功。
- [ ] `pnpm format` 後 `git diff` 冇格式變動。

**手動(對 P0 真 backend)**

- [ ] 登入後 `/reports` 見 R1、R2 兩行;欄位、chip、累犯數字正確。
- [ ] 臨時 `PAGE_SIZE = 2`、造第 3 個 report(或改 `1`):「載入更多」出現,點擊 append 且順序仍新→舊;`has_more=false` 後按鈕消失;**驗完還原 `PAGE_SIZE = 50`**。
- [ ] 切 All ↔ Open:唔殘留舊 tab 內容(即時清空 + 骨架);URL 隨 tab 變;refresh 保持 tab;返回鍵返上個 tab。
- [ ] Network 面板:快速連切 tab 5 次,最終畫面對應最後一個 tab。
- [ ] 重新整理:舊行唔閃走、按鈕轉 pending,完成後更新。
- [ ] 停咗 backend:首次載入顯示 `ErrorCard`「連唔到 server」+ 重試,tabs 仍可點;重啟 backend 按重試恢復。
- [ ] 用 `admin.sh` dismiss R2 後按重新整理:Open tab 唔再見 R2;All tab 見到且狀態「已駁回」。
- [ ] 點 row 去 `/reports/<id>`(P1 佔位頁);Cmd+Click / 中鍵開新 tab;點 `IdTag` 只複製(貼上驗證係完整 UUID)、唔跳頁。
- [ ] 純鍵盤:Tab 可行到 tabs、重新整理、每行連結,Enter 開啟。
- [ ] 1280 / 768 / 375 寬度:表格喺容器內橫向捲動,頁面本身冇橫向爆版。
- [ ] `grep` component 內冇硬編碼中文;`pages.reports` 已移除且冇殘留引用。
- [ ] DevTools 確認請求只帶 `status`(+ `before` / `limit`),token 冇出現喺 URL。

**Repo**

- [ ] `git status` 只見預期檔案(§10);`PAGE_SIZE` 已還原;冇 `console.log`。

---

## 10. 交付物(預期變動檔案)

```
新增
  src/api/endpoints/reports.ts
  src/components/{StatusChip,ReasonChip,IdTag,TimeText,ErrorCard}.tsx
  src/hooks/useCountdown.ts
  src/lib/formatTime.ts
  src/pages/Reports/{ReportsTable.tsx,useReportList.ts}
  以上各自 *.test.ts(x)
修改
  src/api/types.ts                 # + ReportListResponse
  src/pages/Reports/index.tsx      # 佔位 → 實頁
  src/i18n/zhHant.ts               # §6
  src/test/mockApi.ts              # §8.1
  specs/ui-spec.md                 # §4.3、§7.1 IdTag 短版改「最後 8 字元」
```

---

## 11. 風險與處理

| 風險                                                  | 徵兆                                         | 處理                                                                                      |
| ----------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 短 ID 用前 8 字元撞前綴                               | 多行顯示同一個 ID,肉眼分唔到邊個             | 用最後 8 字元(§4.3);全文靠 tooltip / 複製                                                  |
| 切 tab / refresh 舊回應覆蓋新數據                     | 顯示同 tab 唔對應嘅內容                      | `requestSeq` 序號丟棄(§5.4),有專屬測試                                                     |
| Append 期間新舉報令列表位移                           | 重複 / 漏行                                  | keyset by `id DESC` 本身穩定;append 再按 `id` 去重;要睇新增嘅按「重新整理」                |
| HeroUI v3 `Table` 唔支援 row 內 `<a>` / 定位          | 整行點擊失效或中鍵唔得                       | 退回語意 `<table>` + HeroUI class(§5.3),硬性要求只係真 `<a>`                                |
| `429` 時 `Retry-After` 被 CORS 擋                     | `retryAfter = null`                          | `ErrorCard` fallback 60 秒(同 P1)                                                          |
| 驗分頁改咗 `PAGE_SIZE` 忘記還原                        | 正式 build 每頁得 2 行                       | DoD 專列一項;`git diff` 檢查                                                               |
| `RequireAuth.test.tsx` 等引用 `pages.reports` 佔位文案 | 移除 key 後測試報 Missing i18n key           | 移除前 `grep`,同步更新(§6)                                                                |
| 未知 enum 值(backend 新增 reason / status)            | 畫面白屏                                     | Chip 全部有 fallback(§4.1、§4.2),有測試                                                    |

---

## 12. 唔屬於本 phase

- `getReport`、`/reports/:id` 實頁、Evidence(P3)。
- `dismissReport`、`banFromReport`、`ConfirmModal`、Toast 系統(P4);列表頁處理動作後 refetch 嘅邏輯由 P4 返回 `/reports` 時自然觸發 mount fetch,本 phase 唔預留。
- User id 查詢框接線、`/users/:id`(P5)。
- 自動輪詢 / 新舉報提示(MVP 唔做)。
- 篩選 / 搜尋(按 reason、target 等):backend 只支援 `status`,`portal-spec.md` §10 缺口 2。
- 全局 `429` / `401` toast、`vercel.json`、E2E(P7)。
- 合併 `Login` 同 `ErrorCard` 重複嘅倒數邏輯(P7 再決定)。
