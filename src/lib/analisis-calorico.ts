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
  comida: "desayuno" | "almuerzo" | "cena";
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
  };
}

export type TipoProblema = "exceso_calorias" | "deficit_calorias" | "deficit_proteina";

export interface Sugerencia {
  tipo: "reducir" | "aumentar" | "agregar_snack";
  alimento_id: string;
  nombre: string;
  comida: "desayuno" | "almuerzo" | "cena";
  cantidad_actual: number;
  cantidad_nueva: number;
  unidad_medida: string;
  impacto_calorias: number;
  impacto_proteina: number;
  descripcion: string;
}

export interface DiaProblemático {
  dia: number;
  macros: MacrosDia;
  objetivo_calorias: number;
  objetivo_proteina: number;
  diferencia_calorias: number;
  diferencia_proteina: number;
  problemas: TipoProblema[];
  comida_problematica: "desayuno" | "almuerzo" | "cena" | null;
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

export function calcularMacrosDia(alimentos: AlimentoCalendario[], dia: number): MacrosDia {
  const delDia = alimentos.filter((a) => a.dia === dia);
  const porComida = {
    desayuno: { calorias: 0, proteina: 0 },
    almuerzo: { calorias: 0, proteina: 0 },
    cena: { calorias: 0, proteina: 0 },
  };
  for (const alimento of delDia) {
    porComida[alimento.comida].calorias += calcularCalorias(alimento);
    porComida[alimento.comida].proteina += calcularProteina(alimento);
  }
  return {
    dia,
    calorias: porComida.desayuno.calorias + porComida.almuerzo.calorias + porComida.cena.calorias,
    proteina: porComida.desayuno.proteina + porComida.almuerzo.proteina + porComida.cena.proteina,
    porComida,
  };
}

function identificarComidaProblematica(macros: MacrosDia, objetivo_calorias: number): "desayuno" | "almuerzo" | "cena" | null {
  const targets = { desayuno: objetivo_calorias * 0.30, almuerzo: objetivo_calorias * 0.40, cena: objetivo_calorias * 0.30 };
  let maxDesviacion = 0;
  let comidaProblematica: "desayuno" | "almuerzo" | "cena" | null = null;
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

function generarSugerencias(alimentosDia: AlimentoCalendario[], diferencia_calorias: number, diferencia_proteina: number, comida_problematica: "desayuno" | "almuerzo" | "cena" | null): Sugerencia[] {
  const sugerencias: Sugerencia[] = [];
  const hayExceso = diferencia_calorias > 20;
  const hayDeficit = diferencia_calorias < -20;
  const hayDeficitProteina = diferencia_proteina < -10;
  const ordenados = comida_problematica
    ? [...alimentosDia.filter((a) => a.comida === comida_problematica), ...alimentosDia.filter((a) => a.comida !== comida_problematica)]
    : alimentosDia;

  if (hayExceso) {
    const reducibles = ordenados
      .filter((a) => a.cantidad > a.porcion_min)
      .sort((a, b) => {
        const densA = a.unidad_medida === "unidad" ? a.calorias_por_unidad : a.calorias_por_unidad / a.porcion_base;
        const densB = b.unidad_medida === "unidad" ? b.calorias_por_unidad : b.calorias_por_unidad / b.porcion_base;
        return densB - densA;
      });
    for (const alimento of reducibles) {
      if (sugerencias.length >= 3) break;
      if (hayDeficitProteina && alimento.proteina_por_unidad > 10) continue;
      const cals_actuales = calcularCalorias(alimento);
      const cals_objetivo = Math.max(calcularCaloriasParaCantidad(alimento, alimento.porcion_min), cals_actuales - Math.abs(diferencia_calorias));
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
      }
    }
  }

  if (hayDeficit) {
    const aumentables = ordenados
      .filter((a) => {
        if (a.cantidad >= a.porcion_max) return false;
        if (hayDeficitProteina) return (a.rol_permitido || []).includes("Proteina");
        return true;
      })
      .sort((a, b) => {
        if (hayDeficitProteina) return b.proteina_por_unidad - a.proteina_por_unidad;
        const densA = a.unidad_medida === "unidad" ? a.calorias_por_unidad : a.calorias_por_unidad / a.porcion_base;
        const densB = b.unidad_medida === "unidad" ? b.calorias_por_unidad : b.calorias_por_unidad / b.porcion_base;
        return densB - densA;
      });

    if (hayDeficitProteina && aumentables.length === 0) {
      const protFaltante = Math.round(Math.abs(diferencia_proteina));
      sugerencias.push({
        tipo: "agregar_snack", alimento_id: "", nombre: "Snack proteico", comida: "cena",
        cantidad_actual: 0, cantidad_nueva: 0, unidad_medida: "unidad",
        impacto_calorias: 0, impacto_proteina: protFaltante,
        descripcion: `Agrega un snack proteico para cubrir ~${protFaltante}g de proteína. Por ejemplo: 1 taza de Yogur Griego (+10g prot), ½ lata de Atún (+14g prot), o 3 claras de huevo (+11g prot). Pregúntale a Lucy en el chat cuál encaja mejor con tu plan.`,
      });
    } else {
      for (const alimento of aumentables) {
        if (sugerencias.length >= 3) break;
        const cals_actuales = calcularCalorias(alimento);
        const cals_nueva = Math.min(calcularCaloriasParaCantidad(alimento, alimento.porcion_max), cals_actuales + Math.abs(diferencia_calorias));
        const cantidad_nueva = calcularCantidadParaCalorias(alimento, cals_nueva);
        if (cantidad_nueva <= alimento.porcion_max && cantidad_nueva > alimento.cantidad) {
          const minDiff = alimento.unidad_medida === "unidad" ? 0.5 : 2;
          if (Math.abs(cantidad_nueva - alimento.cantidad) < minDiff) continue;
          const impacto_cal = calcularCaloriasParaCantidad(alimento, cantidad_nueva) - cals_actuales;
          const impacto_prot = calcularProteinaParaCantidad(alimento, cantidad_nueva) - calcularProteina(alimento);
          sugerencias.push({
            tipo: "aumentar", alimento_id: alimento.alimento_id, nombre: alimento.nombre, comida: alimento.comida,
            cantidad_actual: alimento.cantidad, cantidad_nueva: Math.round(cantidad_nueva * 10) / 10,
            unidad_medida: alimento.unidad_medida, impacto_calorias: Math.round(impacto_cal),
            impacto_proteina: Math.round(impacto_prot * 10) / 10,
            descripcion: formatearSugerencia("aumentar", alimento, alimento.cantidad, Math.round(cantidad_nueva * 10) / 10, Math.round(impacto_cal)),
          });
        }
      }
    }
    if (sugerencias.length < 3) {
      if (hayDeficitProteina) {
        const protFalt = Math.round(Math.abs(diferencia_proteina));
        sugerencias.push({
          tipo: "agregar_snack", alimento_id: "", nombre: "Snack proteico", comida: "cena",
          cantidad_actual: 0, cantidad_nueva: 0, unidad_medida: "unidad",
          impacto_calorias: 0, impacto_proteina: protFalt,
          descripcion: `Agrega un snack proteico para cubrir ~${protFalt}g de proteína. Por ejemplo: 1 taza de Yogur Griego (+10g prot), ½ lata de Atún (+14g prot), o 3 claras de huevo (+11g prot). Pregúntale a Lucy en el chat cuál encaja mejor con tu plan.`,
        });
      } else {
        sugerencias.push({
          tipo: "agregar_snack", alimento_id: "", nombre: "Snack", comida: "cena",
          cantidad_actual: 0, cantidad_nueva: 0, unidad_medida: "unidad",
          impacto_calorias: Math.round(Math.abs(diferencia_calorias)), impacto_proteina: 0,
          descripcion: `Agregar un snack de ~${Math.round(Math.abs(diferencia_calorias))} kcal para completar tu meta. Pregúntale a Lucy qué snack encaja mejor con tu plan.`,
        });
      }
    }
  }

  // Handle protein-only deficit (no caloric deficit)
  if (hayDeficitProteina && !hayDeficit && !hayExceso && sugerencias.length === 0) {
    // Try to increase protein foods
    const protFoods = alimentosDia
      .filter((a) => (a.rol_permitido || []).includes("Proteina") && a.cantidad < a.porcion_max)
      .sort((a, b) => {
        const ppuA = a.unidad_medida === "unidad" ? a.proteina_por_unidad : a.proteina_por_unidad / a.porcion_base;
        const ppuB = b.unidad_medida === "unidad" ? b.proteina_por_unidad : b.proteina_por_unidad / b.porcion_base;
        return ppuB - ppuA;
      });

    for (const alimento of protFoods) {
      if (sugerencias.length >= 2) break;
      const ppu = alimento.unidad_medida === "unidad" ? alimento.proteina_por_unidad : alimento.proteina_por_unidad / alimento.porcion_base;
      if (ppu <= 0) continue;
      const extraNeeded = Math.abs(diferencia_proteina);
      const extraQty = extraNeeded / ppu;
      const cantidad_nueva = Math.min(alimento.porcion_max, Math.round((alimento.cantidad + extraQty) * 10) / 10);
      if (cantidad_nueva > alimento.cantidad) {
        const minDiff = alimento.unidad_medida === "unidad" ? 0.5 : 2;
        if (Math.abs(cantidad_nueva - alimento.cantidad) < minDiff) continue;
        const impacto_prot = calcularProteinaParaCantidad(alimento, cantidad_nueva) - calcularProteina(alimento);
        const impacto_cal = calcularCaloriasParaCantidad(alimento, cantidad_nueva) - calcularCalorias(alimento);
        sugerencias.push({
          tipo: "aumentar", alimento_id: alimento.alimento_id, nombre: alimento.nombre, comida: alimento.comida,
          cantidad_actual: alimento.cantidad, cantidad_nueva,
          unidad_medida: alimento.unidad_medida, impacto_calorias: Math.round(impacto_cal),
          impacto_proteina: Math.round(impacto_prot * 10) / 10,
          descripcion: formatearSugerencia("aumentar", alimento, alimento.cantidad, cantidad_nueva, Math.round(impacto_cal)),
        });
      }
    }

    // Always add protein snack suggestion
    const protFaltante = Math.round(Math.abs(diferencia_proteina));
    sugerencias.push({
      tipo: "agregar_snack", alimento_id: "", nombre: "Snack proteico", comida: "cena",
      cantidad_actual: 0, cantidad_nueva: 0, unidad_medida: "unidad",
      impacto_calorias: 0, impacto_proteina: protFaltante,
      descripcion: `Agrega un snack proteico para cubrir ~${protFaltante}g de proteína. Por ejemplo: 1 taza de Yogur Griego (+10g prot), ½ lata de Atún (+14g prot), o 3 claras de huevo (+11g prot). Pregúntale a Lucy en el chat cuál encaja mejor con tu plan.`,
    });
  }

  return sugerencias.slice(0, 3);
}

export function analizarCalendario(alimentos: AlimentoCalendario[], objetivo_calorias: number, objetivo_proteina: number): ResultadoAnalisis {
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
    const sugerencias = generarSugerencias(alimentosDia, diferencia_calorias, diferencia_proteina, comida_problematica);
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
