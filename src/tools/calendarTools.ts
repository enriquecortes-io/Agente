import { google } from 'googleapis';
import { Resend } from 'resend';

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

export interface VisitaData {
  nombreCliente: string;
  emailCliente?: string;
  propiedadTitulo: string;
  propiedadUrl?: string;
  fecha: string;
  hora: string;
  duracionMinutos?: number;
  notas?: string;
  project?: 'tem' | 'solena';
}

function generarICS(visita: VisitaData, duracion: number): string {
  const inicio = new Date(`${visita.fecha}T${visita.hora}:00`);
  const fin = new Date(inicio.getTime() + duracion * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace('.000Z', 'Z');
  return [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Harvis//ES','CALSCALE:GREGORIAN','METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:harvis-${Date.now()}@theeditmarbella.com`,
    `DTSTART:${fmt(inicio)}`,`DTEND:${fmt(fin)}`,
    `SUMMARY:🏠 Visita — ${visita.propiedadTitulo}`,
    `DESCRIPTION:Cliente: ${visita.nombreCliente}\\nPropiedad: ${visita.propiedadTitulo}${visita.propiedadUrl?'\\n'+visita.propiedadUrl:''}${visita.notas?'\\nNotas: '+visita.notas:''}`,
    `LOCATION:Marbella, España`,
    'STATUS:CONFIRMED','SEQUENCE:0',
    'BEGIN:VALARM','TRIGGER:-PT60M','ACTION:EMAIL',`DESCRIPTION:Recordatorio visita ${visita.propiedadTitulo}`,'END:VALARM',
    'BEGIN:VALARM','TRIGGER:-PT30M','ACTION:DISPLAY',`DESCRIPTION:Visita en 30 minutos`,'END:VALARM',
    'END:VEVENT','END:VCALENDAR',
  ].join('\r\n');
}

export async function agendarVisita(visita: VisitaData) {
  try {
    const calendar = getCalendarService();
    const calendarId = 'enriquecortesgomez@gmail.com';
    const duracion = visita.duracionMinutos || 90;
    const inicio = new Date(`${visita.fecha}T${visita.hora}:00`);
    const fin = new Date(inicio.getTime() + duracion * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().replace('Z', '').slice(0, 19) + '+02:00';

    const fromEmail = visita.project === 'solena'
      ? 'Solena <info@solenainmo.es>'
      : 'The Edit Marbella <info@theeditmarbella.com>';
    const fromDomain = visita.project === 'solena'
      ? 'Solena Inmobiliaria'
      : 'The Edit Marbella';

    // Crear evento en Google Calendar
    const evento = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: `🏠 Visita — ${visita.nombreCliente} | ${visita.propiedadTitulo}`,
        description: `👤 ${visita.nombreCliente}\n📧 ${visita.emailCliente||'Sin email'}\n🏠 ${visita.propiedadTitulo}${visita.propiedadUrl?'\n🔗 '+visita.propiedadUrl:''}${visita.notas?'\n📝 '+visita.notas:''}`,
        start: { dateTime: fmt(inicio), timeZone: 'Europe/Madrid' },
        end: { dateTime: fmt(fin), timeZone: 'Europe/Madrid' },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 60 },
            { method: 'popup', minutes: 30 },
          ],
        },
      },
    });

    console.log(`[Calendar] Evento creado: ${evento.data.htmlLink}`);

    // Email al cliente con .ics adjunto
    if (visita.emailCliente) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const icsBase64 = Buffer.from(generarICS(visita, duracion)).toString('base64');

      const fechaFormateada = new Date(`${visita.fecha}T${visita.hora}:00`).toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });

      await resend.emails.send({
        from: fromEmail,
        to: visita.emailCliente,
        subject: `Visita confirmada — ${visita.propiedadTitulo}`,
        attachments: [{ filename: 'visita-marbella.ics', content: icsBase64 }],
        html: `
          <div style="font-family:Georgia,serif;max-width:580px;margin:0 auto;background:#0a0a0a;color:#e8e0d0;padding:48px 40px;">
            <p style="color:#8a7a6a;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:0 0 6px">${fromDomain}</p>
            <h1 style="color:#e8e0d0;font-weight:300;font-size:22px;margin:0 0 36px;letter-spacing:0.05em">Visita confirmada</h1>
            <table style="width:100%;border-collapse:collapse;margin-bottom:32px;">
              <tr><td style="color:#8a7a6a;padding:12px 0;border-bottom:1px solid #1a1a1a;font-size:11px;letter-spacing:1px;text-transform:uppercase;width:110px">Propiedad</td><td style="color:#e8e0d0;padding:12px 0;border-bottom:1px solid #1a1a1a;font-size:14px">${visita.propiedadTitulo}</td></tr>
              <tr><td style="color:#8a7a6a;padding:12px 0;border-bottom:1px solid #1a1a1a;font-size:11px;letter-spacing:1px;text-transform:uppercase">Fecha</td><td style="color:#e8e0d0;padding:12px 0;border-bottom:1px solid #1a1a1a;font-size:14px">${fechaFormateada}</td></tr>
              <tr><td style="color:#8a7a6a;padding:12px 0;border-bottom:1px solid #1a1a1a;font-size:11px;letter-spacing:1px;text-transform:uppercase">Hora</td><td style="color:#e8e0d0;padding:12px 0;border-bottom:1px solid #1a1a1a;font-size:14px">${visita.hora} (hora de Madrid)</td></tr>
              <tr><td style="color:#8a7a6a;padding:12px 0;font-size:11px;letter-spacing:1px;text-transform:uppercase">Duración</td><td style="color:#e8e0d0;padding:12px 0;font-size:14px">${duracion} minutos</td></tr>
            </table>
            ${visita.notas?`<p style="color:#8a7a6a;font-size:13px;border-top:1px solid #1a1a1a;padding-top:20px;margin-bottom:24px">${visita.notas}</p>`:''}
            <p style="color:#5a5a4a;font-size:12px;margin-bottom:24px">El archivo adjunto (.ics) se añade automáticamente a tu calendario al abrirlo.</p>
            ${visita.propiedadUrl?`<a href="${visita.propiedadUrl}" style="display:inline-block;background:#c8a96a;color:#0a0a0a;padding:12px 28px;text-decoration:none;font-size:11px;letter-spacing:2px;text-transform:uppercase">Ver propiedad →</a>`:''}
            <p style="color:#2a2a2a;font-size:11px;text-align:center;margin-top:48px;letter-spacing:0.05em">${fromDomain} · Marbella, Costa del Sol</p>
          </div>
        `,
      });
      console.log(`[Calendar] Email enviado a ${visita.emailCliente}`);
    }

    return {
      success: true,
      eventoId: evento.data.id,
      link: evento.data.htmlLink,
      message: `Visita con ${visita.nombreCliente} agendada para el ${visita.fecha} a las ${visita.hora}. ${visita.emailCliente ? 'Email de confirmación enviado.' : ''}`,
    };

  } catch (error: any) {
    console.error('[Calendar] Error:', error.message);
    return { success: false, error: error.message };
  }
}

