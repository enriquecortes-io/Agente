import { google } from 'googleapis';
import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

function getCalendarService() {
  if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error('[Calendar] Faltan credenciales de Google en .env.local');
  }
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

export interface VisitaData {
  nombreCliente: string;
  emailCliente?: string;
  propiedadTitulo: string;
  propiedadUrl?: string;
  fecha: string;
  hora: string;
  duracionMinutos?: number;
  notas?: string;
}

function generarICS(visita: VisitaData, duracion: number): string {
  const inicio = new Date(`${visita.fecha}T${visita.hora}:00`);
  const fin = new Date(inicio.getTime() + duracion * 60 * 1000);

  const formatICS = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace('.000Z', 'Z');

  const uid = `harvis-${Date.now()}@theeditmarbella.com`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Harvis Real Estate//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART:${formatICS(inicio)}`,
    `DTEND:${formatICS(fin)}`,
    `SUMMARY:🏠 Visita — ${visita.propiedadTitulo}`,
    `DESCRIPTION:Visita privada a ${visita.propiedadTitulo}\\nCliente: ${visita.nombreCliente}${visita.propiedadUrl ? '\\nVer propiedad: ' + visita.propiedadUrl : ''}${visita.notas ? '\\nNotas: ' + visita.notas : ''}`,
    `ORGANIZER;CN=Harvis Real Estate:mailto:onboarding@resend.dev`,
    ...(visita.emailCliente ? [`ATTENDEE;CN=${visita.nombreCliente};RSVP=TRUE:mailto:${visita.emailCliente}`] : []),
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    `LOCATION:Marbella, España`,
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:EMAIL',
    `DESCRIPTION:Recordatorio: Visita a ${visita.propiedadTitulo}`,
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    `DESCRIPTION:Visita a ${visita.propiedadTitulo} en 30 minutos`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export async function agendarVisita(visita: VisitaData) {
  try {
    const calendar = getCalendarService();
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'enriquecortesgomez@gmail.com';
    const duracion = visita.duracionMinutos || 90;

    const inicio = new Date(`${visita.fecha}T${visita.hora}:00`);
    const fin = new Date(inicio.getTime() + duracion * 60 * 1000);

    const formatearFecha = (d: Date) =>
      d.toISOString().replace('Z', '+02:00').slice(0, 19) + '+02:00';

    const descripcion =
      `👤 Cliente: ${visita.nombreCliente}\n` +
      `📧 Email: ${visita.emailCliente || 'No proporcionado'}\n` +
      `🏠 Propiedad: ${visita.propiedadTitulo}\n` +
      (visita.propiedadUrl ? `🔗 ${visita.propiedadUrl}\n` : '') +
      (visita.notas ? `📝 Notas: ${visita.notas}` : '');

    // Crear evento en Google Calendar de Enrique
    const evento = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: `🏠 Visita — ${visita.nombreCliente} | ${visita.propiedadTitulo}`,
        description: descripcion,
        start: { dateTime: formatearFecha(inicio), timeZone: 'Europe/Madrid' },
        end: { dateTime: formatearFecha(fin), timeZone: 'Europe/Madrid' },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 60 },
            { method: 'popup', minutes: 30 },
          ],
        },
      },
    });

    console.log(`[Calendar] Visita agendada: ${evento.data.htmlLink}`);

    // Email al cliente con archivo .ics adjunto
    if (visita.emailCliente) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const icsContent = generarICS(visita, duracion);
      const icsBase64 = Buffer.from(icsContent).toString('base64');

      await resend.emails.send({
        from: 'Harvis <onboarding@resend.dev>',
        to: visita.emailCliente,
        subject: `Visita confirmada — ${visita.propiedadTitulo}`,
        attachments: [
          {
            filename: 'visita-marbella.ics',
            content: icsBase64,
          },
        ],
        html: `
          <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #e8e0d0; padding: 40px; border-radius: 8px;">
            <p style="color: #8a7a6a; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 8px 0;">HARVIS — REAL ESTATE MARBELLA</p>
            <h1 style="color: #e8e0d0; font-weight: normal; font-size: 24px; margin: 0 0 32px 0;">Visita confirmada</h1>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 32px;">
              <tr><td style="color: #8a7a6a; padding: 12px 0; border-bottom: 1px solid #1a1a1a; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; width: 120px;">Propiedad</td><td style="color: #e8e0d0; padding: 12px 0; border-bottom: 1px solid #1a1a1a;">${visita.propiedadTitulo}</td></tr>
              <tr><td style="color: #8a7a6a; padding: 12px 0; border-bottom: 1px solid #1a1a1a; font-size: 12px; letter-spacing: 1px; text-transform: uppercase;">Fecha</td><td style="color: #e8e0d0; padding: 12px 0; border-bottom: 1px solid #1a1a1a;">${visita.fecha}</td></tr>
              <tr><td style="color: #8a7a6a; padding: 12px 0; border-bottom: 1px solid #1a1a1a; font-size: 12px; letter-spacing: 1px; text-transform: uppercase;">Hora</td><td style="color: #e8e0d0; padding: 12px 0; border-bottom: 1px solid #1a1a1a;">${visita.hora} (hora de Madrid)</td></tr>
              <tr><td style="color: #8a7a6a; padding: 12px 0; font-size: 12px; letter-spacing: 1px; text-transform: uppercase;">Duración</td><td style="color: #e8e0d0; padding: 12px 0;">${duracion} minutos</td></tr>
            </table>
            <p style="color: #8a7a6a; font-size: 13px; margin-bottom: 24px;">El archivo adjunto (.ics) se añadirá automáticamente a tu calendario al abrirlo.</p>
            ${visita.propiedadUrl ? `<a href="${visita.propiedadUrl}" style="display: inline-block; background: #c8a96a; color: #0a0a0a; padding: 12px 32px; text-decoration: none; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; border-radius: 2px;">Ver propiedad</a>` : ''}
            <p style="color: #3a3a3a; font-size: 11px; text-align: center; margin-top: 40px;">Harvis Real Estate Intelligence · Marbella</p>
          </div>
        `,
      }).catch((e: any) => console.error('[Resend cliente]', e.message));

      console.log(`[Calendar] Email + .ics enviado a ${visita.emailCliente}`);
    }

    return {
      success: true,
      eventoId: evento.data.id,
      link: evento.data.htmlLink,
      message: `Visita con ${visita.nombreCliente} agendada para el ${visita.fecha} a las ${visita.hora}. Email de confirmación enviado.`,
    };

  } catch (error: any) {
    console.error('[Calendar] Error:', error.message);
    return { success: false, error: error.message };
  }
}
