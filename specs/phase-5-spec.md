# Phase 5 Spec：用戶頁（查詢 / Ban / Unban）

上游：`portal-spec.md` §11 P5（並引用 §3.1、§4.5、§5.1、§6、§7）、`ui-spec.md` §3、§5、§7.3、§7.4。預估 **0.5–0.75 日**（原估 0.5 日，加上 `NoteField` 抽取與測試後貼近上限）。依賴：P1（`AdminShell`、`apiClient`）+ P4（`ConfirmModal`、Toast、mutation 規矩、`noteRules`、`mockApi` 已落地）。

**這是第二個會改動 backend 資料的 phase，也是第一個能把 ban 還原的 phase。** 目標：

1. `/users/:id` 實頁：`AdminUser` 全部欄位、Ban / Unban（重用 `ConfirmModal`）。
2. 接通 `AdminShell` 全域 user id 查詢框，並於頁頂加入 `< md` 專用查詢框（共用同一個 `UserLookupForm`）。
3. 抽出 `NoteField`，讓舉報頁與用戶頁共用同一套備註規則（不複製貼上）。
4. 沿用 P4 的 mutation 規矩（防重複送出、不 optimistic、以 server 回應為準、idempotent 如實呈現）。

---

## 1. 前置條件

| 項目           | 要求                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| P4 已完成      | `ConfirmModal`（含 `errorTitle`）、`Toast.Provider`、`lib/noteRules.ts`、`ActionCard` 的 mutation 寫法、`mockApi` 的 `method` / `body` 可用 |
| P1 已完成      | `AdminShell`（查詢框目前為 `disabled` 佔位）、`/users/:id` 路由（目前為 `pages.user` 空頁）                                  |
| Backend 運行中 | `ADMIN_TOKEN`、`ALLOWED_ORIGINS` 已設（P0）；CORS 允許 `POST`                                                            |
| Seed           | 見 `.seed.local.md`：用戶 B（R1 的 target）為 `active`，用於 ban → unban 來回；P4 驗收中被封鎖的 target（R2 的 D）應為 `banned`，用於 unban 與「已封鎖」顯示；另需一個 `deleted` 用戶（可無，見 §11 手動項） |
| 不需要         | 改 backend code；用戶清單 / 搜尋；by-target 舉報查詢；`admin_actions` 瀏覽（`portal-spec.md` §10 缺口 1–3）                 |

**驗收會真正封鎖、解封測試帳號**，只使用 seed 帳號。

---

## 2. 範圍

**做**

- `api/endpoints/users.ts`：`getUser`、`banUser`、`unbanUser`。
- `api/types.ts`：加 `UnbanResponse`。
- `components/NoteField.tsx`：由 `ActionCard` 抽出（§5）；`lib/noteRules.ts` 加 `isNoteFieldError`（§5）。
- `components/UserLookupForm.tsx` + `AdminShell` 接線（§4）。
- `pages/User/`：`index.tsx`、`useUser.ts`、`UserSummary.tsx`、`UserActions.tsx`（§6、§7）。
- 一個 **error toast**（`ui-spec.md` §7.4 規定 `404` @ ban / unban 用 error toast，這是本專案第一個；不自動消失，§8）。
- i18n 文案（§9）、`mockApi` fixture（§11.1）、Vitest（§11）。

**不做**：見 §14。

---

## 3. API 層

### 3.1 `api/types.ts`

```ts
export interface UnbanResponse {
    status: "active";
}
```

`AdminUser`（P1 已定義）不需要改。`BanResponse` 沿用 P4。

### 3.2 `api/endpoints/users.ts`

```ts
export function getUser(id: string): Promise<AdminUser>;
export function banUser(id: string, note?: string): Promise<BanResponse>;
export function unbanUser(id: string, note?: string): Promise<UnbanResponse>;
```

