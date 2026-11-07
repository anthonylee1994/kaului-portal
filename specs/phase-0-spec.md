# Phase 0 Spec:Backend 聯調環境

上游:`portal-spec.md` §11 P0。預估 **0.25 日**。

**呢個 phase 唔寫 portal code。** 目標係喺 `backend` 本地 server 搞好三樣嘢,令 P1 起可以直接對真 backend 開發,唔使邊寫邊撞牆:

1. `/v1/admin/*` 已啟用(`ADMIN_TOKEN`)。
2. 瀏覽器由 `http://localhost:5174` 打 admin API 唔被 CORS 擋。
3. 有一組可重現嘅 seed 數據(舉報 + evidence),供 P2–P4 開發同驗收。

---

## 1. 前置條件

| 項目                          | 要求                                                   |
| ----------------------------- | ------------------------------------------------------ |
| Rust toolchain                | 可跑 `cargo run`(backend `README.md` §Local dev)       |
| `curl`、`jq`、`openssl`       | 已安裝                                                 |
| backend repo                  | `../backend`(同 `portal/` 同級)                        |
| Port                          | backend `8080`、portal `5174`;`5173` 留俾 PWA,唔好佔用 |
| **唔需要**改任何 backend code | CORS 純靠 `ALLOWED_ORIGINS`(`portal-spec.md` §2.3)     |

---

## 2. 工作項目

### 2.1 設定 backend `.env`

```bash
cd ../backend
cp .env.example .env        # 如已有 .env 就唔好覆蓋,逐行補
```

於 `backend/.env` 加入 / 修改:

```bash
ADMIN_TOKEN=<openssl rand -hex 32 嘅輸出>          # 64 字元,≥ 32
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
REGISTER_PER_HOUR=50                               # 見 §2.3,seed 數據要開多個帳號
```

注意:

- `ALLOWED_ORIGINS` 每項必須係 `scheme://host[:port]`,**唔可以**有 path、`*`;尾部 `/` 會被 trim。格式錯 backend 啟動即 panic(`config.rs`)。
- `ADMIN_TOKEN` < 32 字元亦會啟動 panic。
- `REGISTER_PER_HOUR` 預設 `5`(per IP);每次 seed 要開 4 個帳號,預設值只夠跑一次。調高只係本地開發用,**唔好**帶去正式環境。
- `.env` 唔好 commit。Token 唔好貼入 portal repo、聊天記錄或 issue。

Portal 側同步準備 `portal/.env.example`(P1 先建立,此處只記錄將會寫咩):

```bash
VITE_API_BASE=http://localhost:8080
```

### 2.2 啟動 backend 並驗證 admin + CORS

```bash
cd ../backend
LOG_FORMAT=pretty cargo run          # http://localhost:8080
```

**A. Admin 已啟用**(用 `scripts/admin.sh`,token 由環境變數傳入,唔入 shell history):

```bash
export ADMIN_TOKEN=<同 .env 一致>
../backend/scripts/admin.sh metrics            # 期望:200 + JSON(含 server_now、uptime_secs、jobs、sse、http…)
../backend/scripts/admin.sh reports open       # 期望:200 { items: [], has_more: false }(未 seed 前)
```

**B. 負向驗證**(確認 portal 之後要分流嘅三種錯誤真係見到):

```bash
# 錯 token → 401 UNAUTHENTICATED
curl -s -o /dev/null -w '%{http_code}\n' -H 'Authorization: Bearer wrong' http://localhost:8080/v1/admin/metrics

# 唔設 ADMIN_TOKEN 重啟 backend → 所有 /v1/admin/* 回 404 NOT_FOUND(驗完記得設返)
```

> **小心鎖 IP**:同一 IP 1 分鐘內失敗第 11 次起,連啱 token 都 `429`。負向驗證只試 1–2 次;`429` 場景留到 P1 / P7 再有計劃咁驗。

**C. CORS preflight**(模擬瀏覽器由 portal origin 發 request):

```bash
curl -si -X OPTIONS http://localhost:8080/v1/admin/metrics \
  -H 'Origin: http://localhost:5174' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization'
```

期望回應包含:

- `access-control-allow-origin: http://localhost:5174`
- `access-control-allow-headers` 含 `authorization`
- `access-control-allow-methods` 含 `GET`、`POST`

再驗未列入 allow-list 嘅 origin **冇**拎到 `access-control-allow-origin`(用 `Origin: http://localhost:9999`),確認 allow-list 真係生效而唔係全開。

**D. `X-Request-Id` 可讀**:

```bash
curl -si -H 'Origin: http://localhost:5174' -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:8080/v1/admin/metrics | grep -i 'x-request-id\|access-control-expose-headers'
```

