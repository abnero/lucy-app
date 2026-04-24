import { useMemo } from "react";
import { AlimentoCalendario, CandidatoSnack, DiaProblemático, ResultadoAnalisis, Sugerencia, analizarCalendario } from "@/lib/analisis-calorico";

interface UseAnalisisCaloricoProps {
  alimentos: AlimentoCalendario[];
  objetivo_calorias: number;
  objetivo_proteina: number;
  candidatosSnack?: CandidatoSnack[];
  onCambiarCantidad: (params: {
    alimento_id: string;
    nombre: string;
    comida: string;
    dia: number;
    cantidad_nueva: number;
  }) => Promise<void>;
}

interface UseAnalisisCaloricoResult {
  resultado: ResultadoAnalisis | null;
  diasProblematicos: Set<number>;
  getDiaDato: (dia: number) => DiaProblemático | undefined;
  aplicarSugerencia: (sugerencia: Sugerencia, dia: number) => Promise<void>;
}

export function useAnalisisCalorico({ alimentos, objetivo_calorias, objetivo_proteina, candidatosSnack, onCambiarCantidad }: UseAnalisisCaloricoProps): UseAnalisisCaloricoResult {
  const resultado = useMemo<ResultadoAnalisis | null>(() => {
    if (!alimentos.length || !objetivo_calorias) return null;
    return analizarCalendario(alimentos, objetivo_calorias, objetivo_proteina, candidatosSnack);
  }, [alimentos, objetivo_calorias, objetivo_proteina, candidatosSnack]);

  const diasProblematicos = useMemo(() => {
    if (!resultado) return new Set<number>();
    return new Set(resultado.dias_problematicos.map((d) => d.dia));
  }, [resultado]);

  function getDiaDato(dia: number) {
    return resultado?.dias_problematicos.find((d) => d.dia === dia);
  }

  async function aplicarSugerencia(sugerencia: Sugerencia, dia: number) {
    if (sugerencia.tipo === "agregar_snack") return;
    await onCambiarCantidad({
      alimento_id: sugerencia.alimento_id,
      nombre: sugerencia.nombre,
      comida: sugerencia.comida,
      dia,
      cantidad_nueva: sugerencia.cantidad_nueva,
    });
  }

  return { resultado, diasProblematicos, getDiaDato, aplicarSugerencia };
}
