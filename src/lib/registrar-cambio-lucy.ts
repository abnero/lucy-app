import { supabase } from '@/lib/supabase/client'

export async function registrarCambioEnChat(params: {
  user_id: string
  nombre_alimento: string
  comida: string
  dia_nombre: string
  cantidad_anterior: number
  cantidad_nueva: number
  unidad_medida: string
  impacto_calorias: number
}) {
  const unidad = params.unidad_medida === 'unidad'
    ? params.cantidad_nueva === 1 ? 'unidad' : 'unidades'
    : params.unidad_medida === 'ml' ? 'ml' : 'g'

  const signo = params.impacto_calorias > 0 ? '+' : ''
  const accion = params.cantidad_nueva < params.cantidad_anterior ? 'Reduje' : 'Aumenté'

  const mensaje = `Ajusté tu plan: ${accion} el ${params.nombre_alimento} en el ${params.comida} del ${params.dia_nombre} de ${params.cantidad_anterior} a ${params.cantidad_nueva} ${unidad} (${signo}${params.impacto_calorias} kcal) para acercarte a tu meta calórica.`

  await supabase.from('conversaciones').insert({
    user_id: params.user_id,
    role: 'assistant',
    content: mensaje,
  })
}
