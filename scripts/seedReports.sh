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
