# Phase 3 Spec:舉報詳情 + Evidence

上游:`portal-spec.md` §11 P3(並引用 §3.1、§3.2、§4.4、§6、§7)、`ui-spec.md` §4.4、§5、§7.2。預估 **0.75 日**。依賴:P2(`StatusChip`、`ReasonChip`、`IdTag`、`TimeText`、`ErrorCard`、`mockApi` 已落地)+ P0 seed(R1 有聊天、R2 冇聊天)。

**呢個 phase 係第一個「詳情頁」,而且只讀。** 目標:

1. `/reports/:id` 完整可用:Header、Detail、Target 卡、Evidence(含聊天、頭像、圖片 lightbox)、loading / 404 / error 三態。
2. 已結案(`dismissed` / `actioned`)report 顯示唯讀結果同 `resolved_at`。
3. 為 P4 預留版面:右欄 sticky、`open` 狀態下操作卡位置留空,P4 直接掛入去,唔使改版面。
4. 定好「user 內容一律純文字、圖片 URL 只入 `<img src>`」嘅渲染規矩(`portal-spec.md` §7),P5 照抄。

---

## 1. 前置條件

| 項目           | 要求                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| P2 已完成      | `/reports` 可用、row 連到 `/reports/:id`;共用元件、`ErrorCard`、`useCountdown`、`mockApi` 可用                |
| Backend 運行中 | `ADMIN_TOKEN`、`ALLOWED_ORIGINS` 已設(P0)                                                                     |
| Seed           | `.seed.local.md` 有 R1(A 舉報 B,`evidence.messages.length == 3`)同 R2(C 舉報 D,`messages == []`)            |
| 唔需要         | 改 backend code;`dismissReport` / `banFromReport` / `ConfirmModal` / Toast(P4);`/users/:id` 實頁(P5,連結去 P1 佔位頁唔會 404) |

**Seed 局限**:P0 seed 腳本只造文字訊息,**冇圖片訊息、冇 `avatar_url`、冇 90 日過期嘅 evidence**。呢三種情況靠 Vitest 覆蓋(§8),手動驗收唔強求。

---

## 2. 範圍

**做**

- `api/endpoints/reports.ts`:加 `getReport`(`dismissReport`、`banFromReport` 屬 P4)。
- `/reports/:id` 頁(§5),拆成 §5.1 嘅檔案。
- `lib/reportRules.ts`:由 `ReportsTable.tsx` 抽出 `REPEAT_OFFENDER_THRESHOLD`(P2 §5.3 預告嘅動作),列表同 Target 卡共用。
- i18n 文案(§6)、`mockApi` fixture 擴充(§8.1)、Vitest(§8)。

**唔做**:見 §11。

---

## 3. API 層

### 3.1 `api/types.ts`

**唔需要改。** `ReportItem`、`Evidence`、`EvidenceMessage` 已喺 P1 定義(`evidence?: Evidence | null`)。

### 3.2 `api/endpoints/reports.ts`

```ts
export function getReport(id: string): Promise<ReportItem>;
```

- `GET /admin/reports/${encodeURIComponent(id)}`。`id` 來自 URL param,**一律 encode**,唔信任。
- 用 store token(唔帶 `skipAuthRedirect`):已登入後 `401` 由 interceptor 自動登出(P1 §4.3)。
- **`404` 唔會登出**:interceptor 只處理 `401`(`portal-spec.md` §5.1:`/reports/{id}` 嘅 `404` 係「資源唔存在」)。
- 唔做 retry、唔做快取。

---

## 4. 共用邏輯

### 4.1 `lib/reportRules.ts`

```ts
export const REPEAT_OFFENDER_THRESHOLD = 3;
```

- 由 `ReportsTable.tsx` 搬出嚟,`ReportsTable` 改為 import。**行為零變動**,P2 測試必須仍然全綠。
- 非 Component 檔,camelCase 命名。

---

## 5. `/reports/:id` 頁

### 5.1 檔案

```
src/pages/ReportDetail/
├─ index.tsx                 # 頁面:返回連結、標題、狀態分流、版面
├─ useReport.ts              # 資料流 hook(export function useReport)
├─ ReportHeader.tsx          # Header 卡
├─ DetailCard.tsx            # 舉報說明
├─ TargetCard.tsx            # 被舉報人卡
├─ ResolvedCard.tsx          # 已結案唯讀結果
├─ EvidenceSection.tsx       # Evidence 區:info 條、Title、頭像、空狀態、聊天容器、lightbox
├─ EvidenceBubble.tsx        # 單則訊息
└─ SafeImage.tsx             # 受控 <img>:scheme 白名單、失敗佔位
```