- `GET /admin/users/${encodeURIComponent(id)}`、`POST …/ban`、`POST …/unban`。
- Body 由 `buildNoteBody(note)`（P4）產生：空 → `{}`；否則 `{note: <trimmed>}`。**絕不多送欄位**（`deny_unknown_fields`）。
- 使用 store token，不帶 `skipAuthRedirect`：已登入後 `401` 由 interceptor 自動登出。`404` **不**登出（`portal-spec.md` §5.1：`/users/{id}` 的 `404` 是「資源不存在」）。
- 不 retry、不 optimistic、不快取。ban / unban 皆 idempotent，使用者重按是安全的。
- **用戶頁一律使用 `users/{id}/ban`**（審計記為 `ban`）；`reports/{id}/ban` 只屬於舉報頁（`portal-spec.md` §3.1）。兩個 endpoint 都可存在於 `reports.ts` / `users.ts`，各管各，不互相呼叫。
- id 可以是任何字串（backend 的 `Path<String>`，格式不合法會得到 `404`，與「不存在」同一路徑處理）。**前端不做 UUID 格式驗證**，避免前端比 backend 嚴格而擋住合法查詢。

---

## 4. 用戶查詢

### 4.1 `components/UserLookupForm.tsx`

```ts
{
    tone: "dark" | "light"; // dark = AdminShell 黑底；light = 頁頂
}
```

- 一個 `<form role="search">`：`<input>` + 「查詢」按鈕。**Enter 或按鈕皆觸發 `onSubmit`**（用原生 form，不自行監聽 keydown）。
- 送出：`const id = value.trim()`；`id === ""` → 不送、不導向（可以 `aria-invalid` 但**不顯示錯誤文字**，保持安靜）；否則 `navigate("/users/" + encodeURIComponent(id))`。**送出後不清空輸入**（`ui-spec.md` §3）。
- 輸入用 `font-mono`，`autoComplete="off"`、`spellCheck={false}`。
- `aria-label` 沿用 `shell.userLookupLabel`；placeholder 沿用 `shell.userLookupPlaceholder`。
- 該元件持有自己的輸入 state；Shell 與頁頂各一個實例，**不共用 state**（`< md` 時 Shell 那個隱藏，不會同時可見）。
- 輸入與目前 URL 的 id 相同時，`navigate` 為同一 URL，**不會重新 fetch**；這是已知且可接受的行為（要重載請用 `ErrorCard` 的重試或重新整理頁面）。

### 4.2 `AdminShell` 接線

- 以 `<UserLookupForm tone="dark" />` 取代現有 `disabled` 的 input + button；外層保留 `hidden md:flex`。
- 移除 `shell.userLookupHint`（"P5 啟用"）。
- Nav 不高亮任何項目於 `/users/:id`（已是如此，`ui-spec.md` §3）。

### 4.3 頁頂查詢框（`< md`）

- `/users/:id` 頁最上方放 `<UserLookupForm tone="light" />`，外層 `md:hidden`（`md` 以上改用 Shell 的那個，避免兩個並列）。
- `404` / loading / error 三種狀態下**都要存在**（查詢框是「再查一次」的出口，不可跟著內容消失）。

---

## 5. 抽出 `NoteField`（重構，行為不變）

`ActionCard` 目前自帶備註 textarea + 計數 + 錯誤。用戶頁需要同一套，因此抽成 `components/NoteField.tsx`，**兩處共用**。

```ts
{
    id: string;                     // textarea id（同頁面不可重複）
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
    serverError: string | null;     // backend 400 field=note 的 message
}
```

- 內容 = P4 §5.3「備註」區塊原樣搬移：label「備註（選填）」、2 行、`aria-invalid`、`{n}/200` 計數、超長紅字 + 「備註最多 200 字」。
- **onChange 不在此處清 `serverError`**：由呼叫方負責（`ActionCard` 目前就是在自己的 `handleNoteChange` 內清）。
- 「是否超長」由呼叫方以 `isNoteTooLong(note)` 判斷（要用來停用按鈕）；`NoteField` 內部也算一次用於顯示，兩者來源同一函式，不會不一致。
- `lib/noteRules.ts` 加：

```ts
export function isNoteFieldError(error: ApiError): boolean; // status === 400 && details?.field === "note"
```

  取代 `ActionCard` 內的區域函式 `isNoteError`（兩頁共用）。`noteRules.ts` 對 `ApiError` 僅 `import type`。
- i18n：`reportActions.noteLabel / noteCount / noteTooLong` 移至 `noteField.*`（§9），`ActionCard` 同步改用。
- **回歸要求**：`ActionCard.test.tsx` 既有案例**不改斷言**全數通過（文案與行為不變）；若測試因 id 改動而失敗，只可調整 selector，不可刪案例。

