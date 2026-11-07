# Phase 4 Spec：處理動作（Dismiss / Ban）

上游：`portal-spec.md` §11 P4（並引用 §3.1、§5.1、§6、§7）、`ui-spec.md` §4.5、§5、§7.2、§7.3。預估 **0.75 日**。依賴：P3（`/reports/:id` 頁、`useReport`、`TargetCard`、`ResolvedCard`、`ErrorCard`、`mockApi` 已落地）+ P0 seed（R1、R2 皆為 `open`）。

**這是第一個會改動 backend 資料的 phase。** 目標：

1. 在 `/reports/:id` 的右欄掛入 `ActionCard`：備註、**駁回（Dismiss）**、**封鎖用戶（Ban）**。
2. 建立通用 `ConfirmModal`（P5 的 ban / unban 重用），Ban 一律須二次確認。
3. 建立 Toast 系統（`Toast.Provider` 掛於 app 根部），P7 的全域 `401` / `429` toast 直接沿用。
4. 定好 mutation 的共通規矩（防重複送出、不 optimistic、以 server 回應為準、idempotent 回應如實呈現），P5 照抄。

---

## 1. 前置條件

| 項目           | 要求                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| P3 已完成      | `/reports/:id` 可用；右欄為 `TargetCard`（+ 已結案的 `ResolvedCard`）；`useReport().reload` 可用           |
| Backend 運行中 | `ADMIN_TOKEN`、`ALLOWED_ORIGINS` 已設（P0）；CORS 允許 `POST` 與 `Content-Type`（`portal-spec.md` §2.3） |
| Seed           | 至少 2 筆 `open` report，且 target 為不同用戶（驗收會封鎖其中一個）；另備 1 筆同 target 的第二筆 open report，用以驗證「所有 open report 自動結案」 |
| 不需要         | 改 backend code；`/users/:id` 實頁、unban、用戶查詢框（P5）；CSP、全域 `429` / `401` toast、E2E（P7）      |

**驗收會真正封鎖測試帳號**，請只使用 seed 出來的帳號。Unban 在 P5 才有 UI，之前如需還原，用 `../backend/scripts/admin.sh unban <id>`（或 curl）。

---

## 2. 範圍

**做**

- `api/endpoints/reports.ts`：加 `dismissReport`、`banFromReport`。
- `api/types.ts`：加 `BanResponse`。
- `lib/noteRules.ts`：備註長度規則（§4.1）。
- `components/ConfirmModal.tsx`（§6）。
- `pages/ReportDetail/ActionCard.tsx`（§5），並掛入 `index.tsx`。
- Toast：`app.tsx` 掛 `Toast.Provider`（§7）。
- i18n 文案（§8）、`mockApi` 擴充（§10.1）、Vitest（§10）。

**不做**：見 §13。

---

## 3. API 層

### 3.1 `api/types.ts`

```ts
export interface BanResponse {
    status: "banned";
}
```

`ReportItem` 不需要改。P5 會再加 unban 的 `{status: "active"}`，本 phase 不預先定義。

### 3.2 `api/endpoints/reports.ts`

```ts
export function dismissReport(id: string, note?: string): Promise<ReportItem>;
export function banFromReport(id: string, note?: string): Promise<BanResponse>;
```

- `POST /admin/reports/${encodeURIComponent(id)}/dismiss` 與 `/ban`。**舉報頁一律使用 `reports/{id}/ban`，不使用 `users/{id}/ban`**（審計記為 `report.ban`，`portal-spec.md` §3.1）。
- Body 由 `buildNoteBody(note)`（§4.1）產生：`note` trim 後為空 → 送 `{}`；否則 `{note: <trimmed>}`。**絕不多送其他欄位**（backend `deny_unknown_fields`）。
- 使用 store token，不帶 `skipAuthRedirect`：已登入後 `401` 由 interceptor 自動登出（P1）。`404` 不登出。
- **不做 retry、不做 optimistic update、不做快取。** 這兩個 call 一旦逾時，使用者須自行判斷；backend 兩者皆 idempotent，重按是安全的。
- `dismissReport` 回傳的是「最新狀態」的 `ReportItem`，可能因 idempotent 而 `status !== "dismissed"`（§5.4）。**不可假設回應含 `evidence`**。

