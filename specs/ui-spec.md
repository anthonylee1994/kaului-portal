# UI Spec:Kaului Portal

上游:`portal-spec.md` §4(畫面)、§6(錯誤處理)、§7(誤操作防護);實作承接 `phase-1-spec.md`(shell + login 已落地)。

呢份文件定義 **視覺語言、共用元件、每個畫面嘅版面同狀態**。功能行為(endpoint、錯誤分流、安全規則)以 `portal-spec.md` 為準,此處唔重複,只引用。

---

## 1. 設計原則

1. **單人營運、少 click、唔誤 ban**:危險操作視覺上同普通操作拉開距離,一律二次確認。
2. **資訊密度優先**:後台唔係消費產品,表格緊湊、字細啲、少裝飾。
3. **黑白為底,顏色只表達狀態**:除狀態色(紅 / 黃 / 綠 / 灰)外,唔引入品牌色。
4. **每個 async 區塊都要有四種狀態**:loading、empty、error、success,唔好留白。
5. **桌面優先**,窄屏唔爛(header wrap、表格橫向捲動),唔做手機專屬版面。
6. **所有 user 提供內容當純文字**(`detail`、Title、message `body`),見 `portal-spec.md` §7。

---

## 2. 視覺基礎

沿用現有實作(`src/styles/index.css`、`AdminShell`、`Login`),新頁面唔好另起一套。

### 2.1 技術

- 元件庫:HeroUI v3(`@heroui/react`)+ Tailwind v4;自訂樣式用 Less(`.less` import 放最後)。
- 優先用 HeroUI 現成元件(`Button`、`Card`、`Alert`、`Input`、`Chip`、`Table`、`Modal`、`Tabs`、`Tooltip`、`Toast`),**以官方當前文件為準**,唔好抄舊教學。
- 顏色 / 間距優先用 Tailwind utility,避免寫死 hex;已有寫死值只限下表。

### 2.2 色彩

| 用途             | 值                       | 備註                            |
| ---------------- | ------------------------ | ------------------------------- |
| 頁面背景         | `#f2f2f2`                | 已喺 `index.css`                |
| Header 背景      | `black`,字 `white`       | 非 active nav 用 `white/60`     |
| 卡片             | HeroUI `Card` 預設(白) | 外層 `shadow-sm`,Login 用 `lg`  |
| 主文字           | `black`                  | 次要文字 `black/60`             |
| 邊框             | `black/15`               | focus 時 `black`                |
| Danger           | Tailwind `red-600/700`   | 底 `red-50`、邊 `red-200`       |
| Warning          | Tailwind `amber-600/700` | 底 `amber-50`、邊 `amber-200`   |
| Success          | Tailwind `green-600/700` | 底 `green-50`、邊 `green-200`   |
| Neutral / 已刪除 | Tailwind `zinc-500/600`  | 底 `zinc-100`、邊 `zinc-200`    |
| Info             | HeroUI `status="accent"` | 例如「登入已失效」              |

**色彩唔可以係唯一訊號**:所有狀態同時有文字(chip 內文),唔靠顏色分辨(色盲 / 列印)。

### 2.3 字體與間距

- 字體:系統預設(Tailwind `font-sans`),唔載入 web font。ID、error message 用 `font-mono`。
- 字級:頁標題 `text-xl font-semibold`;區塊標題 `text-base font-semibold`;內文 `text-sm`;輔助 / 時間 `text-xs text-black/60`。
- 版面容器:`mx-auto max-w-7xl px-4 sm:px-6`(同 shell 一致);內容垂直間距 `gap-4`,卡片內 `gap-3`。
- 圓角:卡片 `rounded-2xl`(HeroUI Card 預設),chip / 按鈕跟 HeroUI 預設。

### 2.4 動效

- 只用 HeroUI 預設 transition(hover、modal 進出);**唔加**頁面轉場、skeleton shimmer 以外嘅動畫。
- 尊重 `prefers-reduced-motion`。

---

## 3. 全局 Shell(已實作,補充規格)

```
┌──────────────────────────────────────────────────────────────┐
│ Kaului 後台系統   舉報  系統健康        [user id 查詢][查詢][登出] │  黑底
└──────────────────────────────────────────────────────────────┘
│  <main>  max-w-7xl                                            │
```

