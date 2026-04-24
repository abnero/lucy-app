// ============================================================
// src/lib/analisis-calorico.ts
// Módulo de análisis calórico post-generación para Lucy
// ============================================================

export interface AlimentoCalendario {
  alimento_id: string;
  nombre: string;
  cantidad: number;
  unidad_medida: "gramos" | "ml" | "unidad";
  porcion_base: number;
  porcion_min: number;
  porcion_max: number;
  calorias_por_unidad: number;
  proteina_por_unidad: number;
  comida: "desayuno" | "almuerzo" | "cena" | "snack";
  dia: number;
  rol_permitido: string[];
}

export interface MacrosDia {
  dia: number;
  calorias: number;
  proteina: number;
  porComida: {
    desayuno: { calorias: number; proteina: number };
    almuerzo: { calorias: number; proteina: number };
    cena: { calorias: number; proteina: number };
    snack: { calorias: number; proteina: number };
  };
}

export type TipoProblema = "exceso_calorias" | "deficit_calorias" | "deficit_proteina";

export interface OpcionSnack {
  alimento_id: string;
  nombre: string;
  foto_url: string | null;
  cantidad: number;
  unidad_medida: string;
  kcal_aporta: number;
  prot_aporta: number;
  es_del_pool: boolean;
}

export interface CandidatoSnack {
  alimento_id: string;
  nombre: string;
  foto_url: string | null;
  calorias_por_unidad: number;
  proteina_por_unidad: number;
  porcion_base: number;
  porcion_min: number;
  porcion_max: number;
  unidad_medida: "gramos" | "ml" | "unidad";
  es_del_pool: boolean;
}

export interface Sugerencia {
  tipo: "reducir" | "aumentar" | "agregar_snack";
  alimento_id: string;
  nombre: string;
  comida: "desayuno" | "almuerzo" | "cena" | "snack";
  cantidad_actual: number;
  cantidad_nueva: number;
  unidad_medida: string;
  impacto_calorias: number;
  impacto_proteina: number;
  descripcion: string;
  opciones_snack?: OpcionSnack[];
}

export interface Compensacion {
  alimento_id: string;
  nombre: string;
  cantidad_antes: number;
  cantidad_despues: number;
  kcal_reducidas: number;
  prot_reducidas: number;
}

export interface DiaProblemático {
  dia: number;
  macros: MacrosDia;
  objetivo_calorias: number;
  objetivo_proteina: number;
  diferencia_calorias: number;
  diferencia_proteina: number;
  problemas: TipoProblema[];
  comida_problematica: "desayuno" | "almuerzo" | "cena" | "snack" | null;
  sugerencias: Sugerencia[];
}

export interface ResultadoAnalisis {
  dias_problematicos: DiaProblemático[];
  dias_ok: number[];
  resumen: string;
}

export function calcularCalorias(alimento: AlimentoCalendario): number {
  if (alimento.unidad_medida === "unidad") {
    return alimento.cantidad * alimento.calorias_por_unidad;
  }
  return (alimento.cantidad * alimento.calorias_por_unidad) / alimento.porcion_base;
}

export function calcularProteina(alimento: AlimentoCalendario): number {
  if (alimento.unidad_medida === "unidad") {
    return alimento.cantidad * alimento.proteina_por_unidad;
  }
  return (alimento.cantidad * alimento.proteina_por_unidad) / alimento.porcion_base;
}