每個 file 一個 component;`useReport` 係 hook,`export function`。

### 5.2 版面

跟 `ui-spec.md` §7.2:

- 桌面 `lg:grid-cols-3`:左 `lg:col-span-2` = Header → Detail → Evidence;右 1 欄 = Target 卡 + (已結案)`ResolvedCard`,外包 `lg:sticky lg:top-4 lg:self-start`。
- `< lg` 單欄,DOM 順序 = Header → Detail → Target → (操作 / 結果)→ Evidence。為咗做到,用 CSS `order` 或者兩個 grid 區塊 + `lg:contents` 都得,**要求只係**視覺順序符合上面,且鍵盤 Tab 順序同視覺順序一致。
- `open` 狀態:右欄只有 Target 卡。**P4 喺 Target 卡下面掛 `ActionCard`**,本 phase 唔渲染任何佔位元素 / 禁用按鈕。
- 頁頂:`← 返回舉報隊列`(`Link to="/reports"`;唔記住 tab,P4 之後再睇是否需要)。
- 頁標題 `<h1 tabIndex={-1}>`「舉報詳情」,mount 時 focus 一次(`ui-spec.md` §5 Focus 管理)。路由 id 變(罕見)唔重 focus。

### 5.3 各卡內容

**Header 卡(`ReportHeader`)**

- `ReasonChip` + `StatusChip(kind="report")`。
- 「建立時間」:`TimeText mode="both"`。
- `resolved_at != null` 時加「結案時間」,同樣 `mode="both"`。
- 完整 report id:`IdTag full`(`font-mono text-xs break-all`),方便對 server log。

**舉報說明(`DetailCard`)**

- `detail` 以 `whitespace-pre-wrap break-words` 純文字渲染(JSX 文字節點,**唔用 `dangerouslySetInnerHTML`**)。
- `null` 或 trim 後為空 →「(無說明)」`text-black/60`。

**Target 卡(`TargetCard`)**

- `IdTag full`(全文)、`StatusChip(kind="user")`、「待處理舉報」數字。
- `open_reports >= REPEAT_OFFENDER_THRESHOLD`:紅色粗體 + 紅色 chip,**同時有數字**(同 P2 §5.3)。
- 「查看用戶 →」`Link to={`/users/${target.id}`}`(P5 前去佔位頁)。連結 `aria-label` 唔放 user 內容。

**已結案結果(`ResolvedCard`,只喺 `status !== "open"` 顯示)**

| `report.status` | 呈現                                  |
| --------------- | ------------------------------------- |
| `dismissed`     | 「已駁回」+ 結案時間(`TimeText both`) |
| `actioned`      | 「已處置」+ 結案時間                  |

- 文案用 `StatusChip` + 一句說明;`resolved_at == null`(理論上唔會)→ 唔顯示時間行,唔 throw。
- 未知 `status`(backend 新增)→ 照 `StatusChip` fallback 顯示原字串,同樣當唯讀。
- **唔顯示 `note`**:backend 回應冇 `note`,審計記喺 `admin_actions`(`portal-spec.md` §7)。

### 5.4 Evidence(`EvidenceSection`)

**常駐 info 條**:「證據係舉報當刻 snapshot,唔會更新」(`role="note"`,同 `/login` expired 條嘅 zinc 樣式)。

**分流**

| 情況                    | 呈現                                                         |
| ----------------------- | ------------------------------------------------------------ |
| `evidence == null` / 缺 | 「證據已過保留期(90 日)被清除」;**唔**渲染 Title / 頭像 / 聊天區 |
| `messages.length == 0`  | Title / 頭像照常,聊天區位置顯示「雙方冇聊天紀錄」            |
| 有訊息                  | 聊天區                                                       |

**Title + 頭像**

- Title:`text-base`;`null` →「(無 Title)」。**純文字**。
- 頭像 48×48 圓形,用 `SafeImage`;`avatar_url == null` 或載入失敗 → 灰底人形 icon 佔位(`lucide-react` 嘅 `User`)。

**聊天**

