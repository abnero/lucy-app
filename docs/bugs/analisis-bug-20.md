# Bug #20 — Lucy obedece cantidades literales del usuario

## Problema
Cuando una usuaria dice "ponme 200g de pollo" o "reduce el arroz a 50g", Lucy
obedece la cantidad literal sin validar si es nutricionalmente correcta. La
filosofía de producto es que Lucy SIEMPRE decide cantidades basándose en los
macros target.

## Tools que aceptan cantidades del usuario

### 1. cambiar_alimento — `nueva_cantidad`
- **Archivo**: `src/app/api/chat/route.ts` L292, L332-333
- **Parámetro**: `nueva_cantidad?: number` (opcional)
- **Comportamiento actual**: Si el usuario dice "ponme 200g de pollo", Claude
  pasa `nueva_cantidad: 200`. L333: `const newQty = input.nueva_cantidad ?? targetEntry.cantidad`.
  Se aplica sin validación de macros.
- **Líneas a tocar**: L332-333 (ignorar `nueva_cantidad`, recalcular basado en
  budget calórico de la comida).

### 2. agregar_snack — `cantidad`
- **Archivo**: `src/app/api/chat/route.ts` L509-517
- **Parámetro**: `cantidad: number`
- **Comportamiento actual**: L512-513: si Claude pasa `cantidad`, se usa literal.
  L517: si no pasa cantidad, default 120g.
- **Líneas a tocar**: L512-517 (ignorar cantidad del usuario, calcular basado en
  macros restantes del día).

### 3. agregar_ingrediente_a_comida — `cantidad`
- **Archivo**: `src/app/api/chat/route.ts` L846, L849
- **Parámetro**: `cantidad: number` (requerido)
- **Comportamiento actual**: L849: `const cantidad = input.cantidad`. Se usa
  directamente para el INSERT.
- **Líneas a tocar**: L849 (recalcular basado en budget de la comida y categoría
  del ingrediente).

### 4. reemplazar_comida_completa — cantidades internas
- **Archivo**: `src/app/api/chat/route.ts` L775-788
- **Comportamiento actual**: Calcula cantidades internamente basándose en el
  budget calórico de la comida (30/40/30). NO acepta cantidades del usuario.
- **Estado**: Ya funciona como debería. No tocar.

### 5. eliminar_ingrediente_de_comida
- No aplica (no asigna cantidades).

## Plan de fix propuesto

### Opción A: Ignorar cantidad del usuario, recalcular server-side
Para cada tool (1, 2, 3):
1. Ignorar el parámetro `nueva_cantidad`/`cantidad` del input
2. Calcular la cantidad correcta basada en:
   - Budget calórico de la comida (30%/40%/30% del target diario)
   - Share de categoría del alimento (40% prot, 35% carb, 10% fibra, 15% grasa)
   - Clamping a porcion_min/porcion_max
3. Responder al usuario con la cantidad calculada

**Pro**: Consistente con filosofía Lucy. Simple.
**Con**: Si el usuario insiste "quiero exactamente 200g", Lucy no puede obedecer.
Puede frustrar usuarios power.

### Opción B: Validar y clampar
Aceptar la cantidad del usuario pero clamparla dentro del rango aceptable:
- Floor: porcion_min
- Ceiling: porcion_max
- Advertir si la cantidad excede el budget calórico de la comida

**Pro**: Respeta la autonomía del usuario dentro de límites razonables.
**Con**: Puede llevar a macros desbalanceados si el usuario pide cantidades
extremas dentro del rango.

### Opción C: Recalcular + informar
Ignorar cantidad literal, recalcular, pero informar al usuario:
"Te puse 150g de pollo para cuadrar tus macros. Si quieres ajustar,
dime y lo revisamos juntas."

**Pro**: Mejor UX. La usuaria entiende por qué no se usó su número.
**Con**: Requiere cambio en el system prompt de Lucy para que genere este
mensaje.

## Decisión pendiente de Abner
- ¿Opción A, B, o C?
- ¿Aplica a snacks también o solo a comidas principales?
- ¿Hay escenarios donde SÍ queremos respetar la cantidad literal?
  (ej: coach ajustando manualmente, admin override)

## Estimado
- Opción A: ~2h (3 tools + tests)
- Opción B: ~1h (3 tools, menos lógica)
- Opción C: ~3h (3 tools + system prompt update + tests)

## Casos edge
1. Alimento con unidad_medida='unidad': "ponme 3 huevos" — ¿recalcular?
   Si Lucy calcula 2 huevos pero el usuario pidió 3, ¿ignorar?
2. Snack agregado "para todos los días" (dia="todos"): la cantidad
   debería ser la misma para todos los días o ajustada por día?
3. Compensación automática en agregar_ingrediente_a_comida: si la cantidad
   se recalcula, la compensación de otros alimentos también cambia.