export function calcularCompensaciones(
  alimentosDia: AlimentoCalendario[],
  snackKcal: number,
  snackProt: number,
  objetivo_calorias: number,
  objetivo_proteina: number,
): Compensacion[] {
  const tolerancia_cal = objetivo_calorias * 0.10;
  const tolerancia_prot = 10;

  // Project totals after adding snack
  const totalCalActual = alimentosDia.reduce((s, a) => s + calcularCalorias(a), 0);
  const totalProtActual = alimentosDia.reduce((s, a) => s + calcularProteina(a), 0);
  const calProyectado = totalCalActual + snackKcal;
  const protProyectado = totalProtActual + snackProt;

  let excesoCal = Math.max(0, calProyectado - (objetivo_calorias + tolerancia_cal));
  let excesoProt = Math.max(0, protProyectado - (objetivo_proteina + tolerancia_prot));

  if (excesoCal <= 0 && excesoProt <= 0) return [];

  const compensaciones: Compensacion[] = [];

  // Work on a mutable copy of quantities
  const cantidades = new Map(alimentosDia.map((a) => [a.alimento_id + '|' + a.comida, a.cantidad]));

  function getKey(a: AlimentoCalendario) { return a.alimento_id + '|' + a.comida; }

  function cpuOf(a: AlimentoCalendario) {
    return a.unidad_medida === "unidad" ? a.calorias_por_unidad : a.calorias_por_unidad / a.porcion_base;
  }
  function ppuOf(a: AlimentoCalendario) {
    return a.unidad_medida === "unidad" ? a.proteina_por_unidad : a.proteina_por_unidad / a.porcion_base;
  }

  // Phase 1: reduce excess protein by cutting protein-heavy foods
  if (excesoProt > 0) {
    const protHeavy = [...alimentosDia]
      .filter((a) => {
        const cpu = cpuOf(a);
        const ppu = ppuOf(a);
        return cpu > 0 && ppu / cpu >= 0.08 && (cantidades.get(getKey(a))! > a.porcion_min);
      })
      .sort((a, b) => ppuOf(b) - ppuOf(a)); // highest protein density first

    for (const alimento of protHeavy) {
      if (excesoProt <= 0) break;
      const key = getKey(alimento);
      const cantActual = cantidades.get(key)!;
      const margen = cantActual - alimento.porcion_min;
      if (margen <= 0) continue;

      const ppu = ppuOf(alimento);
      const cpu = cpuOf(alimento);
      const qtyReducir = Math.min(margen, ppu > 0 ? excesoProt / ppu : margen);
      const cantNueva = alimento.unidad_medida === "unidad"
        ? Math.max(alimento.porcion_min, Math.round((cantActual - qtyReducir) * 2) / 2)
        : Math.max(alimento.porcion_min, Math.round(cantActual - qtyReducir));
      const realReduccion = cantActual - cantNueva;
      if (realReduccion <= 0) continue;

      const kcalRed = cpu * realReduccion;
      const protRed = ppu * realReduccion;
      cantidades.set(key, cantNueva);
      excesoProt -= protRed;
      excesoCal -= kcalRed; // reducing protein food also reduces calories

      compensaciones.push({
        alimento_id: alimento.alimento_id,
        nombre: alimento.nombre,
        cantidad_antes: cantActual,
        cantidad_despues: cantNueva,
        kcal_reducidas: Math.round(kcalRed),
        prot_reducidas: Math.round(protRed * 10) / 10,
      });
    }
  }

  // Phase 2: reduce excess calories by cutting cal-dense non-protein foods
  if (excesoCal > 0) {
    const calDense = [...alimentosDia]
      .filter((a) => {
        const cpu = cpuOf(a);
        const ppu = ppuOf(a);
        return cpu > 0 && (ppu / cpu < 0.08) && (cantidades.get(getKey(a))! > a.porcion_min);
      })
      .sort((a, b) => cpuOf(b) - cpuOf(a)); // highest caloric density first

    for (const alimento of calDense) {
      if (excesoCal <= 0) break;
      const key = getKey(alimento);
      const cantActual = cantidades.get(key)!;
      const margen = cantActual - alimento.porcion_min;
      if (margen <= 0) continue;

      const cpu = cpuOf(alimento);
      const ppu = ppuOf(alimento);
      const qtyReducir = Math.min(margen, cpu > 0 ? excesoCal / cpu : margen);
      const cantNueva = alimento.unidad_medida === "unidad"
        ? Math.max(alimento.porcion_min, Math.round((cantActual - qtyReducir) * 2) / 2)
        : Math.max(alimento.porcion_min, Math.round(cantActual - qtyReducir));
      const realReduccion = cantActual - cantNueva;
      if (realReduccion <= 0) continue;

      const kcalRed = cpu * realReduccion;
      const protRed = ppu * realReduccion;
      cantidades.set(key, cantNueva);
      excesoCal -= kcalRed;

      compensaciones.push({
        alimento_id: alimento.alimento_id,
        nombre: alimento.nombre,
        cantidad_antes: cantActual,
        cantidad_despues: cantNueva,
        kcal_reducidas: Math.round(kcalRed),
        prot_reducidas: Math.round(protRed * 10) / 10,
      });
    }
  }

  return compensaciones;
}

