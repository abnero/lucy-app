#!/bin/bash
# E2E tests for Bug #20 — run against preview
# Usage: bash e2e-bug20.sh

set -e

PREVIEW_URL="https://lucy-app-git-feat-bug-20-cantidad-estricta-abneros-projects.vercel.app"
BYPASS=$(grep VERCEL_AUTOMATION_BYPASS_SECRET .env.local | cut -d= -f2-)
SUPABASE_URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2-)
ANON_KEY=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local | cut -d= -f2-)
SERVICE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d= -f2-)
USER_ID="62ca1118-e989-4d8b-ac35-ea411ae7c71f"

# Set temp password and get token
curl -s "$SUPABASE_URL/auth/v1/admin/users/$USER_ID" \
  -X PUT \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"password": "e2e-temp-pass-2026!"}' > /dev/null

TOKEN=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"bug26test+e2e@caribeno.fit","password":"e2e-temp-pass-2026!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "Token obtained (${#TOKEN} chars)"
echo ""

chat() {
  local msg="$1"
  local label="$2"
  echo "═══ $label ═══"
  echo "USER: $msg"
  echo ""

  # Endpoint expects: { userId, accessToken, messages: [{role,content}] }
  BODY=$(python3 -c "
import json
print(json.dumps({
    'userId': '$USER_ID',
    'accessToken': '$TOKEN',
    'messages': [{'role': 'user', 'content': '''$msg'''}],
    'clientTime': '2026-04-26T10:00:00-04:00',
    'clientTimezone': 'America/Puerto_Rico'
}))
")

  RESULT=$(curl -s "$PREVIEW_URL/api/chat" \
    -H "x-vercel-protection-bypass: $BYPASS" \
    -H "Content-Type: application/json" \
    -d "$BODY")

  RESPONSE=$(echo "$RESULT" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    print(d.get('response', d.get('reply', 'ERROR: '+json.dumps(d))))
except:
    print('PARSE ERROR')
" 2>/dev/null)
  echo "LUCY: $RESPONSE"
  echo ""
  # Small delay to avoid rate limit
  sleep 3
}

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Bug #20 E2E Tests — $(date)                           ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

chat "Ponme 200g de pechuga de pollo en el almuerzo del lunes" "TEST 1 — Usuario dicta 200g (debe ignorar)"
chat "Solo tengo 100g de pollo en casa, ponme eso en la cena del martes" "TEST 2 — Inventario (debe sugerir alternativa)"
chat "Agrega 50g de almendras como snack el miércoles" "TEST 3 — Snack con cantidad dictada (debe calcular)"
chat "Agrega aceite de coco al almuerzo del jueves" "TEST 4 — Alimento denso"
chat "Ponme 3 huevos en el desayuno del lunes" "TEST 5 — Cantidad en unidades (debe calcular)"
chat "Agregame 30g de proteína en polvo como snack para todos los días" "TEST 6 — Caso Yiselle (debe calcular)"

echo "═══ DONE ═══"
