import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

function getCalendarService() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });
  return google.calendar({ version: 'v3', auth });
}

export async function GET() {
  try {
    const calendar = getCalendarService();
    const calendarId = 'enriquecortesgomez@gmail.com';

    // Lunes de esta semana en Madrid (UTC+2)
    const ahora = new Date();
    const offsetMadrid = 2 * 60; // minutos
    const ahoraMadrid = new Date(ahora.getTime() + offsetMadrid * 60 * 1000);

    const diaSemana = ahoraMadrid.getUTCDay() === 0 ? 6 : ahoraMadrid.getUTCDay() - 1;
    const lunes = new Date(ahoraMadrid);
    lunes.setUTCDate(ahoraMadrid.getUTCDate() - diaSemana);
    lunes.setUTCHours(0, 0, 0, 0);

    const domingo = new Date(lunes);
    domingo.setUTCDate(lunes.getUTCDate() + 6);
    domingo.setUTCHours(23, 59, 59, 999);

    // Convertir de vuelta a UTC real para la API
    const timeMin = new Date(lunes.getTime() - offsetMadrid * 60 * 1000).toISOString();
    const timeMax = new Date(domingo.getTime() - offsetMadrid * 60 * 1000).toISOString();

    console.log(`[Calendar] Buscando eventos: ${timeMin} → ${timeMax}`);
    console.log(`[Calendar] CalendarId: ${calendarId}`);

    // Primero listar calendarios disponibles para el service account
    const calList = await calendar.calendarList.list();
    console.log(`[Calendar] Calendarios accesibles:`, calList.data.items?.map(c => c.id));

    const res = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    });

    console.log(`[Calendar] Eventos encontrados: ${res.data.items?.length || 0}`);

    const eventos = (res.data.items || []).map(e => ({
      id: e.id,
      titulo: e.summary || 'Sin título',
      inicio: e.start?.dateTime || e.start?.date,
      fin: e.end?.dateTime || e.end?.date,
      todoElDia: !e.start?.dateTime,
      descripcion: e.description || '',
      link: e.htmlLink,
    }));

    return Response.json({
      eventos,
      semanaInicio: new Date(lunes.getTime() - offsetMadrid * 60 * 1000).toISOString(),
      debug: { timeMin, timeMax, totalEventos: eventos.length }
    });

  } catch (error: any) {
    console.error('[Calendar] Error:', error.message);
    return Response.json({ error: error.message, stack: error.stack?.slice(0, 500) }, { status: 500 });
  }
}