- **前端 `reverse` 成舊→新**(backend 係新→舊)。**唔 mutate 原陣列**(`[...messages].reverse()`),唔做其他排序。
- 側別按 `sender_id`:
    - `=== report.reporter_id` → 靠左,`bg-black/5`,上方細字「舉報人」。
    - `=== report.target.id` → 靠右,白底 + `border-black/15`,上方細字「被舉報人」。
    - 兩者皆非(backend 資料異常)→ 靠左、zinc,細字「其他」,**唔 throw**。
- 每則底部 `TimeText`(`text-xs`,相對時間 + tooltip 絕對時間)。
- `kind="text"`:純文字,`whitespace-pre-wrap break-words`;`body` 為 `null` →「(空白訊息)」。
- `kind="image"`:縮圖(最大 `160×160`、`object-cover`、`rounded-lg`),用 `SafeImage`;**縮圖係 `<button type="button">`**,`aria-label`「放大圖片」,點擊開 lightbox。`image_url == null` →「圖片無法載入」佔位,**唔可點**。
- 未知 `kind`(backend 新增)→ 當文字,顯示 `body ?? "(空白訊息)"`,唔 throw。
- 容器 `max-h-[480px] overflow-y-auto`,**首次渲染後捲到底**(最新一則),用 `useEffect` 設 `scrollTop = scrollHeight`;圖片載入令高度變化唔重新捲(MVP)。
- 同一頁面只有**一個** lightbox(state 放喺 `EvidenceSection`),唔好每則訊息各自掛一個 Modal。

**Lightbox**

- HeroUI `Modal`(以官方當前文件為準),大圖 `max-h-[80vh] max-w-full object-contain`;Esc / 點 backdrop 關閉;關閉後 focus 返去觸發嘅縮圖(HeroUI / react-aria 預設行為,驗收時確認)。
- 大圖同樣用 `SafeImage`,失敗顯示「圖片無法載入」。
- 唔提供「開新分頁 / 下載」連結(見 §7)。

### 5.5 `SafeImage`

```ts
// Props
{src: string | null; alt: string; className?: string; fallback: React.ReactNode}
```

- 渲染 `<img src referrerPolicy="no-referrer" loading="lazy">`。
- **Scheme 白名單**:只接受 `https:` 同 `http:`(用 `new URL(src)` 解析,解析失敗當無效)。`javascript:`、`data:`、相對路徑等一律當無效 → 渲染 `fallback`。
- `onError` → 切去 `fallback`;`src` 變咗要重置錯誤狀態。
- `alt` 由呼叫方傳入(經 `t()`),唔放 user 內容。
- 唔將 `src` 放入任何 `href`。

### 5.6 資料流:`useReport(id)`

```ts
export function useReport(id: string): {
    report: ReportItem | null;
    phase: "loading" | "ready" | "notFound" | "error";
    error: ApiError | null; // phase === "error"
    reload: () => void;
};
```

- mount / `id` 變 → **先清空** `report`、`error`,`phase = "loading"`,再 fetch。唔可以殘留上一個 report(同 P2 §5.4 一致;`id` 變咗嗰一 render 唔好見到舊內容,做法同 P2:state 記住自己屬於邊個 `id`,唔符就當 loading)。
- 成功 → `phase = "ready"`。
- `ApiError.status === 404` → `phase = "notFound"`;其他錯誤 → `phase = "error"` + `error`。
- `reload()`:重新 fetch。**`ready` 時保留舊 `report`** 直至回應返嚟(P4 處理 `404 @ ban` 後 refetch 用,唔閃骨架);`error` / `notFound` 時 `reload` 回到 `loading`。本 phase 頁面只喺 `ErrorCard` 重試用到,**唔加「重新整理」按鈕**。
- **防舊回應覆蓋**:同 P2,遞增 `requestSeq` ref;回應 `seq` 唔係最新就丟棄;cleanup(unmount / `id` 變)bump;唔用 `AbortController`(理由同 P2 §5.4)。
- 唔做自動輪詢、唔寫全局 store / storage、唔 `console.log` 回應內容。
- `reload` 同 `getReport` 之外嘅 mutation(`dismiss` / `ban`)屬 P4,唔預留 optimistic 更新介面。

### 5.7 頁面狀態

| 狀態     | 呈現                                                                              |
| -------- | --------------------------------------------------------------------------------- |
| Loading  | 返回連結 + 標題照常;Header / Detail / Evidence 各一個骨架卡(`animate-pulse` 灰塊)  |
| Ready    | §5.3、§5.4                                                                        |
| 404      | 置中「舉報唔存在」+「返回舉報隊列」按鈕(`Link`,唔係 `button onClick`)            |
| Error    | `ErrorCard` + 重試(`onRetry = reload`);返回連結仍可用                              |

