import { Resend } from 'resend';
import { generarNDAHtml } from './templates/nda.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

export interface NDAData {
  nombreCliente: string;
  emailCliente: string;
  propiedadTitulo?: string;
  propiedadReferencia?: string;
}

export async function generarYEnviarNDA(datos: NDAData) {
  try {
    const fecha = new Date().toLocaleDateString('es-ES', {
      day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid',
    });

    const html = generarNDAHtml({ ...datos, fecha });

    // Generar PDF con Puppeteer
    const chromium = await import('@sparticuz/chromium');
    const puppeteer = await import('puppeteer-core');

    const browser = await puppeteer.default.launch({
      args: chromium.default.args,
      executablePath: await chromium.default.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      printBackground: true,
    });
    await browser.close();

    console.log(`[NDA] PDF generado — ${pdfBuffer.length} bytes`);

    // Enviar por email
    const resend = new Resend(process.env.RESEND_API_KEY);
    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');

    await resend.emails.send({
      from: 'Harvis <onboarding@resend.dev>',
      to: datos.emailCliente,
      subject: `Acuerdo de Confidencialidad — The Edit Marbella`,
      attachments: [{ filename: `NDA_${datos.nombreCliente.replace(/\s+/g, '_')}.pdf`, content: pdfBase64 }],
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #e8e0d0; padding: 40px;">
          <p style="color: #8a7a6a; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 24px 0;">THE EDIT MARBELLA</p>
          <h1 style="color: #e8e0d0; font-weight: normal; font-size: 22px; margin: 0 0 24px 0;">Acuerdo de Confidencialidad</h1>
          <p style="color: #c8b89a; font-size: 15px; line-height: 1.7; margin-bottom: 24px;">
            Estimado ${datos.nombreCliente},
          </p>
          <p style="color: #c8b89a; font-size: 15px; line-height: 1.7; margin-bottom: 32px;">
            Adjunto encontrará el Acuerdo de Confidencialidad para acceder a nuestra selección de propiedades exclusivas${datos.propiedadTitulo ? `, incluyendo <strong style="color:#c8a96a">${datos.propiedadTitulo}</strong>` : ''}.
            <br><br>
            Por favor, fírmelo y devuélvalo por email. A continuación le facilitaremos acceso completo a la documentación y precios de las propiedades seleccionadas.
          </p>
          <p style="color: #8a7a6a; font-size: 12px; line-height: 1.6;">The Edit Marbella · Real Estate Intelligence</p>
        </div>
      `,
    });

    console.log(`[NDA] Email enviado a ${datos.emailCliente}`);
    return { success: true, message: `NDA enviado a ${datos.emailCliente}` };

  } catch (error: any) {
    console.error('[NDA] Error:', error.message);
    return { success: false, error: error.message };
  }
}