- Nav active:`font-semibold text-white`;其餘 `text-white/60`,hover 變白。
- `/reports/:id` 屬於「舉報」,`/users/:id` 唔高亮任何 nav(冇對應 nav)。
- User id 查詢框(P5 接線):`md` 以上顯示;`< md` 隱藏,改喺 `/users/:id` 頁頂查詢(見 §7.4)。Enter = 送出;輸入 `trim()`,空值唔送;送出後導向 `/users/<id>`,唔 clear 輸入。
- 「登出」:outline 按鈕,點擊即登出,**唔需確認**(純 client 動作,無副作用)。
- Header 唔 sticky(後台頁面長度有限,減少遮擋)。

---

## 4. 共用元件(P2 / P4 建立)

每個元件一個檔(`components/XxxYyy.tsx`),文案全部經 `i18n`。

### 4.1 `StatusChip`

統一處理 report status 同 user status,避免兩處各寫一套顏色。

| 類別          | 值          | 文案(zh-Hant) | 顏色    |
| ------------- | ----------- | -------------- | ------- |
| ReportStatus  | `open`      | 待處理         | amber   |
| ReportStatus  | `dismissed` | 已駁回         | zinc    |
| ReportStatus  | `actioned`  | 已處置         | green   |
| UserStatus    | `active`    | 正常           | green   |
| UserStatus    | `banned`    | 已封鎖         | red     |
| UserStatus    | `deleted`   | 已刪除         | zinc    |

Props:`{kind: "report" | "user"; value: ReportStatus | UserStatus}`。未知值(backend 新增)→ 顯示原字串 + zinc,**唔 throw**。

### 4.2 `ReasonChip`

| 值              | 文案     |
| --------------- | -------- |
| `spam`          | 垃圾訊息 |
| `harassment`    | 騷擾     |
| `inappropriate` | 不當內容 |
| `underage`      | 疑似未成年 |
| `other`         | 其他     |

- `underage` 用 red(最嚴重,優先睇);其餘 neutral(黑字、`black/15` 邊)。
- 未知值同 `StatusChip` 處理。

### 4.3 `IdTag`

- 顯示 UUID **最後 8 字元**(backend 係 UUIDv7,前 8 hex 係 timestamp 高位,同批建立嘅 ID 前綴相同,肉眼分唔到),`font-mono text-xs`,例如 `9c1e7a4b`;長度 < 8 原樣顯示。
- 點擊複製**全文**,按鈕內短暫變「已複製」(1.5 秒);複製失敗(無 clipboard 權限)→ 唔報錯,tooltip 顯示全文俾人手動揀。
- Hover tooltip 顯示全文 ID。
- `<button type="button">`,可鍵盤操作(Enter / Space),`aria-label`「複製 ID」。
- 表格 row 本身可點擊跳轉,`IdTag` 點擊要 `stopPropagation`,避免複製同時跳頁。

### 4.4 `TimeText`

- Props:epoch **毫秒**。
- 顯示 `相對時間`(主),`title` / tooltip 顯示絕對時間(`YYYY-MM-DD HH:mm:ss`,瀏覽器本地時區)。
- 用戶頁 / 詳情頁要同時顯示兩者:`2026-11-07 14:03:21(3 小時前)`,以 prop `mode="both"` 切換。
- 相對時間粒度:`< 1 分鐘` 剛剛;`< 1 小時` N 分鐘前;`< 24 小時` N 小時前;`< 30 日` N 日前;其餘顯示絕對日期。
- 未來時間(時鐘偏差)→ 顯示「剛剛」,唔顯示負數。
- 以 `<time dateTime>` 渲染。唔做實時 tick(MVP),頁面 refetch 時更新。

### 4.5 `ConfirmModal`(P4 建立,P5 重用)

通用二次確認框。

```
┌────────────────────────────────────┐
│ 封鎖用戶                      [ ✕ ] │
├────────────────────────────────────┤
│ 目標用戶                            │
│ 0192f3a1-xxxx-xxxx-xxxx-xxxxxxxxxxxx │  ← 全文,font-mono,可選取
│                                    │
│ 呢個動作會:                         │
│  • 關閉對方所有進行中嘅 match …      │
│  • …                               │
│ ⚠ 帳號係 device-based,…             │  ← warning Alert
├────────────────────────────────────┤
│                   [取消]  [確認封鎖] │  ← 確認鍵 danger
└────────────────────────────────────┘
```