- `401`:interceptor 清 session → `RequireAuth` 導向 `/login`(P1),頁面唔另外處理。
- `429`:`ErrorCard` 倒數;全局 toast 屬 P7。
- 唔用 emoji(`ui-spec.md` §5)。

---

## 6. i18n 文案

新增 key(`i18n/zhHant.ts`,component 內**零硬編碼中文**):

```ts
reportDetail: {
    title: "舉報詳情",
    back: "返回舉報隊列",
    createdAt: "建立時間",
    resolvedAt: "結案時間",
    detailTitle: "舉報說明",
    noDetail: "(無說明)",
    targetTitle: "被舉報人",
    openReports: "待處理舉報",
    viewUser: "查看用戶",
    resultDismissed: "此舉報已駁回",
    resultActioned: "此舉報已處置",
    evidenceTitle: "證據",
    snapshotNote: "證據係舉報當刻 snapshot,唔會更新",
    expired: "證據已過保留期(90 日)被清除",
    noMessages: "雙方冇聊天紀錄",
    noTitle: "(無 Title)",
    emptyMessage: "(空白訊息)",
    senderReporter: "舉報人",
    senderTarget: "被舉報人",
    senderOther: "其他",
    avatarAlt: "被舉報人頭像",
    imageAlt: "聊天圖片",
    enlargeImage: "放大圖片",
    imageFailed: "圖片無法載入",
    closeLightbox: "關閉",
    notFound: "舉報唔存在",
},
```

- 移除 `pages.reportDetail`(「舉報詳情(P3)」佔位)。先 `grep` 確認冇其他引用(例如 `RequireAuth.test.tsx`),有就同步改。`pages.user`、`pages.health` 保留(屬後續 phase)。
- `reports.openReport` 等 P2 key 唔動。
- 用詞統一(`ui-spec.md` §10):封鎖 / 駁回 / 已處置 / 被舉報人 / 舉報人。

---

## 7. 安全要求

- **`detail`、Title、`body` 一律當純文字**:只用 JSX 文字節點,唔用 `dangerouslySetInnerHTML`、唔用 `innerHTML`、唔經 markdown / linkify。含 `<script>`、`<img onerror>`、HTML 實體嘅內容要**原樣顯示為文字**(有測試)。
- **`image_url` / `avatar_url` 只入 `<img src>`**,唔當 `href`、唔開新頁(避免 `javascript:` 同外洩 referrer);再加 `SafeImage` 嘅 scheme 白名單做第二道。
- 所有 `<img>`:`referrerPolicy="no-referrer"`、`loading="lazy"`。CSP 嘅 `img-src` 屬 P7 `vercel.json`(`portal-spec.md` §5.2),本 phase 唔做;**未有 CSP 前,dev 環境圖片唔應載入任意第三方**——因為 seed 冇圖,實際風險低,P7 驗收時一併確認。
- URL param `:id` 只用於 `getReport` 嘅 path(已 encode)同顯示,唔拼入其他 URL、唔存 storage。
- 唔 `console.log` 回應內容、token、完整 error 物件(P1 §6 延續)。
- 頁面唔做任何背景重試(避免燒失敗額度,`portal-spec.md` §5.2)。

---

## 8. 測試(Vitest + RTL)

### 8.1 測試基建

`src/test/mockApi.ts` 擴充(向後兼容):

- `evidenceMessageFixture(overrides?: Partial<EvidenceMessage>): EvidenceMessage`、`evidenceFixture(overrides?: Partial<Evidence>): Evidence`。
- `reportFixture` 已有(P2),`getReport` 測試以 `reportFixture({evidence: evidenceFixture(...)})` 組裝。
- `mockApi` handler 用 `request.url` 判斷 `/admin/reports/<id>`(P2 加咗 `params`,`url` 本身已有)。

### 8.2 案例