export function calcularMacrosDia(alimentos: AlimentoCalendario[], dia: number): MacrosDia {
  const delDia = alimentos.filter((a) => a.dia === dia);
  const porComida = {
    desayuno: { calorias: 0, proteina: 0 },
    almuerzo: { calorias: 0, proteina: 0 },
    cena: { calorias: 0, proteina: 0 },
    snack: { calorias: 0, proteina: 0 },
  };
  for (const alimento of delDia) {
    porComida[alimento.comida].calorias += calcularCalorias(alimento);
    porComida[alimento.comida].proteina += calcularProteina(alimento);
  }
  return {
    dia,
    calorias: porComida.desayuno.calorias + porComida.almuerzo.calorias + porComida.cena.calorias + porComida.snack.calorias,
    proteina: porComida.desayuno.proteina + porComida.almuerzo.proteina + porComida.cena.proteina + porComida.snack.proteina,
    porComida,
  };
}

function identificarComidaProblematica(macros: MacrosDia, objetivo_calorias: number): "desayuno" | "almuerzo" | "cena" | "snack" | null {
  const targets = { desayuno: objetivo_calorias * 0.30, almuerzo: objetivo_calorias * 0.40, cena: objetivo_calorias * 0.30 };
  let maxDesviacion = 0;
  let comidaProblematica: "desayuno" | "almuerzo" | "cena" | "snack" | null = null;
  for (const comida of ["desayuno", "almuerzo", "cena"] as const) {
    const desviacion = Math.abs(macros.porComida[comida].calorias - targets[comida]);
    if (desviacion > maxDesviacion) { maxDesviacion = desviacion; comidaProblematica = comida; }
  }
  return comidaProblematica;
}

function calcularCaloriasParaCantidad(alimento: AlimentoCalendario, cantidad: number): number {
  if (alimento.unidad_medida === "unidad") return cantidad * alimento.calorias_por_unidad;
  return (cantidad * alimento.calorias_por_unidad) / alimento.porcion_base;
}

function calcularProteinaParaCantidad(alimento: AlimentoCalendario, cantidad: number): number {
  if (alimento.unidad_medida === "unidad") return cantidad * alimento.proteina_por_unidad;
  return (cantidad * alimento.proteina_por_unidad) / alimento.porcion_base;
}

function calcularCantidadParaCalorias(alimento: AlimentoCalendario, calorias_objetivo: number): number {
  if (alimento.unidad_medida === "unidad") return calorias_objetivo / alimento.calorias_por_unidad;
  return (calorias_objetivo * alimento.porcion_base) / alimento.calorias_por_unidad;
}

function formatearUnidad(unidad: string, cantidad: number): string {
  if (unidad === "unidad") return cantidad === 1 ? "unidad" : "unidades";
  if (unidad === "ml") return "ml";
  return "g";
}

function formatearSugerencia(tipo: "reducir" | "aumentar", alimento: AlimentoCalendario, cantidad_actual: number, cantidad_nueva: number, impacto_calorias: number): string {
  const unidad = formatearUnidad(alimento.unidad_medida, cantidad_nueva);
  const verbo = tipo === "reducir" ? "Reduce" : "Aumenta";
  const signo = impacto_calorias > 0 ? "+" : "";
  const comidaLabel = alimento.comida.charAt(0).toUpperCase() + alimento.comida.slice(1);
  if (alimento.unidad_medida === "unidad") {
    return `${verbo} el ${alimento.nombre} en ${comidaLabel} de ${cantidad_actual} a ${cantidad_nueva} ${unidad} (${signo}${impacto_calorias} kcal)`;
  }
  return `${verbo} el ${alimento.nombre} en ${comidaLabel} de ${cantidad_actual}${unidad} a ${cantidad_nueva}${unidad} (${signo}${impacto_calorias} kcal)`;
}