---

## 4. 共用邏輯

### 4.1 `lib/noteRules.ts`

```ts
export const NOTE_MAX_LENGTH = 200;
export function noteLength(note: string): number; // trim 後，以 code point 計
export function isNoteTooLong(note: string): boolean; // noteLength(note) > NOTE_MAX_LENGTH
export function buildNoteBody(note: string): {note?: string}; // trim；空則 {}
```

- backend 會 trim 後以字元計 ≤ 200。前端同樣 **先 trim 再計**，並以 `Array.from(trimmed).length` 計 code point，避免 emoji（JS `length` = 2）造成前端比 backend 嚴格。
- 非 Component 檔，camelCase 命名；函式用標準 `function` 宣告。

---

## 5. `ActionCard`

### 5.1 檔案

```
src/pages/ReportDetail/
├─ index.tsx        # 修改：aside 內 TargetCard 之後掛 ActionCard（status === "open"）
└─ ActionCard.tsx   # 新增：備註 + 駁回 + 封鎖 + ConfirmModal
```

一個 file 一個 component。mutation 邏輯寫在 `ActionCard` 內（Component 內的函式用 arrow function，不包 `useCallback`）。

### 5.2 顯示條件與版面

- `report.status === "open"` → `<ActionCard>`；否則維持 P3 的 `ResolvedCard`。**兩者互斥。**
- 位置：右欄 `aside` 內、`TargetCard` 之下。P3 已預留（`< lg` 順序 Header → Detail → Target → 操作 → Evidence 自然成立，不需改版面）。
- `aside` 為 sticky，卡片高度增加後須確認 `lg` 螢幕高度不足時仍可捲動到封鎖鍵（sticky 的 `self-start` 已處理；驗收手動檢查 1280×720）。

```
┌─ 處理 ─────────────────┐
│ 備註（選填）    12/200 │
│ [____________________] │
│ [      駁回          ] │  ← secondary，全寬
│ ────────────────────── │  ← 分隔線，上下 my-4
│ [    封鎖用戶        ] │  ← danger，全寬
│ 用戶已被封鎖（條件）   │
│ (錯誤條，條件)         │
└────────────────────────┘
```

### 5.3 欄位與按鈕

**備註**

- HeroUI `TextArea`，2 行，`aria-label`／可見 label「備註（選填）」。**純文字輸入**，不 trim 使用者輸入本身（僅送出時 trim）。
- 右下計數 `{n}/200`（`noteLength`）；`n > 200` → 計數紅色、欄位紅框 + 文字「備註最多 200 字」、**駁回與封鎖兩鍵皆停用**。
- backend 回 `400 VALIDATION_FAILED` 且 `details.field === "note"`（理論上前端已攔截，屬後備）→ 同樣紅框，顯示 backend `message`；使用者再編輯備註即清除此錯誤。
- 備註在成功前**不清空**；成功後會離開本頁，不需要重置。

**駁回（Dismiss）**

- Secondary 按鈕（黑邊白底），全寬。**點擊直接送出，不開 modal**（可逆性高，`ui-spec.md` §7.2）。

**封鎖用戶（Ban）**

- Danger 實心紅，全寬，**與駁回之間 `my-4` + 分隔線**（`portal-spec.md` §7：不可緊鄰）。
- 點擊 → 開 `ConfirmModal`（§6），`tone="danger"`，**不直接送出**。
- 啟用條件：`target.status === "active"` 且備註未超長。

| `target.status` | 封鎖鍵 | 提示（鍵下 `text-xs text-black/60`） |
| --------------- | ------ | ------------------------------------ |
| `active`        | 啟用   | —                                    |
| `banned`        | 停用   | 「用戶已被封鎖」                     |
| `deleted`       | 停用   | 「用戶已刪除，無法封鎖」             |
| 未知值          | 停用   | 不顯示提示，**不 throw**             |

- `deleted` 停用是依 `portal-spec.md` §3.1（ban 已刪除用戶 → `404`）；駁回在三種狀態下都可用。

### 5.4 送出流程與結果

**共通規矩（P5 照抄）**

