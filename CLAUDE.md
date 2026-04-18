# Lucy — Contexto del Proyecto

## Stack
Next.js 14, Supabase (anbpsybyipvbczzuqkjw), Anthropic claude-sonnet-4-6, Vercel, lucy.fit
Repo: github.com/abnero/lucy-app

## Reglas absolutas antes de hacer cualquier cambio
1. NUNCA hacer push sin verificar primero en localhost
2. NUNCA modificar tablas de Supabase con usuarias reales sin confirmar con Abner
3. SIEMPRE verificar en Supabase que el cambio tomó efecto después de un push
4. Si no estás seguro de algo, PREGUNTAR antes de ejecutar — nunca asumir
5. NUNCA mandarle un prompt a Code sin estar seguro primero

## Fórmula correcta de calorías
- unidad_medida = 'unidad': cal = cantidad × calorias_por_unidad
- unidad_medida = 'gramos'/'ml': cal = cantidad × calorias_por_unidad / porcion_base
⚠️ NUNCA dividir por 100 fijo — siempre usar porcion_base del alimento

## Cuenta de prueba
coachabner@caribeno.fit (admin + coach)
abnero@gmail.com (coach registrado)

## Bug pendiente PRIORIDAD ALTA
agregar_ingrediente_a_comida siempre guarda porcion_base como cantidad en vez
de calcular la cantidad óptima. Fix: el tool_result debe incluir factor_conversion,
unidad_display, porcion_min, porcion_max, calorias_por_unidad para que Claude
calcule la cantidad correcta basada en la brecha calórica del día.

## Lo que falta para el lanzamiento (semana del 21 abril)
- Landing page: fotos reales y testimonios de evangelistas
- Custom SMTP
- Fecha del webinar
- Cambiar redirect en page.tsx de /waitlist a /lanzamiento el día del launch

## Stripe
- Live Price ID: price_1TLnvRRykkihHqQUAhdbGCtY
- Producto: prod_UKSrybDOFRTAtP
- Estado: Live activo ✅
