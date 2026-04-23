# Bug #2 Capa B — Validación server-side en /api/generar-plan

## Problema
El endpoint /api/generar-plan no valida que las preferencias del usuario
cumplan los mínimos por categoría. Si se llama directamente (curl, integración
futura), puede generar un plan incompleto sin error.

## Validación actual (L473-477)
```typescript
if (prefErr || !preferencias?.length) {
  return NextResponse.json({ error: 'No encontramos tus alimentos...' }, { status: 404 })
}
```
Solo verifica que exista AL MENOS 1 preferencia. No valida distribución por categoría.

## Mínimos definidos en el wizard (seleccion-alimentos/page.tsx L17-22)
| Categoría | min | max | Requerido |
|-----------|-----|-----|-----------|
| desayuno_1 | 3 | 4 | Sí |
| desayuno_2 | 0 | 4 | No (opcional) |
| proteina | 3 | 7 | Sí |
| carbohidrato | 1 | 5 | Sí |
| fibra | 3 | 5 | Sí |
| grasa | 3 | 5 | Sí |

## Casos que el endpoint NO detecta hoy

### 1. Pool insuficiente por categoría
Ejemplo: 2 proteínas en vez de 3. Claude intentará rotar con solo 2 proteínas
entre almuerzo y cena de 7 días → repeticiones excesivas pero no error.

### 2. Categoría faltante
Ejemplo: 0 fibras. Claude recibirá catálogo sin fibras → comidas sin vegetal/fibra.
El endpoint no error pero el plan es nutricionalmente incompleto.

### 3. Solo desayuno, sin comidas principales
Ejemplo: 4 alimentos de desayuno_1, 0 de proteina/carb/fibra/grasa.
Endpoint genera plan sin almuerzo ni cena.

### 4. Alimento eliminado de la tabla alimentos
Si un alimento_id en preferencias ya no existe en alimentos (DELETE o soft delete),
el JOIN devuelve null y el alimento se ignora silenciosamente. Puede dejar una
categoría bajo mínimo sin que nadie lo sepa.

## Plan de fix

### Ubicación: Después de L478, antes de construir alimentosPorCategoria

```typescript
// Validate minimum foods per category
const REQUIRED_MINS: Record<string, number> = {
  desayuno_1: 3, proteina: 3, carbohidrato: 1, fibra: 3, grasa: 3,
}
const categoryCounts: Record<string, number> = {}
for (const pref of preferencias) {
  const a = pref.alimento as any
  if (!a) continue
  const cat = pref.categoria_comida
  categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
}
const missing: string[] = []
for (const [cat, min] of Object.entries(REQUIRED_MINS)) {
  if ((categoryCounts[cat] || 0) < min) {
    missing.push(`${cat} (${categoryCounts[cat] || 0}/${min})`)
  }
}
if (missing.length > 0) {
  return NextResponse.json({
    error: `Tu selección de alimentos está incompleta: ${missing.join(', ')}. Regresa al wizard y completa tu selección.`,
    missingCategories: missing,
  }, { status: 400 })
}
```

### Estimado: ~30 min
- Agregar validación post-fetch
- Agregar test E2E con preferencias insuficientes → esperar 400
- No rompe ningún flujo existente (el wizard ya enforce mínimos client-side)

### Riesgo
Bajo. Es validación adicional que hoy no existe. Solo afectaría a requests
directos (curl, coach endpoint) que bypaseen el wizard.

## Casos edge
1. **Usuarias existentes con pool bajo mínimo**: Si Juli tiene solo 2 proteínas
   y regenera, el nuevo check la bloquearía. Solución: la validación solo aplica
   en primera generación (forceRegenerate o calendarioCount=0). El modo regen
   trabaja con el calendario existente, no con preferencias.

2. **desayuno_2 opcional**: No incluir en REQUIRED_MINS (min=0).

3. **Bug #16 (proteína en desayuno)**: El wizard ya enforce proteína en desayuno
   client-side. La Capa B no necesita validar esto — solo conteos por categoría.
