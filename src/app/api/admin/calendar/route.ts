import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

function getCalendarService() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

export async function GET() {
  try {
    const calendar = getCalendarService();
    const calendarId = 'enriquecortesgomez@gmail.com';

    // Semana actual en Madrid (UTC+2)
    const ahora = new Date();
    const offsetMs = 2 * 60 * 60 * 1000;
    const ahoraMadrid = new Date(ahora.getTime() + offsetMs);
    const diaSemana = ahoraMadrid.getUTCDay() === 0 ? 6 : ahoraMadrid.getUTCDay() - 1;

    const lunes = new Date(ahoraMadrid);
    lunes.setUTCDate(ahoraMadrid.getUTCDate() - diaSemana);
    lunes.setUTCHours(0, 0, 0, 0);

    const domingo = new Date(lunes);
    domingo.setUTCDate(lunes.getUTCDate() + 6);
    domingo.setUTCHours(23, 59, 59, 999);

    // Convertir a UTC real
    const timeMin = new Date(lunes.getTime() - offsetMs).toISOString();
    const timeMax = new Date(domingo.getTime() - offsetMs).toISOString();

    // Acceso directo por calendarId — sin calendarList
    const res = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    });

    const eventos = (res.data.items || []).map(e => ({
      id: e.id,
      titulo: e.summary || 'Sin título',
      inicio: e.start?.dateTime || e.start?.date,
      fin: e.end?.dateTime || e.end?.date,
      todoElDia: !e.start?.dateTime,
      descripcion: e.description || '',
      link: e.htmlLink,
    }));

    return Response.json({ eventos, semanaInicio: timeMin, debug: { timeMin, timeMax, total: eventos.length } });

  } catch (error: any) {
    console.error('[Calendar]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
