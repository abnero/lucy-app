import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'

const getResend = () => new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  try {
    console.log('[approval-email] RESEND_API_KEY exists:', !!process.env.RESEND_API_KEY)
    if (!process.env.RESEND_API_KEY) {
      console.error('[approval-email] RESEND_API_KEY is not set')
      return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
    }

    const { email, nombre } = await req.json()
    console.log('[approval-email] Sending to:', email)
    if (!email) {
      return NextResponse.json({ error: 'email required' }, { status: 400 })
    }

    const greeting = nombre ? `Hola ${nombre}` : 'Hola'

    const resend = getResend()
    const { data, error } = await resend.emails.send({
      from: 'Lucy <noreply@lucy.fit>',
      to: email,
      subject: '¡Tu acceso a Lucy está listo! 🎉',
      html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#F8F7FC; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8F7FC; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF; border-radius:16px; border:1px solid #E8E6F4; padding:40px;">
          <tr>
            <td align="center" style="padding-bottom:8px;">
              <span style="font-family:Georgia,serif; font-size:32px; color:#2D2B45;">Lucy</span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <span style="font-size:10px; letter-spacing:3px; text-transform:uppercase; color:#B8B5E0;">CALENDARIO METABÓLICO</span>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:12px;">
              <p style="margin:0; font-size:15px; color:#2D2B45; line-height:1.6;">${greeting},</p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:28px;">
              <p style="margin:0; font-size:14px; color:#9896B0; line-height:1.6;">Tu acceso a Lucy está listo. Crea tu cuenta y empieza a personalizar tu calendario metabólico.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <a href="https://www.lucy.fit/registro" style="display:inline-block; background-color:#7B7FC4; color:#FFFFFF; text-decoration:none; font-size:14px; font-weight:500; padding:12px 32px; border-radius:12px;">Crear mi cuenta</a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <p style="margin:0; font-size:12px; color:#9896B0;">Crea tu cuenta con este email:<br/><strong style="color:#2D2B45;">${email}</strong></p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:20px;">
              <hr style="border:none; border-top:1px solid #E8E6F4; margin:0;">
            </td>
          </tr>
          <tr>
            <td align="center">
              <p style="margin:0; font-size:11px; color:#9896B0;">Lucy &middot; Powered by Caribeño Fit Labs</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    })

    console.log('[approval-email] Resend response:', JSON.stringify(data))
    console.log('[approval-email] Resend error:', JSON.stringify(error))

    if (error) {
      console.error('Resend error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: data?.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
