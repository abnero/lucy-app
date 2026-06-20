import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import rutinasData from '@/data/mis-rutinas.json'

function createAuthenticatedClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  )
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createAuthenticatedClient(authHeader.replace('Bearer ', ''))
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Check aprobado flag
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('aprobado, email')
    .eq('id', user.id)
    .single()

  if (!usuario) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  let isApproved = usuario.aprobado === true

  // Fallback: check emails_aprobados allowlist
  if (!isApproved && usuario.email) {
    const { data: approved } = await supabase
      .from('emails_aprobados')
      .select('id')
      .eq('email', usuario.email.toLowerCase())
      .single()

    if (approved) {
      isApproved = true
    }
  }

  if (!isApproved) {
    return NextResponse.json({ error: 'Acceso no autorizado' }, { status: 403 })
  }

  return NextResponse.json(rutinasData)
}
