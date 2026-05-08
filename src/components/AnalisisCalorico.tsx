"use client";

import { useState } from "react";
import { Compensacion, DiaProblemático, OpcionSnack, ResultadoAnalisis, Sugerencia } from "@/lib/analisis-calorico";
import FoodAvatar from "@/components/FoodAvatar";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import { toImperial } from "@/lib/units";

interface DayPillProps {
  dia: number;
  label: string;
  activo: boolean;
  problematico: boolean;
  onClick: () => void;
}

export function DayPill({ label, activo, problematico, onClick }: DayPillProps) {
  return (
    <button onClick={onClick} className="relative flex items-center justify-center">
      <span className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${activo ? "bg-[#7B7FC4] text-white" : "bg-white text-[#2D2B45] border border-gray-200"}`}>
        {label}
      </span>
      {problematico && (
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[#F8F7FC]" aria-label="Día fuera de meta" />
      )}
    </button>
  );
}

interface BannerAnalisisDiaProps {
  diaDato: DiaProblemático;
  onAplicarSugerencia: (sugerencia: Sugerencia, dia: number) => Promise<void>;
  onAgregarSnack?: (opcion: OpcionSnack, dia: number) => Promise<{ compensaciones: Compensacion[] }>;
}

interface SnackResultado {
  nombre: string;
  opcion: OpcionSnack;
  compensaciones: Compensacion[];
}

export function BannerAnalisisDia({ diaDato, onAplicarSugerencia, onAgregarSnack }: BannerAnalisisDiaProps) {
  const trackEvent = useTrackEvent();
  const [abierto, setAbierto] = useState(false);
  const [aplicando, setAplicando] = useState<number | null>(null);
  const [aplicados, setAplicados] = useState<number[]>([]);
  const [snackAgregando, setSnackAgregando] = useState<string | null>(null);
  const [snackResultados, setSnackResultados] = useState<Map<string, SnackResultado>>(new Map());

  const tieneExcesoCal = diaDato.problemas.includes("exceso_calorias");
  const tieneDeficitCal = diaDato.problemas.includes("deficit_calorias");
  const tieneDeficitProt = diaDato.problemas.includes("deficit_proteina");
  const kcalDiff = Math.abs(diaDato.diferencia_calorias);
  const protDiff = Math.abs(Math.round(diaDato.diferencia_proteina));

  let mensaje: string;
  if ((tieneExcesoCal || tieneDeficitCal) && tieneDeficitProt) {
    const calPart = tieneExcesoCal ? `${kcalDiff} kcal de más` : `${kcalDiff} kcal de menos`;
    mensaje = `Este día tiene ${calPart} y ${protDiff}g de proteína de menos`;
  } else if (tieneExcesoCal) {
    mensaje = `Este día tiene ${kcalDiff} kcal de más`;
  } else if (tieneDeficitCal) {
    mensaje = `Este día tiene ${kcalDiff} kcal de menos`;
  } else {
    mensaje = `Este día tiene ${protDiff}g de proteína de menos`;
  }

  async function handleAplicar(sugerencia: Sugerencia, index: number) {
    if (aplicando !== null) return;
    trackEvent('action_aceptar_sugerencia_banner', { tipo: sugerencia.tipo, nombre: sugerencia.nombre, dia: diaDato.dia });
    setAplicando(index);
    try {
      await onAplicarSugerencia(sugerencia, diaDato.dia);
      setAplicados((prev) => [...prev, index]);
    } catch (e) {
      console.error("Error aplicando sugerencia:", e);
    } finally {
      setAplicando(null);
    }
  }

  async function handleAgregarSnack(opcion: OpcionSnack) {
    if (!onAgregarSnack || snackAgregando) return;
    setSnackAgregando(opcion.alimento_id);
    try {
      const result = await onAgregarSnack(opcion, diaDato.dia);
      setSnackResultados((prev) => {
        const next = new Map(prev);
        next.set(opcion.alimento_id, {
          nombre: opcion.nombre,
          opcion,
          compensaciones: result.compensaciones,
        });
        return next;
      });
    } catch (e) {
      console.error("Error agregando snack:", e);
    } finally {
      setSnackAgregando(null);
    }
  }

  return (
    <div className="mx-4 mb-4 rounded-2xl overflow-hidden border border-red-200 bg-red-50">
      <button onClick={() => setAbierto(!abierto)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <span className="text-red-500 text-lg">⚠️</span>
          <span className="text-sm font-medium text-red-700">{mensaje}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-500 font-medium">{diaDato.sugerencias.length} sugerencias</span>
          <span className="text-red-400 text-xs">{abierto ? "▲" : "▼"}</span>
        </div>
      </button>

      {abierto && (
        <div className="px-4 pb-4 space-y-3 border-t border-red-200 pt-3">
          <div className="flex gap-4 text-xs text-red-600 bg-red-100 rounded-xl px-3 py-2">
            <span>🔥 {Math.round(diaDato.macros.calorias)} / {diaDato.objetivo_calorias} kcal</span>
            <span>💪 {Math.round(diaDato.macros.proteina)}g / {Math.round(diaDato.objetivo_proteina)}g prot</span>
          </div>

          {/* Confirmation messages for applied snacks — persists across analysis recalculations */}
          {snackResultados.size > 0 && (
            <div className="space-y-2">
              {Array.from(snackResultados.values()).map((res) => (
                <div key={res.opcion.alimento_id} className="rounded-xl border border-green-200 bg-green-50 p-3">
                  <p className="text-xs text-[#2D2B45]">
                    <span className="font-medium">✓ Agregado {res.nombre}</span>
                    {res.compensaciones.length > 0 && (
                      <>
                        {". Ajusté "}
                        {res.compensaciones.slice(0, 3).map((c, ci) => (
                          <span key={c.alimento_id}>
                            {ci > 0 && " y "}
                            {c.nombre} de {toImperial(c.cantidad_antes, res.opcion)} a {toImperial(c.cantidad_despues, res.opcion)}
                          </span>
                        ))}
                        {" para balancear."}
                      </>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}

          {diaDato.sugerencias.map((sug, i) => {
            const yaAplicado = aplicados.includes(i);

            // Snack suggestion with real options
            if (sug.tipo === "agregar_snack" && sug.opciones_snack && sug.opciones_snack.length > 0) {
              // Filter out already-applied options
              const opcionesPendientes = sug.opciones_snack.filter(
                (o) => !snackResultados.has(o.alimento_id)
              );
              if (opcionesPendientes.length === 0) return null;

              return (
                <div key={i} className="space-y-2">
                  <p className="text-xs font-medium text-[#2D2B45]">{sug.descripcion}</p>
                  {opcionesPendientes.map((opcion) => {
                    const cargando = snackAgregando === opcion.alimento_id;
                    return (
                      <div
                        key={opcion.alimento_id}
                        className="rounded-xl border border-red-200 bg-white p-3 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <FoodAvatar nombre={opcion.nombre} foto_url={opcion.foto_url} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-[#2D2B45] leading-snug">
                              {opcion.nombre}
                            </p>
                            <p className="text-xs text-gray-500">
                              {toImperial(opcion.cantidad, opcion)}
                            </p>
                            <p className="text-xs text-gray-400">
                              +{opcion.kcal_aporta} kcal{opcion.prot_aporta > 0 ? `, ${opcion.prot_aporta}g prot` : ""}
                            </p>
                            {!opcion.es_del_pool && (
                              <p className="text-[10px] text-[#7B7FC4] mt-0.5">Nuevo alimento</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleAgregarSnack(opcion)}
                            disabled={!!snackAgregando}
                            className={`shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                              cargando
                                ? "bg-gray-100 text-gray-400 cursor-wait"
                                : "bg-[#7B7FC4] text-white active:scale-95"
                            }`}
                          >
                            {cargando ? "..." : "Agregar"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            // Snack suggestion without options (legacy fallback)
            if (sug.tipo === "agregar_snack") {
              return (
                <div key={i} className="rounded-xl border border-red-200 bg-white p-3">
                  <p className="text-xs font-medium text-[#2D2B45] leading-snug">{sug.descripcion}</p>
                </div>
              );
            }

            // Aumentar / Reducir suggestions (unchanged)
            return (
              <div key={i} className={`rounded-xl border p-3 transition-all ${yaAplicado ? "border-green-200 bg-green-50" : "border-red-200 bg-white"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-[#2D2B45] leading-snug">{sug.descripcion}</p>
                    {sug.impacto_proteina !== 0 && (
                      <p className="text-xs text-gray-400 mt-1">Proteína: {sug.impacto_proteina > 0 ? "+" : ""}{sug.impacto_proteina}g</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleAplicar(sug, i)}
                    disabled={aplicando !== null || yaAplicado}
                    className={`shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${yaAplicado ? "bg-green-100 text-green-600 cursor-default" : aplicando === i ? "bg-gray-100 text-gray-400 cursor-wait" : "bg-[#7B7FC4] text-white active:scale-95"}`}
                  >
                    {yaAplicado ? "✓" : aplicando === i ? "..." : "Aplicar"}
                  </button>
                </div>
              </div>
            );
          })}

          <p className="text-xs text-red-400 text-center pt-1">
            ¿Ninguna opción te convence?{" "}
            <span className="underline cursor-pointer">Pregúntale a Lucy en el chat</span>
          </p>
        </div>
      )}
    </div>
  );
}

interface BannerResumenProps {
  resultado: ResultadoAnalisis;
  onVerDetalle: () => void;
}

export function BannerResumen({ resultado, onVerDetalle }: BannerResumenProps) {
  if (resultado.dias_problematicos.length === 0) return null;
  return (
    <div className="mx-4 mb-3 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-red-500">⚠️</span>
        <span className="text-xs font-medium text-red-700">{resultado.resumen}</span>
      </div>
      <button onClick={onVerDetalle} className="text-xs text-[#7B7FC4] font-medium underline shrink-0">Ver días</button>
    </div>
  );
}
