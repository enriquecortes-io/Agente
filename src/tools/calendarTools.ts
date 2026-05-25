import { google } from 'googleapis';
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
    return {
      success: true,
      eventoId: evento.data.id,
      link: evento.data.htmlLink,
      message: `Visita con ${visita.nombreCliente} agendada para el ${visita.fecha} a las ${visita.hora}.`,
    };

  } catch (error: any) {
    console.error('[Calendar] Error:', error.message);
    return { success: false, error: error.message };
  }
}