期望 `access-control-expose-headers` 含 `x-request-id`(同 `retry-after`,P1 讀 `429` 倒數要用;如缺 `retry-after`,即時記入 §4 風險並回報 backend)。

### 2.3 Seed 數據

目標狀態:

| #   | 舉報                  | 用途                                                                              |
| --- | --------------------- | --------------------------------------------------------------------------------- |
| R1  | A 舉報 B,**有**聊天   | P3 驗 evidence messages(含 reverse 順序、兩側顯示)                                |
| R2  | C 舉報 D,**冇**聊天   | P3 驗 `messages = []` →「雙方冇聊天紀錄」                                         |
| R3+ | 額外 N 個(預設 55 個) | P2 驗 keyset 分頁(`limit` 預設 50,要 > 50 先見到「載入更多」)——**可選**,見 §2.3.2 |

#### 2.3.1 R1 + R2

放喺 `portal/scripts/seedReports.sh`(此 phase 一併建立;只供本地開發):

```bash
#!/usr/bin/env bash
# Seed 2 open reports into a LOCAL backend: R1 (with chat) and R2 (no chat).
# Needs: curl, jq. Uses 4 registrations (REGISTER_PER_HOUR must be >= 4).
set -euo pipefail

BASE="${API_BASE:-http://localhost:8080}"

function call() { # call TOKEN METHOD PATH [JSON_BODY]
  local token="$1" method="$2" path="$3" body="${4:-}"
  local args=(-sS -f -X "$method" -H "Authorization: Bearer $token" "$BASE$path")
  [ -n "$body" ] && args+=(-H 'content-type: application/json' --data-binary "$body")
  curl "${args[@]}"
}

function register() { curl -sS -f -X POST "$BASE/v1/auth/device"; }

function setup_user() { # setup_user JSON GENDER BIRTH_YEAR TITLE -> prints title id
  local token
  token="$(jq -r .token <<<"$1")"
  call "$token" PATCH /v1/me "{\"gender\":\"$2\",\"birth_year\":$3}" >/dev/null
  call "$token" PUT /v1/me/profile '{"show_gender":false,"tags":["coffee"]}' >/dev/null
  call "$token" PUT /v1/titles/mine "{\"body\":\"$4\"}" | jq -r .id
}

A="$(register)"; B="$(register)"; C="$(register)"; D="$(register)"
A_T="$(jq -r .token <<<"$A")"; B_T="$(jq -r .token <<<"$B")"
C_T="$(jq -r .token <<<"$C")"
B_ID="$(jq -r .user_id <<<"$B")"; D_ID="$(jq -r .user_id <<<"$D")"

setup_user "$A" male 1995 "seed reporter A" >/dev/null
TITLE_B="$(setup_user "$B" female 1999 "seed target B")"
setup_user "$C" male 1994 "seed reporter C" >/dev/null
setup_user "$D" female 1998 "seed target D" >/dev/null

# R1: A greets B, B accepts, they chat, then A reports B.
HELLO_ID="$(call "$A_T" POST "/v1/titles/$TITLE_B/hello" '{"message":"你好呀"}' | jq -r .hello_id)"
MATCH_ID="$(call "$B_T" POST "/v1/hellos/$HELLO_ID/accept" | jq -r .id)"
call "$A_T" POST "/v1/matches/$MATCH_ID/messages" '{"body":"第一句(舉報人)"}' >/dev/null
call "$B_T" POST "/v1/matches/$MATCH_ID/messages" '{"body":"第二句(被舉報人)"}' >/dev/null
call "$A_T" POST "/v1/matches/$MATCH_ID/messages" '{"body":"第三句(舉報人)"}' >/dev/null
call "$A_T" POST /v1/reports "{\"target_user_id\":\"$B_ID\",\"reason\":\"harassment\",\"detail\":\"seed R1: with chat\"}" >/dev/null

# R2: C reports D, no interaction at all.
call "$C_T" POST /v1/reports "{\"target_user_id\":\"$D_ID\",\"reason\":\"spam\",\"detail\":\"seed R2: no chat\"}" >/dev/null

echo "seeded. A=$(jq -r .user_id <<<"$A") B=$B_ID C=$(jq -r .user_id <<<"$C") D=$D_ID"
```

> 腳本內嘅 endpoint / body 形狀抄自 `backend/scripts/curl/phase3.sh`、`phase4.sh`、`phase5.sh`。如 backend 日後改動導致腳本失敗,以嗰幾個 curl suite 為準,唔好靠估。
>
> `POST /v1/auth/device` 回 `{ user_id, token }`。如 hello 要求 profile / title 先可以發出,上面 `setup_user` 已一併設定。

