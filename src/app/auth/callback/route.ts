import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Redirect to home — the client-side AuthProvider will pick up
      // the session from the URL hash and route accordingly
      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  // If no code or exchange failed, redirect to a client-side page
  // that can handle the hash fragment (tokens in URL hash)
  return NextResponse.redirect(`${origin}/auth/handle`)
}