- 同一時間只有一個 mutation：用 `submitting` ref 同步擋住（state 更新有一個 render 的空窗，不能只靠 `disabled`），再以 `pending` state 驅動 UI。
- 送出期間**整張卡所有按鈕與備註欄停用**；按鈕用 HeroUI `isPending`。
- 不 optimistic：只以 server 回應為準。
- 成功導向用 `navigate("/reports", {replace: true})`；若 `ActionCard` 已 unmount（使用者在等待期間自行離開），**只彈 toast，不 navigate**（用 mounted ref 判斷），避免把使用者拉走。
- 不 `console.log` 回應或錯誤物件。

**Dismiss 結果**

| 回應 / 錯誤                                | 行為                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `200` 且 `status === "dismissed"`          | success toast「已駁回」→ `navigate("/reports", {replace: true})`                                              |
| `200` 但 `status !== "dismissed"`          | **不是 dismiss 成功**：warning toast「此舉報已被處理」，**留在本頁**，呼叫 `reload()` 取得最新狀態（頁面隨即改為 `ResolvedCard`）。不使用回應直接覆蓋 state（回應可能沒有 `evidence`） |
| `404`                                      | 不 toast；`reload()`（`useReport` 會進入 `notFound`，顯示「舉報不存在」）                                     |
| `400` + `details.field === "note"`         | 備註欄紅框（見上）                                                                                           |
| `429` / `5xx` / 網絡錯誤                   | 卡片內 inline `ErrorCard`（`role="alert"`，不帶 `onRetry`；使用者直接再按駁回即重試）；`429` 顯示倒數          |
| `401`                                      | interceptor 登出 → `/login`（P1），本卡不另外處理                                                            |

**Ban 結果**（錯誤顯示在 modal 內，見 §6）

| 回應 / 錯誤                                | 行為                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `200 {status: "banned"}`                   | 關閉 modal → success toast「已封鎖」→ `navigate("/reports", {replace: true})`。**對已被封鎖的 user 也是 `200`（idempotent），一律視為成功** |
| `404`                                      | modal **保持開啟**，內容顯示「用戶已刪除或不存在，無法操作」；使用者關閉 modal 後 `reload()`（`portal-spec.md` §6） |
| `400` + `details.field === "note"`         | 關閉 modal，備註欄紅框 + message（使用者須回到欄位修改）                                                     |
| `429` / `5xx` / 網絡錯誤                   | modal 保持開啟，顯示 `ErrorCard`（含 `X-Request-Id`、`429` 倒數）；可再按確認重試或取消                       |
| `401`                                      | 同上，interceptor 登出                                                                                       |

**返回 `/reports` 的 tab**：一律回到預設 `待處理`（不記住 tab）。因為只有 `open` report 才有操作，回到「待處理」最符合預期。`Reports` 頁 mount 時本來就會重新 fetch（P2），不需額外 invalidate。**（P3 §12 留下的「是否記住 tab」在此定案：不記住。）**

---

## 6. `ConfirmModal`

通用二次確認框，P5 的 ban / unban 重用。依 `ui-spec.md` §4.5。

```ts
// components/ConfirmModal.tsx
{
    isOpen: boolean;
    title: string;
    targetId: string;
    consequences: readonly string[];
    warning?: string;
    confirmLabel: string;
    tone: "danger" | "default";
    pending: boolean;
    error: ApiError | null; // 由呼叫方持有並傳入
    onConfirm: () => void;
    onCancel: () => void;
}
```

**行為**

- HeroUI `Modal`（`Backdrop` / `Container` / `Dialog`，以官方當前文件為準；lightbox 用法見 `EvidenceSection.tsx`）。
- **目標 id 顯示全文**：`font-mono text-xs break-all`，可選取（`select-all`），label「目標用戶」。**不可用 `IdTag` 的縮寫版。**
- `consequences` 以 `<ul>` 列出，前有「此動作會：」。`warning` 用 warning 色系 `Alert`（`role="note"` 即可，不是錯誤）。
- **預設焦點在「取消」**：DOM 上 `Modal.CloseTrigger` 在最前面，react-aria 預設會 focus 第一個可 tab 元素，因此取消鍵須明確 `autoFocus`；必須有測試證明 Enter 不會直接確認。
- `pending` 期間：
  - 取消、確認皆停用，確認鍵 `isPending`（spinner）。
  - **不可** Esc / 點 backdrop / 點右上 ✕ 關閉（`isDismissable={!pending}`、`isKeyboardDismissDisabled={pending}`，✕ 同樣停用；prop 實際名稱以 HeroUI 文件為準，必要時於 `Modal` root 與 `Backdrop` 各自設定）。