Props:`title`、`targetId`、`consequences: string[]`、`warning?: string`、`confirmLabel`、`tone: "danger" | "default"`、`pending`、`onConfirm`、`onCancel`。

- **預設焦點喺「取消」**(防 Enter 誤確認)。
- `pending` 期間:兩個按鈕禁用、確認鍵顯示 spinner、**唔可** Esc / 點 backdrop 關閉。
- 錯誤唔喺 modal 內吞掉:`onConfirm` throw → modal 保持開啟,內部顯示 danger `Alert`(`message` + `X-Request-Id`),可再試或取消。
- 確認鍵 `tone="danger"` 用紅色實心;`default`(例如 unban)用黑色實心。
- 目標 ID 必須顯示**全文**(`portal-spec.md` §7)。
- 副作用文案來源:`portal-spec.md` §3.1;Ban 同 Unban 各自一組,放 `i18n`。

---

## 5. 狀態慣例(全頁通用)

| 狀態    | 呈現                                                                                         |
| ------- | -------------------------------------------------------------------------------------------- |
| Loading | 首次載入:骨架(表格 5 行 / 卡片灰塊);重新整理:保留舊內容 + 右上 spinner,**唔清空**           |
| Empty   | 置中、`text-black/60`、一句說明 + 可選次要動作;唔用 emoji                                    |
| Error   | `ErrorCard`:標題(按 `portal-spec.md` §6)、`X-Request-Id`(`font-mono`,可複製)、「重試」按鈕 |
| Success | 內容 + 操作結果用 Toast                                                                      |

- **`ErrorCard`** 係共用元件(`components/ErrorCard.tsx`),Props:`{error: ApiError; onRetry?: () => void; title?: string}`。`429` 時額外顯示倒數。
- **Toast**:右上、4 秒自動消失;error toast 唔自動消失直到手動關。同一時間最多疊 3 個。
- **按鈕 pending**:用 HeroUI `isPending`;所有 mutation 送出期間同區所有按鈕禁用(防雙擊,`portal-spec.md` §5.1)。
- **切 tab / 路由**:先清舊資料再顯示 loading,避免殘留上一個 tab 嘅內容(P2 驗收項)。
- **Focus 管理**:路由切換後 focus 移到頁標題(`tabIndex={-1}`),方便鍵盤 / 螢幕閱讀器用家。

---

## 6. `/login`(已實作)

置中卡片,背景 `#f2f2f2`;上方鎖頭 icon(黑底圓角方塊)+ 標題 + 副標;卡片內:expired info 條(條件)、令牌欄、錯誤 `Alert`、登入按鈕。

- 錯誤 `Alert` 用 danger 色系(`red-50` 底、`red-200` 邊、`red-700` 字),見 `src/pages/Login/index.tsx`。
- 錯誤出現時令牌欄邊框轉 `red-300`。
- `429` 倒數期間按鈕禁用,文案內嵌秒數,歸零後錯誤消失。
- 錯誤分流文案與條件以 `phase-1-spec.md` §5.3 為準。
- 本文件唔改動此頁,僅作視覺基準:**其他頁嘅卡片、錯誤條、輸入欄樣式要同呢頁一致**。

---

## 7. 各畫面規格

### 7.1 `/reports` 舉報隊列(P2)

```
舉報隊列                                         [重新整理]
[ 待處理 ] [ 全部 ]                                           ← Tabs
┌──────────────────────────────────────────────────────────┐
│ 時間      原因     被舉報人           累犯  舉報人    狀態   │
│ 3 分鐘前  騷擾     9c1e7a4b [正常]    ② …   5d03b2f8  待處理 │
│ 1 小時前  垃圾訊息 e41a60c7 [已封鎖]  ③  …   2b8f9d13  已處置 │
└──────────────────────────────────────────────────────────┘
                       [ 載入更多 ]
```

**表格欄**(依 `portal-spec.md` §4.3):

| 欄       | 內容                                              | 對齊 |
| -------- | ------------------------------------------------- | ---- |
| 時間     | `TimeText`                                        | 左   |
| 原因     | `ReasonChip`                                      | 左   |
| 被舉報人 | `IdTag` + `StatusChip(user)`                      | 左   |
| 累犯     | `target.open_reports`;**≥ 3 紅色粗體 + 紅色 chip** | 右   |
| 舉報人   | `IdTag`                                           | 左   |
| 狀態     | `StatusChip(report)`                              | 左   |

