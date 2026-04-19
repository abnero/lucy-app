import { supabase } from '@/lib/supabase/client'

export async function getDestination(userId: string): Promise<string> {
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('email, onboarding_completado, aprobado')
    .eq('id', userId)
    .single()

  if (!usuario) {
    // User exists in auth.users but not in public.usuarios
    // Create a minimal row so onboarding can proceed
    await supabase.from('usuarios').insert({
      id: userId,
      nombre: '',
      onboarding_completado: false,
      aprobado: false,
    })
    return '/onboarding'
  }

  // If not approved, check if email is in emails_aprobados
  if (!usuario.aprobado && usuario.email) {
    const { data: approved } = await supabase
      .from('emails_aprobados')
      .select('id')
      .eq('email', usuario.email.toLowerCase())
      .single()

    if (approved) {
      // Auto-approve the user
      await supabase.from('usuarios').update({ aprobado: true }).eq('id', userId)
    } else {
      return '/waitlist'
    }
  }

  if (!usuario.aprobado && !usuario.email) return '/waitlist'

  if (!usuario.onboarding_completado) return '/onboarding'

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