- `error != null` → modal 內顯示 `ErrorCard`（置於按鈕上方）。**modal 不吞錯誤**：關不關由呼叫方決定。
- 確認鍵：`tone="danger"` 紅色實心；`default` 黑色實心。
- 確認鍵與取消鍵之外**沒有任何會提交的元素**（沒有 `<form>`，避免 Enter 在其他欄位觸發送出）。
- 關閉後 focus 返回觸發按鈕（HeroUI 預設；驗收時確認）。

**呼叫方（`ActionCard`）持有的 state**：`banOpen`、`banError`、`pending`。`onCancel` 在 `pending` 時為 no-op；開啟 modal 時先清掉 `banError`。

---

## 7. Toast

- `app.tsx`：在 `RouterProvider` 旁掛 `<Toast.Provider placement="top end" />`（HeroUI `Toast`，API 以官方當前文件為準）。掛在 router 之外，**使 toast 能跨路由存活**（成功後立即 `navigate`，toast 必須仍在）。
- 使用 `toast.success(...)` / `toast.warning(...)`；預設 4 秒自動消失、最多同時 3 個（HeroUI 預設，符合 `ui-spec.md` §5）。
- 本 phase **不發 error toast**（錯誤一律 inline / modal 內）；`ui-spec.md` 的「error toast 不自動消失」規則留待 P7 的全域 toast 實作（屆時用 `timeout: 0`）。
- Toast 文字全部經 `t()`，不放 user 內容、不放 id。
- 無障礙：成功 / warning 屬 `role="status"`，由 HeroUI 提供；驗收時確認螢幕閱讀器會念出（至少確認 DOM 有 live region）。

---

## 8. i18n 文案

新增 key（`i18n/zhHant.ts`，component 內**零硬編碼中文**，繁體書面語）：

```ts
reportActions: {
    title: "處理",
    noteLabel: "備註（選填）",
    noteCount: "{n}/200",
    noteTooLong: "備註最多 200 字",
    dismiss: "駁回",
    ban: "封鎖用戶",
    targetBanned: "用戶已被封鎖",
    targetDeleted: "用戶已刪除，無法封鎖",
    dismissedToast: "已駁回",
    bannedToast: "已封鎖",
    alreadyHandledToast: "此舉報已被處理",
    banNotFound: "用戶已刪除或不存在，無法操作",
},
confirmModal: {
    targetLabel: "目標用戶",
    consequencesIntro: "此動作會：",
    cancel: "取消",
    close: "關閉",
},
banConfirm: {
    title: "封鎖用戶",
    confirm: "確認封鎖",
    consequences: [
        "關閉對方所有進行中的 match（對方只會看到 match 消失）",
        "對方待處理的 hello 將靜默過期",
        "刪除對方的 push subscription",
        "針對對方的所有待處理舉報自動結案（已處置）",
        "對方進行中的即時連線立即中斷",
        "舉報人不會收到通知",
    ],
    warning: "帳號以裝置為基礎，被封鎖者可另開新帳號，封鎖不代表問題已解決。",
},
```

- `t()` 的 `TextKey` 型別只接受字串葉節點，因此副作用清單拆成 `banConfirm.consequence1`…`consequence6`，由 `ActionCard` 以 `t()` 組成陣列傳入 `ConfirmModal`，不改 `t()` 簽名。
- 副作用清單來源 `portal-spec.md` §3.1，**逐條對照**，不可自行刪減。
- 用詞統一（`ui-spec.md` §10）：封鎖 / 駁回 / 已處置 / 被舉報人 / 舉報人。
- `common.cancel` 不另設，用 `confirmModal.cancel`，避免兩處重複。

---

## 9. 安全要求