**互動**

- 整行可點 → `/reports/:id`;`cursor-pointer`、hover `bg-black/5`;行內 `IdTag` 唔觸發跳轉(§4.3)。行用 `<a>` / `role="link"` 令中鍵、Cmd+Click 可開新 tab。
- Tabs:**待處理**(預設)/ **全部**;tab 狀態同步到 URL `?status=open|all`,refresh 保持,瀏覽器返回鍵正常。
- 「載入更多」:表格底置中、outline 按鈕;載入中 `isPending`;`has_more=false` 隱藏(**唔顯示**「冇更多」字句)。
- 「重新整理」:右上;重置列表至第一頁。
- 窄屏:表格外包 `overflow-x-auto`,保持欄位唔折行。

**狀態**

| 狀態             | 呈現                                                       |
| ---------------- | ---------------------------------------------------------- |
| Loading(首次)  | 表頭 + 5 行骨架                                            |
| Empty(待處理)  | 「冇待處理舉報」                                           |
| Empty(全部)    | 「未有任何舉報」                                           |
| Error            | `ErrorCard` + 重試(列表區位置,tabs 仍可用)                |
| 載入更多失敗     | 表格底顯示 inline 錯誤 + 「重試」,**保留**已載入嘅行       |

### 7.2 `/reports/:id` 舉報詳情(P3、P4)

桌面兩欄(`lg:grid-cols-3`):左 2 欄 = 內容,右 1 欄 = Target 卡 + 操作列(sticky `top-4`);`< lg` 單欄,順序:Header → Detail → Target → 操作 → Evidence。

```
← 返回舉報隊列
┌─ Header ───────────────────────────────┐ ┌─ 被舉報人 ──────────┐
│ [騷擾] [待處理]   建立:… 結案:…        │ │ 0192f3a1 [正常]      │
├─ 舉報說明 ─────────────────────────────┤ │ 待處理舉報:3         │
│ (純文字)                               │ │ [查看用戶 →]         │
├─ 證據 ─────────────────────────────────┤ ├─ 處理 ───────────────┤
│ ℹ 證據係舉報當刻 snapshot,唔會更新     │ │ 備註(選填)  12/200  │
│ Title:xxx        [頭像]                 │ │ [____________]       │
│ ┌ 聊天(舊→新)───────────────────────┐ │ │ [駁回]               │
│ │ 舉報人:…              (左,灰泡)   │ │ │                      │
│ │           被舉報人:… (右,白泡)    │ │ │ ──────────────────  │
│ └────────────────────────────────────┘ │ │ [封鎖用戶]  ← danger │
└────────────────────────────────────────┘ └──────────────────────┘
```

**Header 卡**:`ReasonChip` + `StatusChip`;建立時間(`TimeText mode="both"`);已結案加「結案時間」。

**舉報說明**:`detail` 以 `whitespace-pre-wrap break-words` 純文字渲染;`null` →「(無說明)」`text-black/60`。

**Target 卡**:`IdTag`(此處用全文 `font-mono text-xs break-all`)、`StatusChip(user)`、待處理舉報數(≥ 3 紅色)、「查看用戶」連去 `/users/:id`。

**Evidence**

- 頂部 info 條:「證據係舉報當刻 snapshot,唔會更新」,常駐。
- Title:`text-base`,`null` →「(無 Title)」。頭像 48×48 圓形:`referrerPolicy="no-referrer"`、`loading="lazy"`,`onError` 或 `null` → 灰底人形 icon 佔位。
- 聊天:**舊→新**(前端 reverse)。以 `sender_id` 分側:
    - 舉報人:靠左,`bg-black/5`,上方細字「舉報人」。
    - 被舉報人:靠右,白底 + `border-black/15`,上方細字「被舉報人」。
    - 每則底部 `TimeText`(`text-xs`)。
    - `kind=text`:純文字,`whitespace-pre-wrap break-words`;`body` null → 「(空白訊息)」。
    - `kind=image`:縮圖(最大 `160×160`,`object-cover`,`rounded-lg`),`referrerPolicy="no-referrer"`、`loading="lazy"`;點擊開 lightbox(HeroUI `Modal`),大圖 `max-h-[80vh]`,Esc / backdrop 關閉。圖片載入失敗 → 「圖片無法載入」佔位。
    - **唔將 `image_url` / `avatar_url` 放入 `href`**(`portal-spec.md` §7)。
