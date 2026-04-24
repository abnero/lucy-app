# Lucy - Guía para Claude Code

> Archivo que Claude Code lee al arrancar. Actualizado al 23 abr 2026.
>
> **Fuente de verdad del estado del proyecto:**
> `/Users/abnero/Documents/Lucy-Obsidian/00 - Contexto/Estado actual - Lucy.md`
>
> Leer ese archivo antes de hacer cualquier cambio al código.

---

## Qué es Lucy

AI nutritional coaching assistant para mujeres profesionales latinas. Cubre el pilar 1/5 del coaching de Caribeño Fit Labs (nutrición, ejercicio, descanso, hidratación, salud mental), liberando a los coaches humanos para enfocarse en los otros 4.

**Dominio:** lucy.fit
**Audiencia:** profesionales latinas en US y Puerto Rico
**Launch Fase 1:** 15 may 2026 ($297/año, 7 días moneyback)

---

## Stack técnico

- **Frontend/Backend:** Next.js 14 (App Router, Server Components)
- **DB:** Supabase (PostgreSQL + Auth + Storage)
  - Project ID producción: `anbpsybyipvbczzuqkjw`
- **LLM:** Anthropic API (Claude Sonnet)
- **Styling:** Tailwind CSS (paleta lavender)
- **Deploy:** Vercel (main → producción, branches → preview)
- **Vercel Protection Bypass for Automation:** configurado. Secret en `.env.local` como `VERCEL_AUTOMATION_BYPASS_SECRET`. Header para E2E: `x-vercel-protection-bypass`.

---

## Dónde vive el contexto

**Repo (código):** `/Users/abnero/Documents/lucy-app/`

**Vault de Obsidian (negocio, decisiones, bugs, flujos):**
`/Users/abnero/Documents/Lucy-Obsidian/`

Archivos prioritarios del vault al arrancar cualquier sesión:

1. `00 - Contexto/Estado actual - Lucy.md` — snapshot fresco del producto.
2. `01 - Lucy Producto/Filosofía y reglas.md` — principios no negociables.
3. `01 - Lucy Producto/Workflow de desarrollo.md` — 4 fases obligatorias + reglas Claude chat/Code.
4. `01 - Lucy Producto/Patron de re-arranque.md` — cómo retomar sesiones.
5. `02 - Bugs/Bugs abiertos.md` — cola de trabajo.
6. `02 - Bugs/Bugs cerrados.md` — histórico con causa raíz y fix.

**Leer esos archivos antes de proponer cambios al código.**

---

## División de responsabilidades

### Claude Code (tú)
- Autoridad técnica sobre el código.
- Lee, escribe, decide implementación.
- Crea branches, corre tests, mergea cuando Abner aprueba.

### Claude chat (asistente en claude.ai)
- Analiza data en Supabase.
- Mantiene el vault al día.
- Escribe prompts de contexto para ti.
- NO escribe código. Solo valida outputs observables.

### Abner
- Decide. Punto.

---

## Comandos útiles

```bash
npm run dev
npm run build
npm run lint
npx tsc --noEmit
```

---

## Convenciones del repo

### Branches
- `feat/bug-XX` — fix de bug numerado.
- `feat/nombre-descriptivo` — funcionalidad nueva.
- `chore/nombre` — limpieza, docs, tech debt.
- Nunca trabajar directamente en `main`.

### Commits
- Presente imperativo ("add", "fix", "remove").
- Referencia al bug cuando aplique: `fix: #18 regeneración escala proporcional`.

### Pre-merge obligatorio para flujos críticos
Si el cambio toca `/api/generar-plan`, `/api/chat`, onboarding, calendario, banner, mi-perfil:

1. Branch dedicado.
2. Deploy a Vercel preview.
3. E2E en preview con cuenta dummy (no localhost).
4. Solo entonces merge.

Cuenta dummy E2E: `bug26test+e2e@caribeno.fit` (user_id `62ca1118-e989-4d8b-ac35-ea411ae7c71f`) — marcada `es_interno=true`.

---

## IDs críticos

- Supabase project: `anbpsybyipvbczzuqkjw`
- Admin: `coachabner@caribeno.fit` (`57c22f0f-5d15-4b8e-ba80-070383f8c11e`)
- Dummy E2E: `bug26test+e2e@caribeno.fit` (`62ca1118-e989-4d8b-ac35-ea411ae7c71f`)
- 22 usuarias externas, 7 internas al 23 abr 2026

---

## Estado de main al 23 abr 2026