- **Ban 一律經 `ConfirmModal`**，沒有任何捷徑（鍵盤快捷、Enter 直送皆無）；Modal 內顯示目標 id 全文（`portal-spec.md` §7）。
- 危險鍵與駁回不相鄰（分隔線 + `my-4`），視覺為 danger 色。
- 備註當**純文字**：只送給 backend，不在畫面其他地方回顯為 HTML；不寫入 URL、storage、log。
- Request body 只含 `note`（`deny_unknown_fields`）；`id` 一律 `encodeURIComponent`。
- **不做背景重試**：失敗後只有使用者主動再按才會再送（避免燒 admin 失敗額度，`portal-spec.md` §5.2；雖然 token 正確的 request 不計失敗，但原則一致）。
- 不 `console.log` token、回應、完整 error 物件。
- UI 不得暗示「封鎖後事情已完結」：modal warning 必須出現（§8）。

---

## 10. 測試（Vitest + RTL）

### 10.1 測試基建

`src/test/mockApi.ts`：

- `RecordedRequest` 加 `method: string` 與 `body: unknown`（`JSON.parse(config.data)`，無 body 則 `undefined`），**向後兼容**（既有測試不應需要改動）。
- 其餘 fixture 沿用；`reportFixture({status: "dismissed", resolved_at: …})` 用於「已被處理」情境。

`src/test/setup.ts`：如 `Toast` / `Modal` 在 jsdom 需要額外 polyfill，只加最小者並註明原因（同 P2 `getAnimations` 做法）。

Toast 斷言：`vi.spyOn(toast, "success")` / `"warning"`（`toast` 自 `@heroui/react`），不依賴 toast 的實際渲染動畫。

### 10.2 案例

| 範圍                | 案例                                                                                                                                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `noteRules`         | trim 後再計長；200 字通過、201 字超長；emoji 以 code point 計（100 個 emoji = 100）；空白字串 `buildNoteBody` → `{}`；有內容 → `{note: trimmed}`                                                                                                                       |
| `dismissReport`     | `POST /admin/reports/<id>/dismiss`；id 含特殊字元會被 encode；無備註 body 為 `{}`；有備註 body 只有 `{note}`；`401` 已登入 → logout；`404` **不** logout                                                                                                                |
| `banFromReport`     | `POST /admin/reports/<id>/ban`（**不是** `/users/…`）；body 規則同上；`401` logout、`404` 不 logout                                                                                                                                                                    |
| `ConfirmModal`      | 顯示目標 id **全文**；顯示所有 `consequences` 與 `warning`；**初始 focus 在取消**，按 Enter 不觸發 `onConfirm`；`pending`：兩鍵停用、Esc 與點 backdrop 不關閉（`onCancel` 未被呼叫）；`error` 傳入時顯示 `ErrorCard`（含 request id）；`tone` 影響確認鍵樣式                |
| `ActionCard` 顯示   | `open` 顯示操作卡；`dismissed` / `actioned` 不顯示操作卡、顯示 `ResolvedCard`；`target.status` 為 `banned` / `deleted` → 封鎖鍵停用且有對應提示、駁回仍可用；未知 target status → 封鎖鍵停用、不 throw                                                                  |
| 備註                | 計數 `n/200`；超過 200 → 紅字、「備註最多 200 字」、**兩鍵停用**、不送出任何 request；backend `400 field=note` → 欄位紅框顯示 message，再編輯後清除；`400` 但 field 非 `note` → 走一般 inline `ErrorCard`                                                               |
| Dismiss 流程        | 點擊**不開 modal**、直接送出；成功（`status: "dismissed"`）→ `toast.success("已駁回")` 並導向 `/reports`（`replace`）；回應 `status: "actioned"` → `toast.warning("此舉報已被處理")`、**留在本頁**、觸發 refetch 後顯示 `ResolvedCard`、**未**呼叫 `toast.success`；`404` → refetch 後顯示「舉報不存在」；`500` → inline `ErrorCard`，再按可重試成功；`429` 顯示倒數 |
| Ban 流程            | 點「封鎖用戶」只開 modal、**未**送 request；modal 取消 → 無 request；確認 → 送 `POST …/ban`；成功 → modal 關、`toast.success("已封鎖")`、導向 `/reports`；對已封鎖者回 `200` 同樣成功；`404` → modal 保持開啟顯示「用戶已刪除或不存在，無法操作」，關閉後觸發 refetch；`500` / `429` → modal 內 `ErrorCard`、modal 保持開啟、可再試成功；備註於 body 中被帶上 |
| 防重複送出          | 連點駁回兩次只送 1 個 request；ban 確認連點兩次只送 1 個；pending 期間備註欄與所有按鈕停用；resolve 後（失敗情境）恢復可操作                                                                                                                                           |
| unmount 守護        | 送出後、回應前 unmount `ActionCard`，回應到達時**仍 toast、不 navigate**（無 React warning）                                                                                                                                                                           |
| 回歸                | P1–P3 既有測試全綠（尤其 `ReportDetail.test.tsx`：`open` report 現在會出現操作卡，需同步調整斷言，**不可**靠刪除斷言通過）                                                                                                                                              |