- 聊天容器 `max-h-[480px] overflow-y-auto`,預設捲到底(最新)。
- 兩種空狀態:`evidence == null` →「證據已過保留期(90 日)被清除」;`messages` 空 →「雙方冇聊天紀錄」。

**操作列**(右欄 sticky 卡,P4)

| `report.status` | 呈現                                                        |
| --------------- | ----------------------------------------------------------- |
| `open`          | 備註欄 + 駁回 + 封鎖                                        |
| `dismissed`     | 唯讀:「已駁回」+ 結案時間                                   |
| `actioned`      | 唯讀:「已處置」+ 結案時間                                   |

- 備註:`TextArea`(2 行),下方右對齊字數計數 `n/200`;`> 200` 計數變紅、**兩個按鈕禁用**、欄位紅框 +「備註最多 200 字」;backend `400 details.field=note` 同樣標紅並顯示 message。
- **駁回**:secondary 按鈕(黑邊白底),全寬。點擊直接送出(可逆性高,唔需 modal)。
- **封鎖用戶**:danger 實心紅,全寬,**與駁回之間隔 `my-4` 並加分隔線**(`portal-spec.md` §7:唔貼近)。點擊開 `ConfirmModal`(§4.5),`tone="danger"`。
- `target.status === "banned"`:封鎖鍵禁用,下方 `text-xs` 提示「用戶已被封鎖」。
- 送出期間:整張操作卡所有按鈕同備註欄禁用。
- 成功:Toast「已駁回」/「已封鎖」→ 返回 `/reports`(`replace`,觸發 refetch)。
- Dismiss 回 `200` 但 `status !== "dismissed"`:**唔**返回列表;就地更新顯示最新狀態,Toast(warning)「此舉報已被處理」。
- `404` @ ban:modal 內顯示「用戶已刪除或唔存在,無法操作」,關閉後 refetch 詳情。

**狀態**

| 狀態         | 呈現                                                       |
| ------------ | ---------------------------------------------------------- |
| Loading      | Header / Detail / Evidence 各一個骨架卡                    |
| 404          | 置中「舉報唔存在」+ 「返回舉報隊列」按鈕                   |
| Error        | `ErrorCard` + 重試                                         |

### 7.3 Ban / Unban 確認框內容

**Ban**(舉報頁 + 用戶頁共用,P4)

- 標題:「封鎖用戶」
- 副作用清單(`portal-spec.md` §3.1):
    - 關閉對方所有進行中嘅 match(對方只會見到 match 冇咗)
    - 對方待處理嘅 hello 靜默過期
    - 刪除對方嘅 push subscription
    - 針對對方嘅**所有**待處理舉報自動結案(已處置)
    - 對方已開住嘅即時連線即時中斷
    - 舉報人**唔會**收到通知
- Warning:「帳號係 device-based,被封鎖者可以開新帳號,封鎖唔代表問題解決。」
- 確認鍵:「確認封鎖」(danger)。

**Unban**(用戶頁,P5)

- 標題:「解除封鎖」
- 內容:「解除後,用戶可再次使用 app。」
- Warning:「**唔會恢復**之前被關閉嘅 match、hello 同 push subscription;Title / profile 會自然返嚟。」
- 確認鍵:「確認解封」(default 黑色)。

### 7.4 `/users/:id` 用戶(P5)

```
[ 輸入 user id 查詢 ____________ ][查詢]                     ← 頁頂(< md 唯一入口)
┌──────────────────────────────────────────────┐
│ 0192f3a1-xxxx-xxxx-xxxx-xxxxxxxxxxxx   [正常] │
├──────────────────────────────────────────────┤
│ 建立時間      2026-11-07 14:03(3 日前)       │
│ 最後活躍      2026-11-10 09:12(2 小時前)     │
│ 收件箱數量    4                               │
│ 待處理舉報    1                               │
│ 累計被舉報    5                               │
│ 有 active Title  是                           │
├──────────────────────────────────────────────┤
│ [封鎖用戶]                                    │
│ 呢個用戶嘅舉報 (暫未支援)                     │
└──────────────────────────────────────────────┘
```