| 範圍                   | 案例                                                                                                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getReport`            | URL 為 `/admin/reports/<id>`;id 含特殊字元會被 encode;`401` 已登入 → 觸發 logout;`404` **唔**觸發 logout                                                                                                                         |
| `SafeImage`            | `https:` / `http:` 渲染 `<img>` 且帶 `referrerpolicy="no-referrer"`、`loading="lazy"`;`javascript:`、`data:`、相對路徑、`null`、無效 URL 渲染 fallback;`onError` 切去 fallback;`src` 變咗重置錯誤                                      |
| `EvidenceSection`      | **reverse 順序**:輸入新→舊 `[m3, m2, m1]` → DOM 順序 `m1, m2, m3`,且傳入陣列未被 mutate;`sender_id` 分「舉報人 / 被舉報人 / 其他」三種側別同標籤;`evidence == null` 顯示過期提示且無聊天區;`messages` 空顯示「雙方冇聊天紀錄」且 Title 仍在;Title `null`;`body` `null` 顯示「(空白訊息)」;`kind=image` 有可點縮圖,點擊開 lightbox 並顯示大圖,Esc 關閉;`image_url == null` 顯示「圖片無法載入」且唔可點;未知 `kind` 當文字;snapshot info 條常駐;含 `<script>` / HTML 字元嘅 `body`、Title 原樣顯示為文字(`container.querySelector("script")` 為 `null`) |
| `Reports` 列表(P2)     | 抽出 `REPEAT_OFFENDER_THRESHOLD` 後,P2 全部測試仍綠(`open_reports = 3` 紅、`2` 唔紅)                                                                                                                                            |
| `useReport` / 頁面     | 首次 fetch 用路由 `id`;`phase` 流轉 loading → ready;**切 `id` 先清空再 refetch,唔殘留舊 report**;**舊回應丟棄**:`id` 由 A 切 B,A 嘅慢回應後到,唔覆蓋 B;`404` → 「舉報唔存在」+ 返回連結指向 `/reports`;`500` / 網絡錯 → `ErrorCard` + 重試,重試成功恢復;`429` 倒數;`ErrorCard` 唔顯示 backend `message` |
| 頁面內容               | Header 見 Reason / Status chip、建立時間(`both` 格式);`detail` `null` 顯示「(無說明)」;`detail` 含 HTML 原樣顯示為文字;Target 卡顯示全文 id、`open_reports = 3` 紅色 / `2` 唔紅、「查看用戶」指向 `/users/<target.id>`;`open` 唔顯示 `ResolvedCard`;`dismissed` / `actioned` 顯示結果 + 結案時間;`resolved_at == null` 唔 throw;未知 `status` 唔 throw |

測試用 `createMemoryRouter` 包頁面(路由 `/reports/:id`),用 `mockApi` 控制回應時序(handler 回 pending promise 模擬慢回應)。Lightbox 測試唔好依賴 `getAnimations` 以外嘅 jsdom 缺口;如 HeroUI `Modal` 喺 jsdom 需要額外 polyfill,加喺 `src/test/setup.ts` 並註明原因(同 P2 `getAnimations` 做法)。

---

## 9. 驗收標準(Definition of Done)

**自動**

- [ ] `pnpm test` 全綠(含 P1、P2 既有測試,證明冇回歸)。
- [ ] `pnpm build` 成功。
- [ ] `pnpm format` 後 `git diff` 冇格式變動(留意 `pnpm format` 會掃 `design/`,如有變動要還原)。

**手動(對 P0 真 backend)**

- [ ] 由 `/reports` 點 R1 → 詳情頁;Header、Detail、Target 卡、Evidence 俱全;聊天 **3 則,舊→新**,與 `admin.sh show <R1>` 輸出(新→舊)倒轉一致;舉報人靠左、被舉報人靠右,標籤正確。
- [ ] 點 R2 → Evidence 顯示 Title(或「(無 Title)」)+「雙方冇聊天紀錄」。
- [ ] 常駐 snapshot info 條可見。
- [ ] Target 卡顯示 **全文** UUID,`IdTag` 點擊複製到完整 UUID;「查看用戶」去 `/users/<id>`(佔位頁)。
- [ ] 對一個已 dismiss 嘅 report(`admin.sh dismiss`)直接開 `/reports/<id>`:顯示「已駁回」+ 結案時間,冇任何操作掣。
- [ ] 開 `/reports/not-a-real-id`:顯示「舉報唔存在」+ 返回連結,**冇**被登出。
- [ ] 停咗 backend 再開詳情:`ErrorCard`「連唔到 server」+ 重試;重啟 backend 按重試恢復。
- [ ] 喺 `/reports` 與詳情之間快速來回點不同 row 5 次,最終畫面對應最後一個 id(Network 面板確認舊請求回應被丟棄)。
- [ ] 1280 / 768 / 375 寬度:`< lg` 單欄、順序 Header → Detail → Target → Evidence;頁面冇橫向爆版;長 UUID 唔撐破卡片(`break-all`)。
- [ ] 純鍵盤:Tab 可行到返回連結、Target 卡連結、各 `IdTag`、圖片縮圖(如有);Tab 順序同視覺順序一致。
- [ ] `grep` component 內冇硬編碼中文;`pages.reportDetail` 已移除且冇殘留引用。
- [ ] DevTools:詳情請求只有 `GET /v1/admin/reports/<id>`,token 冇出現喺 URL;冇 `console.log` 輸出。

**Repo**

- [ ] `git status` 只見預期檔案(§10);`ReportsTable.tsx` 除 import 外冇其他行為改動。

---

## 10. 交付物(預期變動檔案)

```
新增
  src/lib/reportRules.ts
  src/pages/ReportDetail/{useReport.ts,ReportHeader.tsx,DetailCard.tsx,TargetCard.tsx,ResolvedCard.tsx,EvidenceSection.tsx,EvidenceBubble.tsx,SafeImage.tsx}
  以上各自 *.test.ts(x)(`ReportHeader` / `DetailCard` / `TargetCard` / `ResolvedCard` 可併入頁面測試)