function calcularSnackAporte(c: CandidatoSnack, cantidad: number): { kcal: number; prot: number } {
  if (c.unidad_medida === "unidad") {
    return { kcal: cantidad * c.calorias_por_unidad, prot: cantidad * c.proteina_por_unidad };
  }
  return {
    kcal: (cantidad * c.calorias_por_unidad) / c.porcion_base,
    prot: (cantidad * c.proteina_por_unidad) / c.porcion_base,
  };
}

function calcularCantidadSnackParaGap(c: CandidatoSnack, gapKcal: number, gapProt: number, prioridadProt: boolean): number {
  const cpu = c.unidad_medida === "unidad" ? c.calorias_por_unidad : c.calorias_por_unidad / c.porcion_base;
  const ppu = c.unidad_medida === "unidad" ? c.proteina_por_unidad : c.proteina_por_unidad / c.porcion_base;

  let qty: number;
  if (prioridadProt && ppu > 0) {
    qty = gapProt / ppu;
  } else if (cpu > 0) {
    qty = gapKcal / cpu;
  } else {
    qty = c.porcion_base;
  }

  // Clamp to [porcion_min, porcion_max]
  qty = Math.max(c.porcion_min, Math.min(c.porcion_max, qty));

  // Round: units to 0.5 step, grams/ml to integers
  if (c.unidad_medida === "unidad") {
    qty = Math.round(qty * 2) / 2;
  } else {
    qty = Math.round(qty);
  }

  return qty;
}

function seleccionarSnacks(candidatos: CandidatoSnack[], gapKcal: number, gapProt: number, hayDeficit: boolean, hayDeficitProteina: boolean): OpcionSnack[] {
  // Filter by gap type
  const scored = candidatos.map((c) => {
    const cpu = c.unidad_medida === "unidad" ? c.calorias_por_unidad : c.calorias_por_unidad / c.porcion_base;
    const ppu = c.unidad_medida === "unidad" ? c.proteina_por_unidad : c.proteina_por_unidad / c.porcion_base;
    const ratioProt = cpu > 0 ? ppu / cpu : 0; // g protein per kcal

    // Filter: for solo_prot, want high protein ratio; for solo_cal, want low; for both, accept all
    if (hayDeficitProteina && !hayDeficit && ratioProt < 0.08) return null; // solo_prot: skip low-protein
    if (hayDeficit && !hayDeficitProteina && ratioProt > 0.12) return null; // solo_cal: skip high-protein (use them for meals instead)

    const prioridadProt = hayDeficitProteina && (!hayDeficit || ratioProt >= 0.08);
    const qty = calcularCantidadSnackParaGap(c, gapKcal, gapProt, prioridadProt);
    const aporte = calcularSnackAporte(c, qty);

    // Score: how well does this close the gap(s)?
    const pctKcal = gapKcal > 0 && hayDeficit ? Math.min(aporte.kcal / gapKcal, 1) : 0;
    const pctProt = gapProt > 0 && hayDeficitProteina ? Math.min(aporte.prot / gapProt, 1) : 0;
    const score = pctKcal + pctProt + (c.es_del_pool ? 0.5 : 0); // Boost pool foods

    return { candidato: c, qty, aporte, score };
  }).filter((x): x is NonNullable<typeof x> => x !== null && x.score > 0);

  // Sort by score descending, take top 3
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 3).map(({ candidato, qty, aporte }) => ({
    alimento_id: candidato.alimento_id,
    nombre: candidato.nombre,
    foto_url: candidato.foto_url,
    cantidad: qty,
    unidad_medida: candidato.unidad_medida,
    kcal_aporta: Math.round(aporte.kcal),
    prot_aporta: Math.round(aporte.prot * 10) / 10,
    es_del_pool: candidato.es_del_pool,
  }));
}

