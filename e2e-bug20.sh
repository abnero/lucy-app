#!/bin/bash
# E2E tests for Bug #20 — run against preview
# Usage: bash e2e-bug20.sh
#
# Prerequisites:
# - .env.local must have NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#   SUPABASE_SERVICE_ROLE_KEY, VERCEL_AUTOMATION_BYPASS_SECRET
# - Dummy account bug26test+e2e@caribeno.fit must have a generated calendar

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

  RESULT=$(curl -s "$PREVIEW_URL/api/chat" \
    -H "x-vercel-protection-bypass: $BYPASS" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"messages\":[{\"role\":\"user\",\"content\":\"$msg\"}]}")

  RESPONSE=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('response','ERROR: '+str(d.get('error',''))))" 2>/dev/null || echo "PARSE ERROR: $RESULT")
  echo "LUCY: $RESPONSE"
  echo ""
}

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Bug #20 E2E Tests — $(date)  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Test 1: User specifies quantity in grams
chat "Ponme 200g de pechuga de pollo en el almuerzo del lunes" "TEST 1 — Usuario dicta 200g (debe ignorar)"

# Test 2: User mentions inventory constraint
chat "Solo tengo 100g de pollo en casa, ponme eso en la cena del martes" "TEST 2 — Inventario (debe sugerir alternativa)"

# Test 3: Snack with specific quantity
chat "Agrega 50g de almendras como snack el miércoles" "TEST 3 — Snack con cantidad dictada (debe calcular)"

# Test 4: Dense food in a meal with little budget
chat "Agrega aceite de coco al almuerzo del jueves" "TEST 4 — Alimento denso (puede dar 'no cabe')"

# Test 5: Units (huevos)
chat "Ponme 3 huevos en el desayuno del lunes" "TEST 5 — Cantidad en unidades (debe calcular)"

# Test 6: Protein powder as daily snack
chat "Agregame 30g de proteína en polvo como snack para todos los días" "TEST 6 — Caso Yiselle (debe calcular)"

echo ""
echo "═══ VALIDATION QUERY ═══"
echo "Run this in Supabase to check for suspicious quantities:"
echo ""
echo "SELECT a.nombre, c.cantidad, c.unidad, c.dia, c.comida"
echo "FROM calendario c JOIN alimentos a ON a.id = c.alimento_id"
echo "WHERE c.user_id = '$USER_ID' AND c.origen = 'chat'"
echo "  AND c.created_at > NOW() - INTERVAL '1 hour'"
echo "ORDER BY c.created_at DESC;"
echo ""
echo "═══ DONE ═══"