- `AdminUser` 全部欄位以 description list(`dl`)渲染;label `text-black/60`,value `text-black`;`待處理舉報 ≥ 3` 紅色。
- ID 顯示全文 + 複製按鈕。
- 操作:
    - `active` → 「封鎖用戶」(danger,開 `ConfirmModal`)。
    - `banned` → 「解除封鎖」(黑色實心,開 `ConfirmModal`)。
    - `deleted` → 唔顯示操作,顯示灰色說明「用戶已刪除,無法操作」。
    - 備註欄同 §7.2 規則(≤ 200)。
- 「呢個用戶嘅舉報」:disabled 文字連結 + tooltip「需要 backend 支援」,**唔可點**。
- 查詢框:`trim`、空值唔送、Enter 送出;`404` 時頁面顯示「用戶唔存在或已刪除」置中空狀態,**查詢框保持可用**(方便即刻再查)。
- ban / unban 成功:Toast + **就地 refetch**(唔跳頁),chip 同按鈕即時更新。
- `404` @ ban / unban:Toast(error)「用戶已刪除或唔存在,無法操作」+ refetch。

### 7.5 `/health` 系統健康(P6)

```
系統健康                         更新於 5 秒前   [重新整理]
┌概覽────────┐┌DB──────────────┐┌Jobs────────────┐┌限流──────────┐
│ 運行時間   ││ 寫入等待(ms)  ││ ready   0      ││ api       0   │
│ 3 日 4 時  ││ p50 p95 p99 max││ locked  0      ││ admin_fail 2 ⚠│
│ SSE 連線 12││ busy 0         ││ failed  0      ││ …(動態)      │
│ 5xx   0    ││                ││ 最舊 —         ││               │
│            ││                ││ latency 同上   ││               │
└────────────┘└────────────────┘└────────────────┘└──────────────┘
失敗任務(dead-letter)
┌ kind  嘗試  最後錯誤(截斷)   失敗時間 ────────────────────────┐
```

- 卡片格:`xl:grid-cols-4 md:grid-cols-2 grid-cols-1`;每張卡標題 + 數據列。
- 數值用 `tabular-nums`,右對齊,`font-mono`。
- **閾值顏色**(顏色 + 文字 / icon 並用):

| 指標                         | 條件   | 呈現                  |
| ---------------------------- | ------ | --------------------- |
| `db.sqlite_busy_total`       | `> 0`  | 紅色 + 「⚠」          |
| `jobs.failed_total`          | `> 0`  | 紅色 + 「⚠」          |
| `rate_limited_total.api`     | `> 0`  | 黃色 + tooltip「檢查 PWA 有冇輪詢」 |
| `rate_limited_total.admin_fail` | `> 0` | 黃色 + tooltip「有人撞 token」 |
| `oldest_ready_age_ms`        | `null` | 「—」                 |

- `rate_limited_total` 按 key **動態**逐行渲染,**唔寫死 key 名**;冇 key → 「冇限流紀錄」。
- `Hist` 顯示:`p50 / p95 / p99 / max`(ms),`count` 作 tooltip。
- Uptime 人類可讀:`N 日 N 時`、`N 時 N 分`、`N 分鐘`。
- 頂部「更新於 N 秒前」+ 手動刷新;自動 refresh 規則(15 秒、`document.hidden` 暫停、`401` 停止)以 `portal-spec.md` §4.6 / P6 為準。自動 refresh 期間**保留舊數據**,唔閃爍。
- Failed jobs 表:欄 `kind`(`font-mono`)、`attempts`(右對齊)、`last_error`、`failed_at`(`TimeText mode="both"`)。`last_error` 預設截斷 2 行(`line-clamp-2`),有溢出先顯示「展開 / 收起」;展開後 `font-mono text-xs whitespace-pre-wrap break-words`。`null` →「—」。純唯讀,**唔放任何操作按鈕**。
- 空狀態(failed jobs):「冇失敗任務」。
- Metrics 同 jobs 兩個請求**獨立**處理錯誤:一邊失敗唔影響另一邊,各自 `ErrorCard`。

### 7.6 404 頁(已實作)

置中:標題「搵唔到呢個頁面」+「返回舉報隊列」按鈕。保持現狀。

---

## 8. 無障礙(Accessibility)