修改
  src/api/endpoints/reports.ts         # + getReport(及其測試)
  src/pages/ReportDetail/index.tsx     # 佔位 → 實頁
  src/pages/Reports/ReportsTable.tsx   # 改 import REPEAT_OFFENDER_THRESHOLD
  src/i18n/zhHant.ts                   # §6
  src/test/mockApi.ts                  # §8.1
  src/test/setup.ts                    # 僅在 Modal 需要 polyfill 時
```

---

## 11. 風險與處理

| 風險                                                   | 徵兆                                         | 處理                                                                                       |
| ------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 聊天順序搞反(忘記 reverse,或 reverse 咗原陣列)         | 最新訊息喺最頂;重 render 時順序 flip-flop    | `[...messages].reverse()`;專屬測試斷言 DOM 順序同原陣列未被 mutate                          |
| user 內容 XSS                                          | `detail` / `body` / Title 內嘅 HTML 被執行   | 只用文字節點(§7);測試含 `<script>` 內容                                                    |
| `image_url` / `avatar_url` 係惡意 scheme 或第三方追蹤   | 外洩 referrer / IP,或 `javascript:` 被當連結 | `SafeImage` scheme 白名單 + `no-referrer` + 唔入 `href`;CSP 屬 P7                          |
| `id` 切換時舊回應覆蓋新 report                          | 顯示同 URL 唔對應嘅舉報                      | `requestSeq` 序號丟棄(§5.6),有專屬測試                                                     |
| 404 被當成登出                                         | 開錯 id 即跳 `/login`                        | interceptor 只處理 `401`;`getReport` 測試斷言 `404` 唔 logout                              |
| 90 日後 `evidence == null` 白屏                        | 讀 `evidence.messages` 時 TypeError          | 先分流 `null` / 缺(§5.4),有測試                                                            |
| backend 新增 `kind` / `status` / sender 未知            | 畫面白屏                                     | 全部有 fallback(§5.3、§5.4),有測試                                                         |
| HeroUI `Modal` 喺 jsdom 缺 API                          | lightbox 測試 crash                          | 按 P2 做法加最小 polyfill 並註明(§8.2)                                                     |
| Seed 冇圖 / 冇頭像,手動驗唔到                           | 圖片路徑無真實驗證                           | 靠 Vitest;P7 對真 backend 驗圖床 host 同 CSP 時補驗                                         |
| 抽出 `REPEAT_OFFENDER_THRESHOLD` 時動到列表行為          | P2 測試變紅                                  | 只搬常數、改 import;P2 測試全綠為準                                                        |

---

## 12. 唔屬於本 phase

- `dismissReport`、`banFromReport`、備註欄、`ConfirmModal`、Toast 系統、操作成功後返回 `/reports`(P4)。
- `open` 狀態下嘅操作卡 / 佔位(P4 直接掛入 Target 卡下面)。
- `/users/:id` 實頁、用戶查詢框接線(P5)。
- 「重新整理」按鈕、自動輪詢(MVP 唔做;`reload` 只供 P4 內部使用)。
- CSP / `vercel.json`、全局 `429` / `401` toast、E2E(P7)。
- 圖片「開新分頁 / 下載」、聊天分頁(evidence 固定最多 20 則)。
- 返回列表時記住 tab(P4 做完返回流程後再決定)。
