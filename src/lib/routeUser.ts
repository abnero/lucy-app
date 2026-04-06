import { supabase } from '@/lib/supabase/client'

export async function getDestination(userId: string): Promise<string> {
  // Check if user has profile with onboarding completed
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('onboarding_completado')
    .eq('id', userId)
    .single()

  if (!usuario?.onboarding_completado) return '/onboarding'

  // Check if user has calendar entries
  const { count } = await supabase
    .from('calendario')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (count && count > 0) return '/mi-calendario'

  // Has profile but no calendar — check if has preferences
  const { count: prefCount } = await supabase
    .from('preferencias_usuario')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (prefCount && prefCount > 0) return '/generando'

  return '/seleccion-alimentos'
}