function generarSugerencias(alimentosDia: AlimentoCalendario[], diferencia_calorias: number, diferencia_proteina: number, comida_problematica: "desayuno" | "almuerzo" | "cena" | "snack" | null, candidatosSnack?: CandidatoSnack[]): Sugerencia[] {
  const sugerencias: Sugerencia[] = [];
  const hayExceso = diferencia_calorias > 20;
  const hayDeficit = diferencia_calorias < -20;
  const hayDeficitProteina = diferencia_proteina < -10;
  let gapKcal = Math.abs(diferencia_calorias);
  let gapProt = Math.abs(diferencia_proteina);

  const ordenados = comida_problematica
    ? [...alimentosDia.filter((a) => a.comida === comida_problematica), ...alimentosDia.filter((a) => a.comida !== comida_problematica)]
    : alimentosDia;

  // ═══ EXCESO: reduce high-density foods ═══
  if (hayExceso) {
    const reducibles = ordenados
      .filter((a) => a.cantidad > a.porcion_min)
      .sort((a, b) => {
        const densA = a.unidad_medida === "unidad" ? a.calorias_por_unidad : a.calorias_por_unidad / a.porcion_base;
        const densB = b.unidad_medida === "unidad" ? b.calorias_por_unidad : b.calorias_por_unidad / b.porcion_base;
        return densB - densA;
      });
    for (const alimento of reducibles) {
      if (sugerencias.length >= 3 || gapKcal <= 20) break;
      if (hayDeficitProteina && alimento.proteina_por_unidad > 10) continue;
      const cals_actuales = calcularCalorias(alimento);
      const cals_objetivo = Math.max(calcularCaloriasParaCantidad(alimento, alimento.porcion_min), cals_actuales - gapKcal);
      const cantidad_nueva = calcularCantidadParaCalorias(alimento, cals_objetivo);
      if (cantidad_nueva >= alimento.porcion_min && cantidad_nueva < alimento.cantidad) {
        const minDiff = alimento.unidad_medida === "unidad" ? 0.5 : 2;
        if (Math.abs(cantidad_nueva - alimento.cantidad) < minDiff) continue;
        const impacto_cal = calcularCaloriasParaCantidad(alimento, cantidad_nueva) - cals_actuales;
        const impacto_prot = calcularProteinaParaCantidad(alimento, cantidad_nueva) - calcularProteina(alimento);
        sugerencias.push({
          tipo: "reducir", alimento_id: alimento.alimento_id, nombre: alimento.nombre, comida: alimento.comida,
          cantidad_actual: alimento.cantidad, cantidad_nueva: Math.round(cantidad_nueva * 10) / 10,
          unidad_medida: alimento.unidad_medida, impacto_calorias: Math.round(impacto_cal),
          impacto_proteina: Math.round(impacto_prot * 10) / 10,
          descripcion: formatearSugerencia("reducir", alimento, alimento.cantidad, Math.round(cantidad_nueva * 10) / 10, Math.round(impacto_cal)),
        });
        gapKcal -= Math.abs(impacto_cal);
        gapProt -= Math.abs(impacto_prot);
      }
    }
  }

  // ═══ DEFICIT: increase existing foods using dual-gap score ═══
  if (hayDeficit || (hayDeficitProteina && sugerencias.length === 0)) {
    // Score each aumentable food by how well it closes BOTH gaps
    const aumentables = ordenados
      .filter((a) => a.cantidad < a.porcion_max)
      .map((a) => {
        const cpu = a.unidad_medida === "unidad" ? a.calorias_por_unidad : a.calorias_por_unidad / a.porcion_base;
        const ppu = a.unidad_medida === "unidad" ? a.proteina_por_unidad : a.proteina_por_unidad / a.porcion_base;
        const maxExtra = a.porcion_max - a.cantidad;
        const kcalPotencial = cpu * maxExtra;
        const protPotencial = ppu * maxExtra;
        const pctKcal = gapKcal > 0 ? Math.min(kcalPotencial / gapKcal, 1) : 0;
        const pctProt = gapProt > 0 ? Math.min(protPotencial / gapProt, 1) : 0;
        // Combined score: weight both gaps. If only one gap exists, the other contributes 0.
        const score = (hayDeficit ? pctKcal : 0) + (hayDeficitProteina ? pctProt : 0);
        return { alimento: a, score, cpu, ppu, maxExtra };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    for (const { alimento, cpu } of aumentables) {
      if (sugerencias.length >= 2 || (gapKcal <= 20 && gapProt <= 10)) break;
      const cals_actuales = calcularCalorias(alimento);
      // Target: close the kcal gap or max out, whichever is smaller
      const targetExtra = cpu > 0 ? Math.min(gapKcal / cpu, alimento.porcion_max - alimento.cantidad) : alimento.porcion_max - alimento.cantidad;
      let cantidad_nueva = Math.round((alimento.cantidad + targetExtra) * 10) / 10;
      cantidad_nueva = Math.min(alimento.porcion_max, cantidad_nueva);
      if (cantidad_nueva <= alimento.cantidad) continue;
      const minDiff = alimento.unidad_medida === "unidad" ? 0.5 : 2;
      if (Math.abs(cantidad_nueva - alimento.cantidad) < minDiff) continue;
      const impacto_cal = calcularCaloriasParaCantidad(alimento, cantidad_nueva) - cals_actuales;
      const impacto_prot = calcularProteinaParaCantidad(alimento, cantidad_nueva) - calcularProteina(alimento);
      sugerencias.push({
        tipo: "aumentar", alimento_id: alimento.alimento_id, nombre: alimento.nombre, comida: alimento.comida,
        cantidad_actual: alimento.cantidad, cantidad_nueva,
        unidad_medida: alimento.unidad_medida, impacto_calorias: Math.round(impacto_cal),
        impacto_proteina: Math.round(impacto_prot * 10) / 10,
        descripcion: formatearSugerencia("aumentar", alimento, alimento.cantidad, cantidad_nueva, Math.round(impacto_cal)),
      });
      gapKcal -= Math.abs(impacto_cal);
      gapProt -= Math.abs(impacto_prot);
    }

    // Add snack suggestion with real options from catalog if candidates available
    if (sugerencias.length < 3 && candidatosSnack && candidatosSnack.length > 0) {
      const opciones = seleccionarSnacks(candidatosSnack, gapKcal, gapProt, hayDeficit, hayDeficitProteina);
      if (opciones.length > 0) {
        const tipoGap = (hayDeficit && hayDeficitProteina) ? "combinado" : hayDeficitProteina ? "proteico" : "calórico";
        const kcalFalt = Math.round(gapKcal);
        const protFalt = Math.round(gapProt);
        let descripcion: string;
        if (tipoGap === "combinado") {
          descripcion = `Agrega un snack que cubra ~${kcalFalt} kcal y ~${protFalt}g de proteína. Lucy te sugiere ${opciones.length} opciones:`;
        } else if (tipoGap === "proteico") {
          descripcion = `Agrega un snack proteico para cubrir ~${protFalt}g de proteína. Lucy te sugiere ${opciones.length} opciones:`;
        } else {
          descripcion = `Agrega un snack de ~${kcalFalt} kcal para completar tu meta. Lucy te sugiere ${opciones.length} opciones:`;
        }
        sugerencias.push({
          tipo: "agregar_snack", alimento_id: "", nombre: "Snack sugerido", comida: "snack",
          cantidad_actual: 0, cantidad_nueva: 0, unidad_medida: "unidad",
          impacto_calorias: kcalFalt, impacto_proteina: protFalt,
          descripcion,
          opciones_snack: opciones,
        });
      }
    } else if (sugerencias.length < 3 && (!candidatosSnack || candidatosSnack.length === 0)) {
      // Fallback: no snack candidates available (legacy behavior — text only)
      const kcalFalt = Math.round(gapKcal);
      const protFalt = Math.round(gapProt);
      if (hayDeficit || hayDeficitProteina) {
        sugerencias.push({
          tipo: "agregar_snack", alimento_id: "", nombre: "Snack", comida: "snack",
          cantidad_actual: 0, cantidad_nueva: 0, unidad_medida: "unidad",
          impacto_calorias: kcalFalt, impacto_proteina: protFalt,
          descripcion: `Agrega un snack para cerrar la brecha. Pregúntale a Lucy en el chat cuál encaja mejor con tu plan.`,
        });
      }
    }
  }

  return sugerencias.slice(0, 3);
}

export function analizarCalendario(alimentos: AlimentoCalendario[], objetivo_calorias: number, objetivo_proteina: number, candidatosSnack?: CandidatoSnack[]): ResultadoAnalisis {
  const dias = Array.from(new Set(alimentos.map((a) => a.dia))).sort();
  const tolerancia_calorias = objetivo_calorias * 0.10;
  const tolerancia_proteina = 10;
  const dias_problematicos: DiaProblemático[] = [];
  const dias_ok: number[] = [];

  for (const dia of dias) {
    const macros = calcularMacrosDia(alimentos, dia);
    const diferencia_calorias = macros.calorias - objetivo_calorias;
    const diferencia_proteina = macros.proteina - objetivo_proteina;
    const excede_calorias = Math.abs(diferencia_calorias) > tolerancia_calorias;
    const deficit_proteina = diferencia_proteina < -tolerancia_proteina;
    if (!excede_calorias && !deficit_proteina) { dias_ok.push(dia); continue; }
    const problemas: TipoProblema[] = [];
    if (diferencia_calorias > tolerancia_calorias) problemas.push("exceso_calorias");
    if (diferencia_calorias < -tolerancia_calorias) problemas.push("deficit_calorias");
    if (deficit_proteina) problemas.push("deficit_proteina");
    const comida_problematica = identificarComidaProblematica(macros, objetivo_calorias);
    const alimentosDia = alimentos.filter((a) => a.dia === dia);
    const sugerencias = generarSugerencias(alimentosDia, diferencia_calorias, diferencia_proteina, comida_problematica, candidatosSnack);
    dias_problematicos.push({
      dia, macros, objetivo_calorias, objetivo_proteina,
      diferencia_calorias: Math.round(diferencia_calorias),
      diferencia_proteina: Math.round(diferencia_proteina * 10) / 10,
      problemas, comida_problematica, sugerencias,
    });
  }

  let resumen = "";
  if (dias_problematicos.length === 0) {
    resumen = "Tu plan está alineado con tu meta. ¡Excelente semana!";
  } else {
    const excesos = dias_problematicos.filter((d) => d.problemas.includes("exceso_calorias")).length;
    const deficits = dias_problematicos.filter((d) => d.problemas.includes("deficit_calorias")).length;
    const proteinas = dias_problematicos.filter((d) => d.problemas.includes("deficit_proteina")).length;
    const partes = [];
    if (excesos > 0) partes.push(`${excesos} día${excesos > 1 ? "s" : ""} con exceso`);
    if (deficits > 0) partes.push(`${deficits} día${deficits > 1 ? "s" : ""} con déficit`);
    if (proteinas > 0) partes.push(`${proteinas} día${proteinas > 1 ? "s" : ""} con proteína baja`);
    resumen = `Lucy encontró ${partes.join(", ").replace(/, ([^,]*)$/, " y $1")} — tiene sugerencias específicas para cada uno.`;
  }

  return { dias_problematicos, dias_ok, resumen };
}

export function nombreDia(dia: number): string {
  const nombres = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  return nombres[dia - 1] ?? `Día ${dia}`;
}

export function nombreDiaCompleto(dia: number): string {
  const nombres = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  return nombres[dia - 1] ?? `Día ${dia}`;
}
