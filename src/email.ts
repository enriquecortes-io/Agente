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
  const waLink = 'https://wa.me/34610589716'
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: Georgia, serif; color: #2c2c2c; background: #F5F0E8; margin: 0; padding: 0; }
        .container { max-width: 560px; margin: 40px auto; background: #fff; padding: 48px 40px; }
        .logo { font-size: 18px; font-weight: 700; letter-spacing: 0.12em; color: #6B3F2A; margin-bottom: 40px; text-transform: uppercase; }
        .headline { font-size: 24px; line-height: 1.4; margin-bottom: 20px; color: #1a1a1a; }
        .body-text { font-size: 15px; line-height: 1.8; color: #555; margin-bottom: 16px; }
        .cta-wrap { margin-top: 32px; margin-bottom: 8px; }
        .cta { display: inline-block; background: #25D366; color: #fff !important; text-decoration: none;
               padding: 14px 28px; font-size: 15px; border-radius: 4px; font-family: Georgia, serif; }
        .footer { margin-top: 48px; font-size: 11px; color: #bbb; border-top: 1px solid #f0ebe3; padding-top: 20px; line-height: 1.6; }
        .footer a { color: #bbb; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">Solena</div>

        <p class="headline">
          Hola ${nombre}, gracias por interesarte<br>en propiedades en ${zona || 'la Costa del Sol'} 🏡
        </p>

        <p class="body-text">
          He recibido tu consulta y ya estoy mirando qué tenemos disponible en ${zona || 'la zona'} que encaje con lo que buscas.
        </p>

        <p class="body-text">
          En cuanto tenga algo concreto te lo mando. Pero si quieres hablarlo antes o tienes alguna pregunta, escríbeme directamente por WhatsApp — es lo más rápido.
        </p>

        <div class="cta-wrap">
          <a class="cta" href="${waLink}">
            💬 Escribir por WhatsApp
          </a>
        </div>

        <div class="footer">
          Has recibido este email porque dejaste tus datos en uno de nuestros anuncios.<br>
          <a href="#">Darse de baja</a>
        </div>
      </div>
    </body>
    </html>
  `
}