**HEAD:** `1de2f39` (Bug #27 — dashboard salud nutricional)

**Commits recientes:**
- `1de2f39` — Bug #27 (dashboard metricas-beta con 7 columnas)
- `ac1893b` — Bug #29 Fix #3 (RPC atómica DELETE+INSERT)
- `c56c294` — Bug #29 Fix #2 (lock de concurrencia)
- `a2ad214` — Bug #24 (auth fix coach + admin endpoints)
- `618b621` — Cleanup MEAL_PROT_PCT
- `4858432` — Bug #28 (esPrimeraGeneracion fix)
- `628de6c` — Bug #29 Fix #1 (wizard preserva calendario)
- `05e218d` — Bug #26 (sub-mins fix)

**Migraciones en producción (últimas 3):**
- `010_generando_plan_lock` — columna `usuarios.generando_plan_at`
- `011_atomic_replace_calendario` — función `replace_calendario_generado`
- `012_add_es_interno_column` — columna `usuarios.es_interno`

---

## Próximos bugs en la cola

Antes de tocar código relacionado, leer la sección del bug en `02 - Bugs/Bugs abiertos.md`:

- **Bug #20** (crítico) — chat acepta cantidades literales del usuario
- **Bug #2 Capa B** (crítico) — validación server-side en `/api/generar-plan`
- **Bug #13** (no bloqueante) — banner déficit no maneja 3 casos
- **Bug #15** (no bloqueante) — auto-implementar recomendaciones post-gen
- **Bug #23** (no bloqueante) — fotos incorrectas en catálogo
- **Bug #22** (por investigar) — Pana porcion_max invertido

---

## Reglas no negociables

1. **La usuaria NUNCA especifica cantidades. Lucy SIEMPRE decide.**
2. **Test en Vercel preview antes de merge**, no solo localhost.
3. **Backups antes de operaciones destructivas** en producción.
4. **Regeneración no llama Claude API**, solo escala cantidades.
5. **RLS habilitado en tablas nuevas** en la misma migración que las crea.

Detalle completo en `01 - Lucy Producto/Filosofía y reglas.md` y `Workflow de desarrollo.md`.

---

## REGLA — Supabase producción compartida

Hasta que tengamos proyecto Supabase separado para staging, el proyecto `anbpsybyipvbczzuqkjw` **ES producción** para todos los efectos. La preview de Vercel comparte la misma DB que lucy.fit.

Antes de ejecutar **CUALQUIER SQL** contra ese proyecto (migración, UPDATE, INSERT, DELETE, DDL, RPC creation, cambio de constraint, cambio de policy, o cualquier otra operación que escriba), tenés que:

1. Flaggear explícitamente en el chat: _"Este SQL corre contra LA DB DE PRODUCCIÓN (misma que usan las usuarias reales). Es [aditivo / destructivo / mixto]. ¿Autorizás?"_
2. Esperar **"sí" explícito** de Abner en el chat.
3. **NO proceder** basado en interpretación de autorizaciones previas ambiguas. Ejemplo concreto: "ejecutar en preview" NO equivale a autorización para producción aunque técnicamente sea la misma DB. Si Abner dijo "preview" y no hay preview separada, eso es un bloqueador que hay que flaggear, no una luz verde.

**Aplica sin excepción:**
- Aplica aunque el cambio sea aditivo (agregar columna, agregar valor a enum, agregar row a tabla de config).
- Aplica aunque sea urgente.
- Aplica aunque la preview lo necesite para funcionar — en ese caso, el mensaje correcto es _"la preview necesita migración en prod, esto es bloqueador hasta que autorices"_ y esperar.
- Aplica para SELECT si puede exponer PII de usuarias reales (raro, pero existe). Default: SELECT es libre salvo que toque datos sensibles.

**Historia:** esta regla se agregó después del incidente del 24 abr 2026 donde las migraciones 013 y 014 se ejecutaron contra producción con autorización ambigua. Impacto real: cero (cambios aditivos, código consumidor no deployed). Pero el proceso estuvo mal.

**Fix permanente pendiente post-launch:** crear proyecto Supabase staging separado (setup ~2-3 horas).

---

## Cómo arrancar trabajo nuevo

Cuando Abner te dé una tarea nueva:

1. Lee este archivo (ya lo hiciste al arrancar).
2. Lee `00 - Contexto/Estado actual - Lucy.md` en el vault.
3. Lee la sección del bug específico en `02 - Bugs/Bugs abiertos.md`.
4. Corre `git status` + `git log --oneline -10` para confirmar estado actual.
5. Confirma a Abner qué ves antes de proponer cambios.

---

## Si algo no está en este archivo

El vault es la fuente de verdad. Siempre priorizar vault sobre memoria o suposiciones. Si el vault no tiene la respuesta, preguntar a Abner antes de asumir.