#### 2.3.2 R3+(分頁數據,可選)

P2 驗收需要 > 50 個 open report。兩個做法,擇一:

- **A. 臨時調細 `limit`**:喺 P2 開發時將 portal 列表 `limit` 暫時改 `2`,用 R1 + R2 即可驗「載入更多」同 `has_more`。**推薦**:唔使額外造 100+ 個帳號。
- **B. 批量造**:迴圈跑 `seedReports.sh`,每次 4 個帳號 2 份舉報,跑 ~28 次;需要 `REGISTER_PER_HOUR` ≥ 120 同 `REPORT_PER_DAY` 夠(預設 10,per reporter,因為每次都係新 reporter 所以唔會撞)。

#### 2.3.3 記低 seed 結果

跑完後執行:

```bash
../backend/scripts/admin.sh reports open
../backend/scripts/admin.sh show <R1 嘅 report id>     # 期望 evidence.messages.length == 3,新→舊
../backend/scripts/admin.sh show <R2 嘅 report id>     # 期望 evidence.messages == []
```

將 R1 / R2 嘅 report id、A / B / C / D 嘅 user id 抄落 `portal/.seed.local.md`(**加入 `.gitignore`**,只含 id,**唔含** user token / `ADMIN_TOKEN`)。P2–P5 手動測試會用。

---

## 3. 交付物

| 交付物                                         | 位置                            | 是否 commit      |
| ---------------------------------------------- | ------------------------------- | ---------------- |
| backend 本地 `.env` 已更新                     | `backend/.env`                  | 否               |
| Seed 腳本                                      | `portal/scripts/seedReports.sh` | 是               |
| Seed 結果記錄(只有 id)                         | `portal/.seed.local.md`         | 否(`.gitignore`) |
| `.gitignore` 加 `.seed.local.md`、`.env.local` | `portal/.gitignore`             | 是               |

---

## 4. 驗收標準(Definition of Done)

全部要打剔:

- [ ] `admin.sh metrics` 回 `200`,JSON 欄位同 `portal-spec.md` §3.2 一致(`server_now`、`uptime_secs`、`db`、`jobs`、`sse`、`http`、`events`)。
- [ ] 錯 token 回 `401`;唔設 `ADMIN_TOKEN` 回 `404`(驗完已還原)。
- [ ] Preflight 由 `http://localhost:5174` 通過,且 `localhost:9999` 唔通過。
- [ ] `access-control-expose-headers` 含 `x-request-id` 同 `retry-after`。
- [ ] Open 隊列有 ≥ 2 項;R1 `evidence.messages` 有 3 則、R2 `evidence.messages == []`。
- [ ] `ADMIN_TOKEN` 冇出現喺任何 git tracked 檔案、shell history(`admin.sh` 用環境變數)或 commit。
- [ ] `git status` 於 `portal/` 只見預期嘅新檔(`phase-0-spec.md`、`portal-spec.md`、`scripts/seedReports.sh`、`.gitignore`)。

---

## 5. 風險與處理

| 風險                                             | 徵兆                         | 處理                                                            |
| ------------------------------------------------ | ---------------------------- | --------------------------------------------------------------- |
| 驗證時連試錯 token 觸發 IP 鎖                    | 啱 token 都回 `429`          | 等 1 分鐘窗口過去;負向驗證限 1–2 次                             |
| `REGISTER_PER_HOUR` 用完                         | `POST /auth/device` 回 `429` | 調高 `.env` 並重啟 backend,或等 1 小時                          |
| `ALLOWED_ORIGINS` 格式錯                         | backend 啟動 panic           | 每項 `scheme://host[:port]`,逗號分隔,無 `*`、無 path            |
| `Access-Control-Expose-Headers` 缺 `retry-after` | P1 讀唔到 `429` 倒數         | 回報 backend 補 expose;portal 暫以固定 60 秒 fallback 並記入 P1 |
| PWA 同 portal 共用 allow-list                    | —                            | 已接受(`portal-spec.md` §2.3);保護靠 `ADMIN_TOKEN`              |
| Seed 腳本因 hello / profile 前置條件失敗         | `curl -f` 回 4xx 中斷        | 對照 `backend/scripts/curl/phase3.sh` 修正腳本                  |

---

## 6. 唔屬於本 phase

- 任何 portal 前端 code(Vite 初始化屬 P1)。
- 正式環境 `ALLOWED_ORIGINS`(加 `https://portal.kaului.com`,portal 部署喺 Vercel)——屬 P7 部署。
- 對 backend 加 endpoint(`portal-spec.md` §10 缺口,MVP 唔阻塞)。