---

## 6. `/users/:id` 頁

### 6.1 檔案

```
src/pages/User/
├─ index.tsx          # 修改：頁面骨架 + 狀態分流
├─ useUser.ts         # 新增：fetch + reload
├─ UserSummary.tsx    # 新增：id、狀態、dl
└─ UserActions.tsx    # 新增：備註 + Ban/Unban + ConfirmModal
```

一個 file 一個 component。`useUser` 為 hook，`export function useUser`。

### 6.2 `useUser(id)`

與 `useReport` 同型（P3），回傳 `{user, phase, error, reload}`，`phase: "loading" | "ready" | "notFound" | "error"`。

- 維持相同的守則：`requestSeq` 丟棄過期回應；id 改變時 render 內以 `state.id === id` 擋住上一個用戶的資料（**絕不可短暫顯示上一個用戶**，這在手動查詢頻繁換 id 時最容易出錯）；`reload()` 使用 `keepCurrent = true`，**就地更新不閃回 loading**（`ui-spec.md` §7.4「就地 refetch」）。
- `404` → `notFound`（不是 `error`）；其餘 → `error`。
- 不做 AbortController（理由同 `useReport`：client 會把 cancel 轉成 `ApiError`，看起來像真故障）。
- 兩個 hook 結構相近，**本 phase 不抽共用 hook**（只有兩處、型別不同，過早抽象不划算；若 P6 又出現第三處再議）。

### 6.3 頁面狀態

| 狀態         | 呈現                                                                                   |
| ------------ | -------------------------------------------------------------------------------------- |
| `loading`    | 單一骨架卡（沿用 P3 骨架樣式）                                                          |
| `notFound`   | 置中空狀態「用戶不存在或已刪除」；**無**「返回」按鈕以外的操作（backend 不區分兩者）；查詢框仍可用（§4.3） |
| `error`      | `ErrorCard` + 重試（`reload`），顯示 `X-Request-Id`                                     |
| `ready`      | 卡片（§6.4）                                                                            |

`< md` 順序：頁頂查詢框 → 標題 → 卡片。標題 `h1` 為 `user.title`（「用戶」）。

### 6.4 `UserSummary`

- 頂部列：`<IdTag id full />`（**全文 + 點擊複製**，沿用 `TargetCard` 的 `break-all` 包法）+ `<StatusChip kind="user" />`。
- `dl` 欄位（label `text-black/60`，value `text-black`），順序固定：

| label             | 值                                                                              |
| ----------------- | ------------------------------------------------------------------------------- |
| 建立時間          | `<TimeText value={created_at} mode="both" />`                                   |
| 最後活躍          | `<TimeText value={last_active_at} mode="both" />`                               |
| 收件箱數量        | `inbox_count`                                                                   |
| 待處理舉報        | `open_reports`；`>= REPEAT_OFFENDER_THRESHOLD`（P2 的常數，現為 3）→ 紅色 `font-bold`（樣式同 `TargetCard`） |
| 累計被舉報        | `total_reports`                                                                 |
| 有 active Title   | `has_active_title` → 「是」/「否」                                              |

- 所有欄位為**純文字**；數字原樣顯示，不做千分位（營運用，保持與 backend 可對照）。
- 時間用 P2 的 `TimeText`（`mode="both"`，P2 已預留此 prop）。

---

## 7. `UserActions`

### 7.1 顯示與版面

位於同一張卡片內，`UserSummary` 之下以分隔線隔開：

```
─────────────────────────────
備註（選填）            12/200
[___________________________]
[        封鎖用戶          ]      ← active：danger；banned：黑色「解除封鎖」
此用戶的舉報（暫未支援）           ← 停用佔位
```

| `user.status` | 備註 | 按鈕                                   | 其他                                                           |
| ------------- | ---- | -------------------------------------- | -------------------------------------------------------------- |
| `active`      | 顯示 | 「封鎖用戶」（danger 實心紅，開 modal）  | —                                                              |
| `banned`      | 顯示 | 「解除封鎖」（黑色實心，開 modal）       | —                                                              |
| `deleted`     | 隱藏 | 無                                     | 灰色說明「用戶已刪除，無法操作」                                  |
| 未知值        | 隱藏 | 無                                     | 不顯示說明，**不 throw**                                         |

