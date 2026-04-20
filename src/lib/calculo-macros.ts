// src/lib/calculo-macros.ts
// Bug #17 (abril 2026): Centraliza el cálculo de macros.
// Multiplicadores ajustados para mujer profesional 35-55
// basado en feedback de coaches y survey de 15 evangelistas.

export type NivelActividad = 'A' | 'B' | 'C';
export type Meta = 'perder_peso' | 'mantener_peso' | 'ganar_masa';
export type Genero = 'femenino' | 'masculino';

export const FACTORES_ACTIVIDAD: Record<NivelActividad, number> = {
  A: 1.2,  // Día mayormente sentada
  B: 1.3,  // Día con movimiento frecuente
  C: 1.4,  // Día bien activo
};

export const DESCRIPCIONES_NIVEL: Record<NivelActividad, string> = {
  A: 'Tu día es mayormente sentada con poco movimiento',
  B: 'Tu día combina tiempo sentada con movimiento frecuente',
  C: 'Tu día es bien activo, de pie o en movimiento la mayor parte del tiempo',
};

export interface Macros {
  calorias: number;
  proteina: number;
  carbs: number;
  grasas: number;
}

export function calcularMacros(
  pesoKg: number,
  alturaCm: number,
  edad: number,
  nivel: NivelActividad,
  meta: Meta,
  genero: Genero = 'femenino'
): Macros {
  // Mifflin-St Jeor
  const bmr =
    10 * pesoKg +
    6.25 * alturaCm -
    5 * edad +
    (genero === 'masculino' ? 5 : -161);

  const factor = FACTORES_ACTIVIDAD[nivel];
  const tdee = bmr * factor;

  let calorias: number;
  if (meta === 'perder_peso') {
    // Bug #17: déficit aumentado de 10% a 15%
    calorias = Math.max(Math.round(tdee * 0.85), 1200);
  } else if (meta === 'ganar_masa') {
    calorias = Math.round(tdee * 1.2);
  } else {
    calorias = Math.round(tdee);
  }

  const proteina = Math.round((calorias * 0.30) / 4);
  const carbs = Math.round((calorias * 0.40) / 4);
  const grasas = Math.round((calorias * 0.30) / 9);

  return { calorias, proteina, carbs, grasas };
}

// Scoring para las 3 preguntas de actividad física
export interface RespuestasActividad {
  horasSentada: 0 | 1 | 2;      // P1: score directo
  movimientoResto: 0 | 1 | 2;    // P2: score directo
  ejercicioPorSemana: 0 | 1 | 2; // P3: score directo
}

export function calcularNivelDesdeRespuestas(
  respuestas: RespuestasActividad
): NivelActividad {
  const total =
    respuestas.horasSentada +
    respuestas.movimientoResto +
    respuestas.ejercicioPorSemana;

  if (total <= 2) return 'A';
  if (total <= 4) return 'B';
  return 'C';
}

// Mapping de niveles viejos a nuevos
export function mapearNivelViejoANuevo(
  nivelViejo: string
): NivelActividad {
  switch (nivelViejo) {
    case 'sedentario': return 'A';
    case 'ligero': return 'B';
    case 'moderado': return 'B';
    case 'activo': return 'C';
    default: return 'B';
  }
}