- 所有互動元素可鍵盤操作,focus ring 可見(唔好 `outline-none` 而冇替代)。
- Icon-only 按鈕必有 `aria-label`。
- 表格用語意 `<table>`(HeroUI `Table`),可點擊行須有真 `<a>`(§7.1)。
- 狀態變化(Toast、錯誤條)用 `role="status"` / `role="alert"`:成功 / info = `status`,錯誤 = `alert`。
- Modal:focus trap、Esc 關閉(`pending` 除外)、關閉後 focus 返回觸發元素。
- 色彩對比 ≥ WCAG AA(`text-black/60` 於 `#f2f2f2` 約 4.6:1,**唔好再淡**)。
- 圖片 `alt`:avatar「頭像」、聊天圖「聊天圖片」;user 內容唔放入 `alt`。

---

## 9. 響應式

| 斷點           | 行為                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| `< sm`(640)  | Header nav 換行置底;表格橫向捲動;詳情單欄                              |
| `< md`(768)  | 全局 user id 查詢框隱藏(用戶頁頂有查詢)                                |
| `< lg`(1024) | 詳情頁單欄,操作卡唔 sticky                                             |
| `≥ xl`(1280) | Health 四欄                                                            |

`max-w-7xl` 以上唔再加寬。

---

## 10. 文案(i18n)規則

- 所有可見文字放 `i18n/zhHant.ts`,component 內**零硬編碼中文**(`phase-1-spec.md` §8)。
- 新增 key 按頁分組:`reports.*`、`reportDetail.*`、`user.*`、`health.*`、`common.*`(chip 文案、`ErrorCard`、Toast、時間格式)。
- 語氣:繁體書面語為主;沿用已定嘅粵語提示字眼(「連唔到 server」「搵唔到」)。同一概念全站統一用詞:
  - 封鎖 / 解除封鎖(唔用 ban / unban 作 UI 字眼)
  - 駁回(dismiss)、已處置(actioned)
  - 被舉報人(target)、舉報人(reporter)
- 動態文案用 `t(key, {param})` 插值,唔拼字串。

---

## 11. 驗收清單(UI 層)

**視覺一致**

- [ ] 新頁面卡片、錯誤條、輸入欄樣式與 `/login` 一致(§2、§6)。
- [ ] 全站狀態 chip 只經 `StatusChip` / `ReasonChip` 渲染,冇內嵌重複顏色邏輯。
- [ ] 狀態唔單靠顏色表達。

**互動**

- [ ] 每個 async 區塊有 loading / empty / error 三態(§5)。
- [ ] 所有 mutation 送出期間同區按鈕禁用;雙擊只送一次。
- [ ] `ConfirmModal` 預設焦點喺取消;`pending` 時唔可關閉;目標 ID 顯示全文。
- [ ] 封鎖鍵與駁回鍵之間有分隔,視覺為 danger 色。
- [ ] `IdTag` 點擊只複製、唔觸發 row 跳轉。
- [ ] Tab 狀態寫入 URL,refresh / 返回鍵行為正確。

**內容安全**

- [ ] `<script>`、HTML 字元於 `detail` / `body` / Title 原樣顯示為文字。
- [ ] `image_url` / `avatar_url` 只用於 `<img src>`,冇出現於任何 `href`。
- [ ] 圖片全部帶 `referrerPolicy="no-referrer"`、`loading="lazy"`,失敗有佔位。

**無障礙 / 響應式**

- [ ] 純鍵盤可完成:登入 → 開舉報 → 駁回 / 封鎖(含 modal)。
- [ ] 1280 / 1024 / 768 / 375 寬度逐一過,冇橫向爆版(表格內捲動除外)。
- [ ] Icon-only 按鈕全部有 `aria-label`。

**Repo**

- [ ] `pnpm format` 後 `git diff` 冇格式變動。
- [ ] Component 內冇硬編碼中文(`grep` 驗證)。

---

## 12. 唔屬於本文件

- Backend 缺口(用戶列表、by-target 舉報、`admin_actions` 瀏覽):見 `portal-spec.md` §10;UI 只放 disabled 佔位。
- 深色模式(MVP 唔做)。
- 手機專屬版面。
- 多語言切換(只 `zh-Hant`)。
- 品牌 logo / favicon 設計(沿用現有鎖頭 icon)。
