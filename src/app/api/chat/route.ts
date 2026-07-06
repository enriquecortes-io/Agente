import { SYSTEM_PROMPT } from '../../../agents/realEstateExecutive.js';
import { searchPropertiesInSupabase } from '../../../tools/supabaseTools.js';
import { prepararEntornoCliente, actualizarHistorial } from '../../../tools/driveLogger.js';
import { sendCrmLeadNotification } from '../../../tools/webhookTools.js';
import { agendarVisita, parsearIntentVisita } from '../../../tools/calendarTools.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function isAuthorized(req: Request): boolean {
  const secret = process.env.AGENT_API_SECRET;
  if (!secret) return true;
  return req.headers.get('x-agent-key') === secret;
}

const ZONAS_COSTA_DEL_SOL = ["Golden Mile","Milla de Oro","Sierra Blanca","Nagüeles","Cascada de Camoján","Puerto Banús","Nueva Andalucía","Las Brisas","Los Naranjos","La Cerquilla","Los Monteros","Río Real","Cabopino","Elviria","Las Chapas","La Mairena","El Rosario","La Cañada","La Carolina","Marbella Centro","Rocío de Nagüeles","La Alzambra","Los Pinos de Nagüeles","Lomas de Marbella Club","Marbella Club","Puente Romano","Los Verdiales","Marbella Lake","Imara","Altos de Puente Romano","Jardines de Sierra Blanca","La Corniche","Marina de Marbella","La Zagaleta","Los Flamingos","La Quinta","Monte Halcones","Los Arqueros","La Alquería","Atalaya","El Paraíso","Benahavís","La Heredia","Marbella Club Golf","Los Arrayanes","El Madroñal","La Morelia","Montemayor","Cortijo Blanco","Los Riscos","La Capellanía","Vega del Colorado","Estepona","Cancelada","Guadalmina","San Pedro de Alcántara","San Pedro","Costalita","Selwo","La Resina","Seghers","El Padrón","Valle Romano","Atalaya Park","Bahía Dorada","Buenas Noches","La Gaspara","El Campanario","Torre Bermeja","Los Granados","Laguna Village","Estepona Golf","Benamara","Alcazaba Beach","Hacienda del Sol","El Velerin","Los Hidalgos","Monte Mayor","Punta Plata","Las Mesas","Arroyo Vaquero","Lomas de Cancelada","Hacienda Beach","Los Granados del Mar","Marina de Estepona","La Galera","Resinera Voladilla","Green Golf Estepona","Colinas del Paraíso","Torre Andalucia","Mijas","Mijas Pueblo","Las Lagunas","El Chaparral","Mijas Costa","Calahonda","Sitio de Calahonda","Miraflores","La Cala de Mijas","La Cala Golf","Entrerríos","El Faro","Mijas Golf","Riviera del Sol","Las Palmeras","Bahía de Mijas","La Cala Hills","Lomas de Mijas","Monte Bello","Hacienda Mijas","Mijas Natura","Sotogrande","La Reserva de Sotogrande","Valderrama","Kings and Queens","Sotogrande Alto","Sotogrande Costa","La Alcaidesa","San Roque","Los Altos de Valderrama","Pueblo Nuevo de Guadiaro","La Cañada de Sotogrande","Los Pinos de Sotogrande","La Reserva Club","Marina de Sotogrande","El Sotillo","Los Eucaliptos","Torreguadiaro","Guadiaro","Castellar","Las Nayades"];

function detectarContacto(mensaje: string) {
  const emailMatch = mensaje.match(/[\w.-]+@[\w.-]+\.[a-z]{2,}/i);
  const phoneMatch = mensaje.match(/\+?[\d\s\-]{9,}/);
  const nombreMatch = mensaje.match(/(?:soy|me llamo|cliente[:\s]+|con\s+)([A-ZÁÉÍÓÚÑa-záéíóúñ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ][a-záéíóúñ]+){0,2})/i);
  const presupuestoMatch =
    mensaje.match(/(\d+(?:[.,]\d+)?)\s*(?:millones?|M€|M\s*eur)/i) ||
    mensaje.match(/(\d{1,3}(?:[.,]\d{3})*)\s*(?:euros?|€)/i) ||
    mensaje.match(/(\d+)\s*(?:mil\s*euros?|k€)/i);
  return {
    email: emailMatch?.[0] || null,
    phone: phoneMatch?.[0]?.trim() || null,
    nombre: nombreMatch?.[1]?.trim() || null,
    presupuesto: presupuestoMatch ? (() => {
      const raw = presupuestoMatch[1].replace(/\./g, '').replace(',', '.');
      const num = parseFloat(raw);
      if (presupuestoMatch[0].match(/millon/i)) return num * 1_000_000;
      if (presupuestoMatch[0].match(/mil\s*euro|k€/i)) return num * 1_000;
      return num;
    })() : null,
  };
}

