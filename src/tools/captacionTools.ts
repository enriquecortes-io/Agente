import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

export interface CaptacionData {
  nombreCliente: string;
  emailCliente: string;
  resumenPropiedad: string;
}

export async function enviarSolicitudDocumentos(datos: CaptacionData) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Email al cliente solicitando fotos y documentos
    await resend.emails.send({
      from: 'Harvis <onboarding@resend.dev>',
      to: datos.emailCliente,
      subject: 'Próximos pasos para la valoración de su propiedad — The Edit Marbella',
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #e8e0d0; padding: 40px;">
          <p style="color: #8a7a6a; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 24px 0;">THE EDIT MARBELLA — CAPTACIÓN</p>
          <h1 style="color: #e8e0d0; font-weight: normal; font-size: 22px; margin: 0 0 24px 0;">Valoración de su propiedad</h1>
          <p style="color: #c8b89a; font-size: 15px; line-height: 1.7; margin-bottom: 24px;">
            Estimado ${datos.nombreCliente},
          </p>
          <p style="color: #c8b89a; font-size: 15px; line-height: 1.7; margin-bottom: 32px;">
            Gracias por confiar en The Edit Marbella para la venta de su propiedad. Para iniciar el proceso de valoración, necesitamos que nos envíe la siguiente documentación:
          </p>
          
          <div style="background: #111; border-left: 3px solid #c8a96a; padding: 24px; margin-bottom: 32px;">
            <p style="color: #c8a96a; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 16px 0;">Documentación requerida</p>
            <ul style="color: #c8b89a; font-size: 14px; line-height: 2; margin: 0; padding-left: 20px;">
              <li>Nota simple del Registro de la Propiedad</li>
              <li>Último recibo del IBI</li>
              <li>Certificado de eficiencia energética (si dispone)</li>
              <li>Planos de la propiedad (si dispone)</li>
            </ul>
          </div>

          <div style="background: #111; border-left: 3px solid #c8a96a; padding: 24px; margin-bottom: 32px;">
            <p style="color: #c8a96a; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 16px 0;">Fotografías</p>
            <ul style="color: #c8b89a; font-size: 14px; line-height: 2; margin: 0; padding-left: 20px;">
              <li>Fachada exterior y jardín/piscina</li>
              <li>Salón principal</li>
              <li>Cocina</li>
              <li>Dormitorio principal y baño en suite</li>
              <li>Vistas desde la propiedad</li>
              <li>Zonas comunes (si aplica)</li>
            </ul>
          </div>

          <p style="color: #c8b89a; font-size: 14px; line-height: 1.7; margin-bottom: 32px;">
            <strong style="color: #e8e0d0;">Resumen de su propiedad:</strong><br>
            ${datos.resumenPropiedad}
          </p>

          <p style="color: #8a7a6a; font-size: 13px; line-height: 1.6;">
            Puede enviarnos la documentación respondiendo a este email o a través de WeTransfer si el tamaño es elevado. En un plazo de 48-72 horas recibirá nuestra valoración detallada.
          </p>
          <p style="color: #3a3a3a; font-size: 11px; text-align: center; margin-top: 40px;">Harvis Real Estate Intelligence · The Edit Marbella</p>
        </div>
      `,
    });

    // Email a Enrique con el resumen
    await resend.emails.send({
      from: 'Harvis <onboarding@resend.dev>',
      to: process.env.ENRIQUE_EMAIL!,
      subject: `🏠 Nueva captación — ${datos.nombreCliente}`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #e8e0d0; padding: 40px;">
          <p style="color: #8a7a6a; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 24px 0;">HARVIS — NUEVA CAPTACIÓN</p>
          <h1 style="color: #e8e0d0; font-weight: normal; font-size: 22px; margin: 0 0 24px 0;">${datos.nombreCliente}</h1>
          <p style="color: #c8a96a; margin: 0 0 24px 0;">${datos.emailCliente}</p>
          <div style="background: #111; border-left: 3px solid #c8a96a; padding: 24px; margin-bottom: 24px;">
            <p style="color: #c8a96a; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 12px 0;">Resumen propiedad</p>
            <p style="color: #c8b89a; font-size: 14px; line-height: 1.7; margin: 0;">${datos.resumenPropiedad}</p>
          </div>
          <p style="color: #8a7a6a; font-size: 13px;">Email de solicitud de documentación enviado al cliente. Pendiente de recibir fotos y documentos.</p>
          <p style="color: #3a3a3a; font-size: 11px; text-align: center; margin-top: 40px;">Harvis Real Estate Intelligence · Marbella</p>
        </div>
      `,
    });

    console.log(`[Captacion] Emails enviados — ${datos.nombreCliente}`);
    return { success: true, message: `Solicitud de documentación enviada a ${datos.emailCliente}` };

  } catch (error: any) {
    console.error('[Captacion] Error:', error.message);
    return { success: false, error: error.message };
  }
}
