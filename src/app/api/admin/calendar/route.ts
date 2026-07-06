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

    // Lunes de esta semana
    const hoy = new Date();
    const diaSemana = hoy.getDay() === 0 ? 6 : hoy.getDay() - 1;
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diaSemana);
    lunes.setHours(0, 0, 0, 0);

    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    domingo.setHours(23, 59, 59, 999);

    const res = await calendar.events.list({
      calendarId,
      timeMin: lunes.toISOString(),
      timeMax: domingo.toISOString(),
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

    return Response.json({ eventos, semanaInicio: lunes.toISOString() });
  } catch (error: any) {
    console.error('[Calendar] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