- **同一個 `<button>` 元素依 status 切換 label / 樣式**（不要用兩個條件渲染的按鈕）。理由：ban 成功後 refetch 使 status 翻轉，若是兩個不同節點，ConfirmModal 關閉時「焦點返回觸發鍵」的目標已被 unmount，鍵盤使用者會掉到 `body`。同一節點則焦點留在原位。
- 「此用戶的舉報（暫未支援）」：`<span aria-disabled="true">`（**不是 `<a>`**，不可點、不可 focus），`title="需要 backend 支援"`（`ui-spec.md` §7.4）。因 `title` 對鍵盤與觸控不可見，文字本身已含「（暫未支援）」，不依賴 tooltip 傳達資訊。對應 `portal-spec.md` §10 缺口 2。
- 備註使用 `NoteField`（§5），`id="user-note"`。超長 → 備註紅框、**按鈕停用**。

### 7.2 送出流程（沿用 P4 §5.4，原樣照抄）

- `submitting` ref 同步擋住 + `pending` state 驅動 UI；pending 期間備註與按鈕全停用；不 optimistic；不 `console.log`。
- `mounted` ref：回應到達時若已 unmount（使用者換了用戶 / 離開頁面）→ **只 toast，不 `reload`、不改 state**。
- `<UserActions key={user.id}>`：換用戶時整個重建，備註 / modal / 錯誤全部歸零，不會把 A 的備註帶去 B。
- modal 以 `isOpen` 控制；開啟前先清 `error`；`pending` 時 `onCancel` 為 no-op（P4 同）。

### 7.3 結果對照

**Ban**（`ConfirmModal`：`tone="danger"`，內容沿用 P4 的 `banConfirm.*` 副作用清單 + warning，`targetId = user.id`）

| 回應 / 錯誤                          | 行為                                                                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `200 {status: "banned"}`             | 關 modal → success toast「已封鎖」→ **就地 `reload()`**（不跳頁）→ 清空備註。**對已被封鎖者也是 `200`（idempotent），一律視為成功**                        |
| `404`                                | 關 modal → **error toast**「用戶已刪除或不存在，無法操作」（§8）→ `reload()`（頁面隨即轉為 `notFound` 或 `deleted` 狀態）                                   |
| `400` + `details.field === "note"`   | 關 modal，備註紅框顯示 backend `message`；使用者再編輯備註即清除                                                                                       |
| `429` / `5xx` / 網絡錯誤              | modal 保持開啟，內含 `ErrorCard`（`X-Request-Id`、`429` 倒數）；可再按確認重試或取消                                                                    |
| `401`                                | interceptor 登出 → `/login`，本卡不處理                                                                                                               |

**Unban**（`ConfirmModal`：`tone="default"`，內容見 §9 `unbanConfirm.*`，`targetId = user.id`）

結果表與 Ban 完全相同，僅成功 toast 為「已解除封鎖」。對非 `banned` 的 user，backend 回 `200` no-op，一律視為成功並 `reload()`（顯示真實狀態）。

**共通注意**

- **成功 toast 與 `reload()` 的真實狀態可能不一致**（例：另一位營運剛 unban，這邊再按 unban）。這是 idempotent 的預期結果，`reload()` 會顯示真實狀態，不另外警示。
- **Unban 不會還原 match / hello / push subscription**：warning 必須出現於 modal（§9），與 `portal-spec.md` §3.1 一致。
- UI 不得暗示「封鎖後事情已完結」：Ban modal 沿用 P4 的 warning（帳號以裝置為基礎）。

---

## 8. Error toast（本 phase 首次引入）

- `404` @ ban / unban 使用 `toast.danger(t(...), {timeout: 0})`（API 與 variant 名稱以 HeroUI 官方當前文件為準）：**不自動消失**，使用者須手動關閉（`ui-spec.md` §5：error toast 不自動消失）。
- 只發這一種 error toast；其餘錯誤維持 inline / modal 內（與 P4 一致）。全域 `429` / `401` toast 仍屬 P7。
- toast 文字經 `t()`，不放 user 內容、不放 id。
- 若 HeroUI `toast.danger` 的 `timeout: 0` 在目前版本行為不同（例如需用 `isLoading` 或自訂 option），**以實測為準**並在測試註明；原則不變：error toast 不自動消失。