// ─── Parser de lenguaje natural ───────────────────────────────
export function parsearIntentVisita(texto: string): Partial<VisitaData> | null {
  const lower = texto.toLowerCase();

  // Detectar intent
  const esVisita = /\b(agenda|agendar|reserva|reservar|programa|programar|concreta|confirma|visita|cita)\b/.test(lower);
  if (!esVisita) return null;

  const resultado: Partial<VisitaData> = {};

  // Email
  const emailMatch = texto.match(/[\w.-]+@[\w.-]+\.[a-z]{2,}/i);
  if (emailMatch) resultado.emailCliente = emailMatch[0];

  // Hora
  const horaMatch = texto.match(/(?:a las?\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:h|horas?)?/i);
  if (horaMatch) {
    const h = horaMatch[1].padStart(2, '0');
    const m = (horaMatch[2] || '00').padStart(2, '0');
    resultado.hora = `${h}:${m}`;
  }

  // Fecha
  const hoy = new Date();
  if (/mañana/.test(lower)) {
    const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1);
    resultado.fecha = manana.toISOString().slice(0, 10);
  } else if (/pasado mañana/.test(lower)) {
    const pm = new Date(hoy); pm.setDate(hoy.getDate() + 2);
    resultado.fecha = pm.toISOString().slice(0, 10);
  } else {
    // "el martes", "el lunes"...
    const dias: Record<string,number> = { lunes:1, martes:2, miércoles:3, miercoles:3, jueves:4, viernes:5, sábado:6, sabado:6, domingo:0 };
    for (const [dia, num] of Object.entries(dias)) {
      if (lower.includes(dia)) {
        const d = new Date(hoy);
        const diff = (num - d.getDay() + 7) % 7 || 7;
        d.setDate(d.getDate() + diff);
        resultado.fecha = d.toISOString().slice(0, 10);
        break;
      }
    }
    // Fecha explícita "15 de julio", "15/07"
    const fechaExp = texto.match(/(\d{1,2})\s*(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i);
    if (fechaExp) {
      const meses: Record<string,string> = { enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',octubre:'10',noviembre:'11',diciembre:'12' };
      const mes = meses[fechaExp[2].toLowerCase()];
      const dia = fechaExp[1].padStart(2, '0');
      resultado.fecha = `${hoy.getFullYear()}-${mes}-${dia}`;
    }
    const fechaNum = texto.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (fechaNum && !resultado.fecha) {
      const y = fechaNum[3] ? (fechaNum[3].length === 2 ? '20'+fechaNum[3] : fechaNum[3]) : hoy.getFullYear().toString();
      resultado.fecha = `${y}-${fechaNum[2].padStart(2,'0')}-${fechaNum[1].padStart(2,'0')}`;
    }
  }

  return resultado;
}

// ─── Cancelar evento ─────────────────────────────────────────
export async function cancelarEvento(eventoId: string) {
  try {
    const calendar = getCalendarService();
    await calendar.events.delete({
      calendarId: 'enriquecortesgomez@gmail.com',
      eventId: eventoId,
    });
    return { success: true, message: 'Evento cancelado correctamente.' };
  } catch (error: any) {
    console.error('[Calendar] Error cancelando:', error.message);
    return { success: false, error: error.message };
  }
}

// ─── Mover evento ─────────────────────────────────────────────
export async function moverEvento(eventoId: string, nuevaFecha: string, nuevaHora: string, duracionMinutos = 90) {
  try {
    const calendar = getCalendarService();
    const inicio = new Date(`${nuevaFecha}T${nuevaHora}:00`);
    const fin = new Date(inicio.getTime() + duracionMinutos * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().replace('Z', '').slice(0, 19) + '+02:00';

    const res = await calendar.events.patch({
      calendarId: 'enriquecortesgomez@gmail.com',
      eventId: eventoId,
      requestBody: {
        start: { dateTime: fmt(inicio), timeZone: 'Europe/Madrid' },
        end: { dateTime: fmt(fin), timeZone: 'Europe/Madrid' },
      },
    });

    return {
      success: true,
      message: `Evento movido a ${nuevaFecha} a las ${nuevaHora}.`,
      link: res.data.htmlLink,
    };
  } catch (error: any) {
    console.error('[Calendar] Error moviendo:', error.message);
    return { success: false, error: error.message };
  }
}

// ─── Buscar evento por título ──────────────────────────────────
export async function buscarEventoPorTitulo(titulo: string) {
  try {
    const calendar = getCalendarService();
    const hoy = new Date();
    const enUnMes = new Date(hoy); enUnMes.setMonth(hoy.getMonth() + 1);

    const res = await calendar.events.list({
      calendarId: 'enriquecortesgomez@gmail.com',
      q: titulo,
      timeMin: new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), // -7 días
      timeMax: enUnMes.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 5,
    });

    return res.data.items || [];
  } catch (error: any) {
    console.error('[Calendar] Error buscando:', error.message);
    return [];
  }
}