function construirRespuesta(propiedades: any[], nombreCliente: string | null, zona: string | null): string {
  if (propiedades.length === 0) {
    return `Encantado${nombreCliente ? `, ${nombreCliente}` : ''}. En este momento no tenemos en catálogo una propiedad que encaje exactamente${zona ? ` en ${zona}` : ''}. Tenemos acceso a propiedades off-market — ¿profundizamos en sus requisitos?`;
  }
  const intro = `Encantado${nombreCliente ? `, ${nombreCliente}` : ''}. He encontrado ${propiedades.length === 1 ? 'esta propiedad' : 'estas propiedades'}:\n\n`;
  const lista = propiedades.map((p: any) =>
    `**${p.titulo}** — ${p.referencia}\n📍 ${p.municipio} · 🛏 ${p.habitaciones} hab · 💰 €${Number(p.precio).toLocaleString('es-ES')}\n🔗 ${p.url}`
  ).join('\n\n');
  return intro + lista + '\n\n¿Te gustaría programar una visita privada?';
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'No autorizado.' }), { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Body inválido.' }), { status: 400 });
  }

  const { messages: incomingMessages, project = 'tem' } = body;
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Falta NVIDIA_API_KEY.' }), { status: 500 });

  const requestId = crypto.randomUUID().slice(0, 8);
  const ultimoMensaje = incomingMessages[incomingMessages.length - 1]?.content || '';
  const todosLosMensajes = incomingMessages.map((m: any) => m.content).join('\n');

  // Detectar tipo de lead
  const esVendedor = /quiero vender|vendo|vender mi|tengo.*(?:piso|villa|casa|apartamento|finca|propiedad).*(?:vender|venta)|busco comprador|como funcionais|cómo funcionáis|servicio.*venta|vender.*propiedad/i.test(ultimoMensaje);
  const tipoLeadCrm = esVendedor ? 'Captacion' : 'Venta';

  // Detectar contacto en toda la conversación
  const contacto = detectarContacto(todosLosMensajes);
  const zonaCrm = ZONAS_COSTA_DEL_SOL.find(z => ultimoMensaje.toLowerCase().includes(z.toLowerCase())) || undefined;

  // Auto-CRM fire-and-forget
  if (contacto.nombre && (contacto.email || contacto.phone)) {
    sendCrmLeadNotification({
      nombre: contacto.nombre, contacto: contacto.email || contacto.phone || '',
      presupuesto: contacto.presupuesto || undefined,
      notasCualificacion: ultimoMensaje.slice(0, 300), tipoLead: tipoLeadCrm,
    }).catch(() => {});
  }

  try {
    // ── DETECCIÓN DE VISITA ─────────────────────────────────────
    const intentVisita = parsearIntentVisita(ultimoMensaje);
    if (intentVisita) {
      // Extraer nombre del cliente de toda la conversación
      const nombreCliente = contacto.nombre || 'Cliente';

      // Extraer propiedad mencionada
      const propMatch = todosLosMensajes.match(/(?:villa|apartamento|ático|piso|propiedad|casa)\s+[A-ZÁ][a-záéíóúñ\s]+/i);
      const propiedadTitulo = propMatch?.[0] || 'Propiedad en Marbella';

      // Extraer URL de propiedad si existe en el historial
      const urlMatch = todosLosMensajes.match(/https?:\/\/\S+theeditmarbella\S+/i);
      const propiedadUrl = urlMatch?.[0];

      // Validar que tenemos fecha y hora mínimas
      if (intentVisita.fecha && intentVisita.hora) {
        const visita = {
          nombreCliente,
          emailCliente: intentVisita.emailCliente || contacto.email || undefined,
          propiedadTitulo,
          propiedadUrl,
          fecha: intentVisita.fecha,
          hora: intentVisita.hora,
          duracionMinutos: 90,
          project: project as 'tem' | 'solena',
        };

        const resultado = await agendarVisita(visita);

        if (resultado.success) {
          const respuesta = `✅ Visita agendada.\n\n📅 **${visita.nombreCliente}** · ${visita.propiedadTitulo}\n🗓 ${visita.fecha} a las ${visita.hora}\n${visita.emailCliente ? `📧 Confirmación enviada a ${visita.emailCliente}` : ''}\n🔗 ${resultado.link}`;
          return new Response(JSON.stringify({ success: true, message: respuesta, requestId }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          });
        } else {
          return new Response(JSON.stringify({ success: false, message: `Error al agendar: ${resultado.error}`, requestId }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          });
        }
      } else {
        // Faltan datos — pedir al usuario
        const falta = !intentVisita.fecha ? 'la fecha' : 'la hora';
        return new Response(JSON.stringify({ success: true, message: `Para confirmar la visita necesito ${falta}. ¿Me lo puedes indicar?`, requestId }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // ── CAPTACIÓN ───────────────────────────────────────────────
    if (esVendedor) {
      const nombre = contacto.nombre || '';
      const respuesta = nombre
        ? `Encantado, ${nombre}. En ${project === 'solena' ? 'Solena' : 'The Edit Marbella'} nos especializamos en la venta de propiedades en la Costa del Sol. Trabajamos con compradores precualificados y valoración por datos reales de mercado. ¿En qué zona se encuentra su propiedad y qué precio estimado tiene en mente?`
        : '¿Con quién tengo el placer de hablar? Me gustaría conocer más sobre su propiedad.';
      return new Response(JSON.stringify({ success: true, message: respuesta, requestId }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── BÚSQUEDA DIRECTA ────────────────────────────────────────
    const zonaDirecta = ZONAS_COSTA_DEL_SOL.find(z => ultimoMensaje.toLowerCase().includes(z.toLowerCase())) || null;
    const yaHayPropiedades = todosLosMensajes.includes('theeditmarbella.com/es/propiedades');
    const esSeguimiento = /visita|agendar|llamada|interesa|cuando|disponible|fotos/i.test(ultimoMensaje);

    if ((zonaDirecta || contacto.presupuesto) && !yaHayPropiedades && !esSeguimiento) {
      const resultado = await searchPropertiesInSupabase({
        urbanizacion: zonaDirecta || undefined,
        municipioDeducido: zonaDirecta || undefined,
        precioMax: contacto.presupuesto || undefined,
      });
      if ((resultado.propiedades ?? []).length > 0) {
        const respuesta = construirRespuesta(resultado.propiedades ?? [], contacto.nombre, zonaDirecta);
        if (contacto.nombre) {
          prepararEntornoCliente(contacto.nombre, 'Venta')
            .then(r => { if (r.docId) actualizarHistorial(r.docId, ultimoMensaje, respuesta).catch(() => {}); })
            .catch(() => {});
        }
        return new Response(JSON.stringify({ success: true, message: respuesta, requestId }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // ── NVIDIA STREAMING ────────────────────────────────────────
    const nvidiaRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'meta/llama-3.1-8b-instruct',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...incomingMessages.map((m: any) => ({ role: m.role, content: m.content })),
        ],
        max_tokens: 150, temperature: 0.4, stream: true,
      }),
    });

    if (!nvidiaRes.ok) throw new Error(`NVIDIA ${nvidiaRes.status}`);

    const stream = new ReadableStream({
      async start(controller) {
        const reader = nvidiaRes.body!.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            for (const line of chunk.split('\n').filter(l => l.startsWith('data: '))) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const token = JSON.parse(data).choices?.[0]?.delta?.content || '';
                if (token) { fullText += token; controller.enqueue(new TextEncoder().encode(token)); }
              } catch {}
            }
          }
          if (fullText && contacto.nombre) {
            prepararEntornoCliente(contacto.nombre, 'Venta')
              .then(r => { if (r.docId) actualizarHistorial(r.docId, ultimoMensaje, fullText).catch(() => {}); })
              .catch(() => {});
          }
        } finally { controller.close(); }
      }
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked', 'X-Request-Id': requestId },
    });

  } catch (error: any) {
    console.error(`[${requestId}] Error:`, error.message);
    return new Response(JSON.stringify({ success: false, error: error.message, requestId }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
