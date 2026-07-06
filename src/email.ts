import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY!)

interface SendEmailParams {
  to: string
  subject: string
  html: string
  from?: string
}

export async function sendEmail({ to, subject, html, from }: SendEmailParams) {
  const { data, error } = await resend.emails.send({
    from: from ?? 'Solena <info@solenainmo.es>',
    to,
    subject,
    html,
  })

  if (error) {
    console.error('[Email] Error Resend:', error)
    throw new Error(`Error al enviar email: ${error.message}`)
  }

  console.log(`[Email] Enviado a ${to} — ID: ${data?.id}`)
  return { success: true, id: data?.id }
}

export function templateImpacto3(nombre: string, zona: string): string {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Georgia, serif; color: #2c2c2c; background: #F5F0E8; margin: 0; padding: 0; }
        .container { max-width: 560px; margin: 40px auto; background: #fff; padding: 48px 40px; }
        .logo { font-size: 20px; font-weight: 700; letter-spacing: 0.1em; color: #6B3F2A; margin-bottom: 40px; }
        .headline { font-size: 26px; line-height: 1.35; margin-bottom: 24px; color: #1a1a1a; }
        .body-text { font-size: 15px; line-height: 1.75; color: #555; margin-bottom: 20px; }
        .cta { display: inline-block; background: #6B3F2A; color: #fff !important; text-decoration: none;
               padding: 14px 32px; font-size: 14px; letter-spacing: 0.06em; margin-top: 24px; }
        .footer { margin-top: 48px; font-size: 11px; color: #aaa; border-top: 1px solid #eee; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">SOLENA</div>
        <p class="headline">
          ${nombre}, tenemos opciones en ${zona || 'la Costa del Sol'}<br>que merece la pena ver.
        </p>
        <p class="body-text">
          Gracias por tu interés. He revisado lo que tenemos disponible
          y hay algunas propiedades en ${zona || 'la zona'} que encajan con lo que buscas.
        </p>
        <p class="body-text">
          En breve te preparo una selección. Si tienes alguna pregunta
          concreta, responde directamente a este email.
        </p>
        <a class="cta" href="https://wa.me/34XXXXXXXXXX">
          Contactar por WhatsApp
        </a>
        <div class="footer">
          Has recibido este email porque dejaste tus datos en uno de nuestros anuncios.<br>
          <a href="#" style="color: #aaa;">Darse de baja</a>
        </div>
      </div>
    </body>
    </html>
  `
}