頁面測試以 `createMemoryRouter`（`/reports/:id` + `/reports` 兩條 route）包起來，才能斷言導向結果；用 `mockApi` handler 依 `method` + `url` 分流，handler 回 pending promise 模擬 in-flight。

---

## 11. 驗收標準（Definition of Done）

**自動**

- [ ] `pnpm test` 全綠（含 P1–P3 既有測試）。
- [ ] `pnpm build` 成功。
- [ ] `pnpm format` 後 `git diff` 無格式變動（留意 `pnpm format` 會掃 `design/`，如有變動須還原）。

**手動（對 P0 真 backend）**

- [ ] 開 open 的 R1：右欄見「被舉報人」卡 + 「處理」卡；封鎖鍵與駁回鍵之間有分隔線。
- [ ] 輸入 201 字備註：計數變紅、「備註最多 200 字」、兩鍵停用、Network 無 request；刪到 200 字恢復。
- [ ] **Dismiss**：填備註後按駁回 → toast「已駁回」→ 回到 `/reports`，該筆**不在**待處理列表；切到「全部」見其為「已駁回」；`admin.sh show <id>` 確認 `dismissed`；DevTools 確認 body 為 `{"note":"…"}`，無備註時為 `{}`。
- [ ] **Ban**：開 R2 → 按封鎖 → modal 顯示目標 **完整 UUID**、6 條副作用、warning；**一開啟 focus 即在「取消」**；按 Enter 不會封鎖；Esc 可取消（非 pending）。
- [ ] 確認封鎖 → toast「已封鎖」→ 回 `/reports`；target `status = banned`；**同一 target 的第二筆 open report 一併變為 `actioned`**；以 target 的 token 呼叫 `/v1/me` 回 `403 ACCOUNT_BANNED`。
- [ ] 重新開啟已被 ban 的 target 的另一筆已結案 report：顯示 `ResolvedCard`，**無操作卡**。
- [ ] **Idempotent**：以 curl 先 dismiss R3，再於另一個分頁（尚未重新整理、仍顯示 open）按駁回 → toast warning「此舉報已被處理」、留在本頁、頁面變為「已駁回」結果。
- [ ] **連點**：在 DevTools 將網速調為 Slow 3G，連點駁回 / 確認封鎖 5 次 → Network 只見 1 個 POST；modal 於 pending 期間 Esc / 點 backdrop 無法關閉。
- [ ] **錯誤**：停掉 backend 後按駁回 → inline「無法連線至伺服器」+ Request ID 區塊不出現（無 response）；重啟 backend 後再按成功。停 backend 後按確認封鎖 → modal 內顯示錯誤、modal 保持開啟。
- [ ] 以 curl 刪除（或使用一個 `deleted`）target 的 report：封鎖鍵停用 +「用戶已刪除，無法封鎖」，駁回仍可用。
- [ ] 1280×720、768、375 寬度：操作卡完整可見、可捲動到封鎖鍵、無橫向爆版；`< lg` 順序 Header → Detail → Target → 處理 → Evidence。
- [ ] 純鍵盤：可 Tab 到備註、駁回、封鎖；modal 內 focus 被困在 modal；關閉後 focus 回到「封鎖用戶」鍵。
- [ ] `grep` component 內無硬編碼中文。
- [ ] DevTools：token 不在 URL；無 `console.log` 輸出；請求只有 §3.2 列出的 `POST`。

**Repo**