---

## 9. i18n 文案

`i18n/zhHant.ts`（component 內**零硬編碼中文**，繁體書面語）：

```ts
// 移除
shell.userLookupHint                 // "P5 啟用"
pages.user                           // "用戶（P5）"
reportActions.noteLabel / noteCount / noteTooLong   // 移至 noteField

// 新增
noteField: {
    label: "備註（選填）",
    count: "{n}/200",
    tooLong: "備註最多 200 字",
},
user: {
    title: "用戶",
    notFound: "用戶不存在或已刪除",
    createdAt: "建立時間",
    lastActiveAt: "最後活躍",
    inboxCount: "收件箱數量",
    openReports: "待處理舉報",
    totalReports: "累計被舉報",
    hasActiveTitle: "有 active Title",
    yes: "是",
    no: "否",
    reportsLink: "此用戶的舉報（暫未支援）",
    reportsLinkHint: "需要 backend 支援",
    deletedNote: "用戶已刪除，無法操作",
    ban: "封鎖用戶",
    unban: "解除封鎖",
    bannedToast: "已封鎖",
    unbannedToast: "已解除封鎖",
    actionNotFound: "用戶已刪除或不存在，無法操作",
},
unbanConfirm: {
    title: "解除封鎖",
    confirm: "確認解封",
    consequence1: "用戶可再次使用 app",
    warning: "不會恢復之前被關閉的 match、hello 與 push subscription；Title / profile 會自然恢復。",
},
```

- `banConfirm.*` 沿用 P4，**不複製**；`UserActions` 與 `ActionCard` 各自組陣列傳入 `ConfirmModal`（`t()` 不支援陣列，P4 §8 已定）。為避免兩份副作用清單日後漂移，**把 `banConsequences` 陣列移到 `lib/banConsequences.ts` 匯出**，兩處共用（清單來源 `portal-spec.md` §3.1，不可刪減）。
- `unbanConfirm.consequence1` 搭配 `confirmModal.consequencesIntro`（「此動作會：」）會讀成「此動作會：用戶可再次使用 app」，語意通順，不另設 intro。
- 用詞統一（`ui-spec.md` §10）：封鎖 / 解除封鎖 / 用戶。

---

## 10. 安全要求

- **Ban 與 Unban 一律經 `ConfirmModal`**，沒有捷徑；modal 內顯示目標 id 全文；預設焦點在「取消」（P4 已有測試，直接繼承）。
- Ban（danger）與備註之間無「駁回」類鄰近操作，本頁只有單一破壞性按鈕；仍維持 danger 紅色，與 unban 的黑色明確區分。
- `AdminUser` 全部欄位以純文字渲染；id 顯示不做 `dangerouslySetInnerHTML`、不作為 `href`。
- 查詢輸入只用於 `navigate` 的 path segment，**必須 `encodeURIComponent`**（輸入 `../reports/x` 不可跳出 `/users/`）。
- Request body 只含 `note`；id 一律 `encodeURIComponent`。
- 不做背景重試；不 `console.log` token、回應、完整 error 物件；備註不寫入 URL / storage / log。
- 不暗示「封鎖後即萬事大吉」（`portal-spec.md` §3.1「Ban 局限」）；不暗示 unban 可還原一切。

---

## 11. 測試（Vitest + RTL）

### 11.1 測試基建

`src/test/mockApi.ts`：加 `adminUserFixture(overrides?: Partial<AdminUser>)`（`status: "active"`、`open_reports: 1`、`total_reports: 2` 等合理預設）。既有 export 不動。

Toast 斷言：`vi.spyOn(toast, "success")` / `"danger"`，不依賴實際渲染。

### 11.2 案例

