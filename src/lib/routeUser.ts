import { supabase } from '@/lib/supabase/client'

export async function getDestination(userId: string): Promise<string> {
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('onboarding_completado, aprobado')
    .eq('id', userId)
    .single()

  // Not approved → waitlist
  console.log('[routeUser] aprobado:', usuario?.aprobado, 'onboarding:', usuario?.onboarding_completado)
  if (!usuario?.aprobado) return '/waitlist'

  if (!usuario?.onboarding_completado) return '/onboarding'

  const { count } = await supabase
    .from('calendario')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (count && count > 0) return '/mi-calendario'

  const { count: prefCount } = await supabase
    .from('preferencias_usuario')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (prefCount && prefCount > 0) return '/generando'

  return '/seleccion-alimentos'
}