- [ ] `git status` 只見預期檔案（§12）。

---

## 12. 交付物（預期變動檔案）

```
新增
  src/lib/noteRules.ts(+ .test.ts)
  src/components/ConfirmModal.tsx(+ .test.tsx)
  src/pages/ReportDetail/ActionCard.tsx(+ .test.tsx)
修改
  src/api/endpoints/reports.ts          # + dismissReport、banFromReport（及測試）
  src/api/types.ts                      # + BanResponse
  src/pages/ReportDetail/index.tsx      # aside 掛 ActionCard
  src/pages/ReportDetail/ReportDetail.test.tsx  # open report 現在有操作卡，調整斷言
  src/app.tsx                           # + Toast.Provider
  src/i18n/zhHant.ts                    # §8
  src/test/mockApi.ts                   # §10.1
  src/test/setup.ts                     # 僅在 Modal / Toast 需要 polyfill 時
```

---

## 13. 風險與處理

| 風險                                         | 徵兆                                         | 處理                                                                                                   |
| -------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 誤封錯對象                                   | 封鎖了非預期用戶                             | modal 顯示 id 全文、預設焦點在取消、無快捷路徑（§6、§9）                                               |
| Enter 誤確認                                 | 開 modal 後按 Enter 直接封鎖                 | 取消鍵明確 `autoFocus` + 專屬測試（§6、§10.2）                                                         |
| 重複送出                                     | 連點產生兩個 POST                            | `submitting` ref 同步擋 + `isPending`；專屬測試（§5.4）                                                |
| Dismiss 回 `200` 卻被當成功                  | 實際上已被 ban 動作結案，卻提示「已駁回」    | 比對 `status === "dismissed"`，否則 warning + refetch（§5.4）                                          |
| 用 dismiss 回應直接覆蓋頁面 state            | evidence 消失、頁面閃成「證據已清除」        | 一律 `reload()`，不使用回應覆蓋（§5.4）                                                                |
| 備註長度與 backend 計法不一致                | 前端放行，backend 回 `400`                   | 前端 trim + code point 計（只會比 backend 嚴格或相等）；`400 field=note` 仍有後備處理（§4.1、§5.3）     |
| 等待期間使用者已離開頁面                     | 回應到達後被強制拉回 `/reports`              | mounted ref，只 toast 不 navigate（§5.4）                                                              |
| Toast 隨路由切換消失                         | 成功後導向，看不到 toast                     | `Toast.Provider` 掛於 router 之外（§7）                                                                |
| HeroUI `Modal` pending 時仍可被 Esc 關閉     | 送出中誤關閉，錯誤結果看不到                 | `isDismissable` / `isKeyboardDismissDisabled` + ✕ 停用，專屬測試（§6）                                 |
| `t()` 不支援陣列                             | 副作用清單無法渲染                           | 直接 import `banConfirm.consequences`，不改 `t()` 簽名（§8）                                           |
| HeroUI `Modal` / `Toast` 於 jsdom 缺 API     | 測試 crash                                   | 加最小 polyfill 並註明（§10.1）                                                                        |
| 驗收真的封鎖了帳號後無法還原                 | seed 帳號被永久 ban                          | 只用 seed 帳號；以 `admin.sh unban`／curl 還原；P5 才有 UI                                             |
| `ReportDetail.test.tsx` 因新增操作卡而變紅   | `open` 狀態的既有斷言失敗                    | 調整斷言以反映新行為，不靠刪除測試（§10.2 回歸）                                                       |

---

## 14. 不屬於本 phase

- `/users/:id` 實頁、`banUser` / `unbanUser`、unban 的確認文案、`AdminShell` 用戶查詢框接線（P5；`ConfirmModal` 屬本 phase，P5 直接重用）。
- 全域 `429` / `401` toast、error toast 不自動消失的規則、閒置自動登出、CSP / `vercel.json`、Playwright E2E（P7）。
- 列表的「重新整理」按鈕與自動輪詢（MVP 不做）。
- 返回列表時記住 tab（本 phase 定案：不記住，§5.4）。
- Undo / 復原動作（backend 無對應能力；unban 不會還原 match / hello / push subscription，見 `portal-spec.md` §3.1）。
- 批次處理多筆 report。