| 範圍                | 案例                                                                                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users` endpoints   | `GET /admin/users/<id>`；`POST …/ban`、`…/unban`；id 含特殊字元會被 encode；無備註 body 為 `{}`、有備註只有 `{note}`；`401` 已登入 → logout；`404` **不** logout                                                             |
| `NoteField`         | 計數 `n/200`；> 200 → 紅字 + 「備註最多 200 字」；`serverError` 顯示於欄位下方；`disabled` 時 textarea 停用                                                                                                                  |
| `isNoteFieldError`  | `400` + `field: "note"` → true；`400` 但其他 field → false；非 400 → false                                                                                                                                                  |
| `UserLookupForm`    | 輸入前後空白被 trim；空字串 / 全空白 Enter **不導向**；Enter 與按鈕皆導向 `/users/<id>`；特殊字元（`../x`、`a/b`）被 encode；送出後輸入**不清空**                                                                              |
| `AdminShell`        | 查詢框不再 `disabled`；在任一頁輸入 id 送出會導向 `/users/<id>`                                                                                                                                                            |
| `useUser` / 頁面    | 載入 → 顯示欄位；`404` → 「用戶不存在或已刪除」且查詢框仍在；`500` → `ErrorCard` + 重試成功；換 id 時**不短暫顯示上一個用戶**；`reload` 期間不回到 loading（無閃爍）；時間同時顯示絕對與相對                                         |
| `UserSummary`       | 全部 6 個欄位渲染；`open_reports >= 3` 紅色、`2` 不紅；`has_active_title` 的 是 / 否；id 為全文                                                                                                                             |
| `UserActions` 顯示  | `active` → 「封鎖用戶」；`banned` → 「解除封鎖」；`deleted` → 無按鈕 + 「用戶已刪除，無法操作」；未知 status → 無按鈕、不 throw；「此用戶的舉報」為不可 focus 的 `aria-disabled` 文字                                          |
| Ban 流程            | 點擊只開 modal、**未**送 request；取消 → 無 request；確認 → `POST /admin/users/<id>/ban`（**不是** `/reports/…`）；成功 → modal 關、`toast.success("已封鎖")`、**未** navigate、refetch 後按鈕變「解除封鎖」；對已封鎖者回 `200` 同樣成功 |
| Unban 流程          | modal 含「不會恢復…match、hello 與 push subscription」warning 與目標 id 全文；確認 → `POST …/unban`；成功 → `toast.success("已解除封鎖")`、refetch 後按鈕變「封鎖用戶」；對非 banned 者回 `200` 同樣成功                          |
| 錯誤分流            | `404`（ban 與 unban）→ modal 關、`toast.danger(…, {timeout: 0})`、refetch 後頁面轉為 notFound；`400 field=note` → modal 關、備註紅框顯示 message、編輯後清除；`500` / `429` → modal 內 `ErrorCard`、保持開啟、可再試成功         |
| 備註                | 超長 → 按鈕停用、不送 request；成功後備註清空；備註於 body 中被帶上                                                                                                                                                        |
| 防重複送出          | ban 確認連點兩次只送 1 個；unban 同；pending 期間備註與按鈕全停用；失敗後恢復可操作                                                                                                                                         |
| 換用戶 / unmount    | 送出後、回應前改變 `:id` 或離開頁面：回應到達時**仍 toast、不 reload、無 React warning**；換用戶後備註已清空（`key={user.id}`）                                                                                             |
| 焦點                | modal 關閉（成功後 status 翻轉）時，焦點仍在同一個按鈕上（驗證「同一節點」設計）                                                                                                                                            |
| 回歸                | P1–P4 既有測試全綠；`ActionCard.test.tsx` **不改斷言**（§5）；`AdminShell` 相關既有測試如斷言查詢框 `disabled`，需同步更新，**不可靠刪除斷言通過**                                                                           |

頁面測試以 `createMemoryRouter`（`/users/:id` + `/reports` + `/login` 路由）包起來；handler 以 `method` + `url` 分流，回 pending promise 模擬 in-flight。

---

## 12. 驗收標準（Definition of Done）

**自動**

- [ ] `pnpm test` 全綠（含 P1–P4 既有測試）。
- [ ] `pnpm build` 成功。
- [ ] `pnpm format` 後 `git diff` 無格式變動（留意 `pnpm format` 會掃 `design/`，如有變動須還原）。

**手動（對 P0 真 backend）**

- [ ] **查詢**：Shell 查詢框輸入 B 的 id（前後加空白）→ 導向 `/users/<B>`，輸入框內容保留；空白 Enter 無反應；`< md`（768 以下）Shell 查詢框隱藏、頁頂查詢框可用。
- [ ] **欄位**：B 顯示正常、全部 6 個欄位、時間為「絕對（相對）」；ID 為全文且點擊可複製；`open_reports >= 3` 紅色（如無 seed，可用單元測試覆蓋）。
- [ ] **404**：查詢 `00000000-0000-0000-0000-000000000000` 與一個亂打的字串 → 兩者皆顯示「用戶不存在或已刪除」，查詢框仍可用，立刻再查 B 成功。
- [ ] **Ban（用戶頁）**：B 按「封鎖用戶」→ modal 顯示完整 UUID、6 條副作用、warning，**焦點在取消**，Enter 不會封鎖 → 確認 → toast「已封鎖」、**停留本頁**、chip 轉紅「已封鎖」、按鈕轉為「解除封鎖」；`admin.sh user <B>` 確認 `banned`；以 B 的 token 呼叫 `/v1/me` 回 `403 ACCOUNT_BANNED`；DevTools 確認請求為 `POST /admin/users/<B>/ban`，body 為 `{}` 或 `{"note":"…"}`。
- [ ] **Unban**：同頁按「解除封鎖」→ modal 含「不會恢復…」warning → 確認 → toast「已解除封鎖」、chip 轉綠、按鈕轉回「封鎖用戶」；`/v1/me` 恢復 `200`；舉報頁中 B 先前被結案的 report **仍為已結案**（unban 不還原）。
- [ ] **P4 遺留帳號**：P4 驗收中被封鎖的 D → 於 `/users/<D>` 顯示「已封鎖」+「解除封鎖」；解封後 `/v1/me` 恢復。
- [ ] **Idempotent**：以 curl 先 ban B，再於另一分頁（仍顯示 active）按「封鎖用戶」→ 成功 toast、頁面顯示 `banned`；對 banned 的 D 以 curl 先 unban，再於仍顯示 banned 的分頁按「解除封鎖」→ 成功、顯示 `active`。
- [ ] **deleted / 404 @ action**：無 `deleted` 帳號時，以「頁面已顯示 active 後，用 DB / curl 將其刪除，再按封鎖」模擬 → modal 關、紅色 error toast 出現且**不會自動消失**、頁面轉為「用戶不存在或已刪除」。若環境無法造出 `deleted`，此項以單元測試覆蓋並於 PR 註明。
- [ ] **備註**：201 字 → 計數紅、「備註最多 200 字」、按鈕停用、Network 無 request；刪到 200 恢復。成功後備註清空。
- [ ] **連點**：Slow 3G 下連點確認封鎖 / 解除封鎖 5 次 → Network 只見 1 個 POST；pending 期間 Esc / 點 backdrop 無法關閉 modal。
- [ ] **錯誤**：停掉 backend 後按確認 → modal 內顯示錯誤、保持開啟；重啟後再按成功。
- [ ] **換用戶中途**：Slow 3G 送出 ban 後，立刻在查詢框改查另一個用戶 → 新用戶頁**沒有**舊用戶資料或備註；舊請求回來後出現 toast，但頁面不被拉回舊用戶。
- [ ] **鍵盤**：Tab 可到查詢框、備註、動作鍵；modal 內焦點被困住；關閉後焦點在動作鍵上（不會掉到 `body`）。
- [ ] **舉報頁連動**：`/reports/:id` 的「查看用戶」連結現在導向真實頁（P3 時為佔位）；舉報頁 Ban 流程（P4）不受 `NoteField` 抽取影響，行為與驗收項一致。
- [ ] `grep` component 內無硬編碼中文。
- [ ] DevTools：token 不在 URL；無 `console.log` 輸出；請求只有 `GET /admin/users/<id>`、`POST …/ban`、`POST …/unban`。

**Repo**

- [ ] `git status` 只見預期檔案（§13）。

---

## 13. 交付物（預期變動檔案）

```
新增
  src/api/endpoints/users.ts(+ .test.ts)
  src/components/NoteField.tsx(+ .test.tsx)
  src/components/UserLookupForm.tsx(+ .test.tsx)
  src/lib/banConsequences.ts
  src/pages/User/useUser.ts
  src/pages/User/UserSummary.tsx(+ .test.tsx)
  src/pages/User/UserActions.tsx
  src/pages/User/User.test.tsx            # 頁面 + UserActions 整合測試
