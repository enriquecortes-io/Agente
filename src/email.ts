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
        .highlight { background: #F5F0E8; border-left: 3px solid #6B3F2A; padding: 16px 20px; margin: 24px 0; font-size: 14px; color: #444; line-height: 1.7; }
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
          Hola ${nombre}, hemos recibido tu consulta 👋
        </p>

        <p class="body-text">
          Gracias por contactar con Solena. Ya tenemos los datos de tu propiedad en ${zona || 'la Costa del Sol'} y en menos de 24 horas te enviamos una valoración sin compromiso.
        </p>

        <p class="body-text">
          Mientras tanto, aquí tienes un resumen de cómo trabajamos:
        </p>

        <div class="highlight">
          ✓ <strong>Solo cobramos si vendemos</strong> — sin costes anticipados<br>
          ✓ <strong>60 días de media</strong> con exclusiva (frente a 4 meses sin agencia)<br>
          ✓ <strong>+30 portales</strong> y 8.000 visualizaciones en los primeros 10 días<br>
          ✓ <strong>Compradores con financiación aprobada</strong> — sin operaciones que se caen
        </div>

        <p class="body-text">
          Si tienes alguna pregunta o quieres hablar antes de la valoración, escríbenos directamente por WhatsApp. Es lo más rápido.
        </p>

        <div class="cta-wrap">
          <a class="cta" href="${waLink}">
            💬 Hablar por WhatsApp
          </a>
        </div>

        <div class="footer">
          Solena Inmobiliaria · Urb. La Alzambra, Centro de Negocios Vasari, Marbella<br>
          +34 610 589 716 · info@solenainmo.es<br><br>
          Has recibido este email porque dejaste tus datos en uno de nuestros formularios.<br>
          <a href="#">Darse de baja</a>
        </div>
      </div>
    </body>
    </html>
  `
}