修改
  src/api/types.ts                        # + UnbanResponse
  src/lib/noteRules.ts(+ .test.ts)        # + isNoteFieldError
  src/pages/User/index.tsx                # 空頁 → 實頁
  src/pages/ReportDetail/ActionCard.tsx   # 改用 NoteField、isNoteFieldError、banConsequences
  src/components/AdminShell.tsx           # 查詢框接線
  src/i18n/zhHant.ts                      # §9
  src/test/mockApi.ts                     # + adminUserFixture
```

---

## 14. 風險與處理

| 風險                                                 | 徵兆                                                  | 處理                                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 換 id 時短暫顯示上一個用戶                           | 查 B 後立刻查 C，閃現 B 的欄位與 Ban 鍵，可能誤封        | `state.id === id` 擋住 + `key={user.id}` 重建 `UserActions`（§6.2、§7.2）；專屬測試                  |
| 誤封 / 誤解封錯對象                                  | 操作到非預期用戶                                       | modal 顯示 id 全文、預設焦點在取消、無捷徑（§10）；Ban 成功後 chip 與按鈕即時反映真實狀態             |
| 把 unban 當成「復原」                                | 營運以為 match / hello 會回來                          | Unban modal warning 明確寫「不會恢復」（§9）                                                       |
| 對 stale 頁面操作                                    | 頁面顯示 active 但實際已 banned                        | idempotent `200` 視為成功，`reload()` 顯示真實狀態（§7.3）                                          |
| 抽出 `NoteField` 破壞舉報頁                          | `ActionCard` 既有測試變紅、備註行為改變                 | 純搬移、不改文案與行為；`ActionCard` 測試不改斷言（§5）；舉報頁 Ban 手動回歸                          |
| 兩份副作用清單漂移                                   | 用戶頁與舉報頁對 Ban 後果的描述不同                    | 抽到 `lib/banConsequences.ts` 單一來源（§9）                                                       |
| 焦點掉到 `body`                                      | Ban 成功後 status 翻轉，觸發鍵被 unmount               | 同一個 `<button>` 節點切換 label / 樣式（§7.1）；專屬測試                                           |
| 查詢輸入造成 path 注入                               | 輸入 `../reports/x` 導向非 `/users/` 路徑               | `encodeURIComponent`（§4.1、§10）；專屬測試                                                         |
| 兩個 `UserLookupForm` 同時存在                       | 測試 `getByLabelText` 找到多個而失敗                    | 頁頂版為 `md:hidden`（CSS 隱藏，jsdom 仍存在）；測試改用 `within(...)` 或 `getAllBy…`               |
| 同 id 重複送出不會重新 fetch                         | 營運想「刷新」卻無反應                                 | 已知且接受（§4.1）；錯誤狀態有重試，其餘重新整理頁面                                                |
| HeroUI `toast.danger` 的 `timeout: 0` 行為與預期不同 | error toast 4 秒後仍自動消失                           | 以官方文件 + 實測為準（§8）；測試斷言「不自動消失」                                                 |
| 手上沒有 `deleted` 用戶                              | `deleted` / `404 @ ban` 無法手動驗證                   | 以單元測試覆蓋，PR 註明（§12）                                                                      |
| 驗收真的改動了 seed 帳號                             | 後續 phase 的 seed 狀態不一致                          | 驗收最後把 B、D 都 unban 回 `active`，並更新 `.seed.local.md` 的狀態備註                             |

---

## 15. 不屬於本 phase

- 用戶清單 / 搜尋、「此用戶的舉報」實作、`admin_actions` 瀏覽、reporter 摘要（`portal-spec.md` §10 缺口 1–4；UI 僅放停用佔位）。
- 全域 `429` / `401` toast、閒置自動登出、CSP / `vercel.json`、Playwright E2E（P7）。
- `/health`、metrics、failed jobs（P6）。
- 用戶頁自動輪詢 / 手動刷新按鈕（MVP 不做；操作後就地 refetch 已足夠）。
- Undo / 復原（backend 無對應能力）；批次 ban / unban。
- 由用戶頁直接 dismiss 舉報（沒有 by-target 查詢，做不到，且舉報處理屬舉報頁）。
- 多 admin / 操作者審計（`portal-spec.md` §10 缺口 7）。
