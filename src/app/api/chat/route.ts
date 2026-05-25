import { SYSTEM_PROMPT } from '../../../agents/realEstateExecutive.js';
import { searchPropertiesInSupabase } from '../../../tools/supabaseTools.js';
import { prepararEntornoCliente, actualizarHistorial } from '../../../tools/driveLogger.js';
import { sendCrmLeadNotification } from '../../../tools/webhookTools.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

function isAuthorized(req: Request): boolean {
  const secret = process.env.AGENT_API_SECRET;
  if (!secret) return true;
  return req.headers.get('x-agent-key') === secret;
}

function detectarContacto(mensaje: string) {
  const emailMatch = mensaje.match(/[\w.-]+@[\w.-]+\.[a-z]{2,}/i);
  const phoneMatch = mensaje.match(/\+?[\d\s\-]{9,}/);
  const nombreMatch = mensaje.match(/(?:soy|me llamo)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ][a-záéíóúñ]+){0,2})/i);
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
    return num; // ya en euros
  })() : null,
  };
}

function construirRespuesta(propiedades: any[], nombreCliente: string | null, zona: string | null): string {
  if (propiedades.length === 0) {
    return `Encantado${nombreCliente ? `, ${nombreCliente}` : ''}. En este momento no tenemos en catálogo una propiedad que encaje exactamente con sus criterios${zona ? ` en ${zona}` : ''}. Lo que sí podemos hacer es realizar una selección curada a medida — accedemos a propiedades off-market y mandatos exclusivos que no aparecen públicamente. ¿Le parece bien que profundicemos en sus requisitos para encontrar exactamente lo que busca?`;
  }

  const intro = `Encantado${nombreCliente ? `, ${nombreCliente}` : ''}. He encontrado ${propiedades.length === 1 ? 'esta propiedad' : 'estas propiedades'} que podrían interesarte:\n\n`;

  const lista = propiedades.map((p: any) =>
    `**${p.titulo}** — ${p.referencia}\n📍 ${p.municipio} · 🛏 ${p.habitaciones} hab · 💰 €${Number(p.precio).toLocaleString('es-ES')}\n🔗 ${p.url}`
  ).join('\n\n');

  const cierre = '\n\n¿Te gustaría programar una visita privada o necesitas más información sobre alguna de ellas?';

  return intro + lista + cierre;
}


// Zonas y urbanizaciones de la Costa del Sol
const ZONAS_COSTA_DEL_SOL = ["Golden Mile","Milla de Oro","Sierra Blanca","Nagüeles","Cascada de Camoján","Puerto Banús","Nueva Andalucía","Las Brisas","Los Naranjos","La Cerquilla","Los Monteros","Río Real","Cabopino","Elviria","Las Chapas","La Mairena","El Rosario","La Cañada","La Carolina","Marbella Centro","Rocío de Nagüeles","La Alzambra","Los Pinos de Nagüeles","Lomas de Marbella Club","Marbella Club","Puente Romano","Los Verdiales","Marbella Lake","Imara","Altos de Puente Romano","Jardines de Sierra Blanca","La Corniche","Marina de Marbella","La Zagaleta","Los Flamingos","La Quinta","Monte Halcones","Los Arqueros","La Alquería","Atalaya","El Paraíso","Benahavís","La Heredia","Marbella Club Golf","Los Arrayanes","El Madroñal","La Morelia","Montemayor","Cortijo Blanco","Los Riscos","La Capellanía","Vega del Colorado","Estepona","Cancelada","Guadalmina","San Pedro de Alcántara","San Pedro","Costalita","Selwo","La Resina","Seghers","El Padrón","Valle Romano","Atalaya Park","Bahía Dorada","Buenas Noches","La Gaspara","El Campanario","Torre Bermeja","Los Granados","Laguna Village","Estepona Golf","Benamara","Alcazaba Beach","Hacienda del Sol","El Velerin","Los Hidalgos","Monte Mayor","Punta Plata","Las Mesas","Arroyo Vaquero","Lomas de Cancelada","Hacienda Beach","Los Granados del Mar","Marina de Estepona","La Galera","Resinera Voladilla","Green Golf Estepona","Colinas del Paraíso","Torre Andalucia","Mijas","Mijas Pueblo","Las Lagunas","El Chaparral","Mijas Costa","Calahonda","Sitio de Calahonda","Miraflores","La Cala de Mijas","La Cala Golf","Entrerríos","El Faro","Mijas Golf","Riviera del Sol","Las Palmeras","Bahía de Mijas","La Cala Hills","Lomas de Mijas","Monte Bello","Hacienda Mijas","Mijas Natura","Sotogrande","La Reserva de Sotogrande","Valderrama","Kings and Queens","Sotogrande Alto","Sotogrande Costa","La Alcaidesa","San Roque","Los Altos de Valderrama","Pueblo Nuevo de Guadiaro","La Cañada de Sotogrande","Los Pinos de Sotogrande","La Reserva Club","Marina de Sotogrande","El Sotillo","Los Eucaliptos","Torreguadiaro","Guadiaro","Castellar"];

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'No autorizado.' }), { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Body inválido.' }), { status: 400 });
  }

  const { messages: incomingMessages } = body;
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Falta NVIDIA_API_KEY.' }), { status: 500 });

  const requestId = crypto.randomUUID().slice(0, 8);
  const ultimoMensaje = incomingMessages[incomingMessages.length - 1]?.content || '';

  // Detectar contacto e insertar lead — dispara webhook Supabase → Resend
  const contacto = detectarContacto(ultimoMensaje);
  const esVendedorCrm = /quiero vender|vendo|vender mi|tengo.*(?:piso|villa|casa|apartamento|finca|propiedad).*(?:vender|venta)|busco comprador/i.test(ultimoMensaje);
  const tipoLeadCrm = esVendedorCrm ? 'Captacion' : 'Venta';
  const zonaCrm = ZONAS_COSTA_DEL_SOL.find(z => ultimoMensaje.toLowerCase().includes(z.toLowerCase())) || undefined;

  if (contacto.nombre && (contacto.email || contacto.phone)) {
    const nombreStr = contacto.nombre;
    const contactoStr = contacto.email || contacto.phone || '';
    console.log(`[${requestId}] auto-crm: ${nombreStr} / ${contactoStr} / ${tipoLeadCrm}`);
    sendCrmLeadNotification({
      nombre: nombreStr, contacto: contactoStr,
      presupuesto: contacto.presupuesto || undefined,
      notasCualificacion: ultimoMensaje.slice(0, 300), tipoLead: tipoLeadCrm,
    }).catch(() => {});
    fetch('https://harvis-six.vercel.app/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'INSERT',
        table: tipoLeadCrm === 'Captacion' ? 'captacion_leads' : 'leads',
        record: { name: nombreStr, email: contactoStr, notas: ultimoMensaje.slice(0, 300), zona: zonaCrm },
      }),
    }).catch(() => {});
  }

  try {
    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...incomingMessages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    // Tipo de lead ya detectado arriba
    const esCaptacion = esVendedorCrm;

    // Detectar zona y presupuesto del mensaje para búsqueda directa
    const zonaMatch = ZONAS_COSTA_DEL_SOL.find(z => ultimoMensaje.toLowerCase().includes(z.toLowerCase()));
    const zonaDirecta = zonaMatch || null;
    const presupuestoDirecto = contacto.presupuesto;

    // Búsqueda directa solo para compradores
    if (!esCaptacion && (zonaDirecta || presupuestoDirecto)) {
      console.log(`[${requestId}] búsqueda directa: ${zonaDirecta} / ${presupuestoDirecto}`);
      const resultadoBusqueda = await searchPropertiesInSupabase({
        urbanizacion: zonaDirecta || undefined,
        municipioDeducido: zonaDirecta || undefined,
        precioMax: presupuestoDirecto || undefined,
      });
      if ((resultadoBusqueda.propiedades ?? []).length > 0) {
        const respuesta = construirRespuesta(resultadoBusqueda.propiedades ?? [], contacto.nombre, zonaDirecta);
        // Registrar cliente async
        if (contacto.nombre) {
          prepararEntornoCliente(contacto.nombre, 'Venta')
            .then(r => { if (r.docId) actualizarHistorial(r.docId, ultimoMensaje, respuesta).catch(() => {}); })
            .catch(() => {});
        }
        return new Response(
          JSON.stringify({ success: true, message: respuesta, docId: null, requestId }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // UNA sola llamada a NVIDIA
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'meta/llama-3.3-70b-instruct',
        messages,
        tools: [
          { type: 'function', function: { name: 'registrarCliente', description: 'Registra al cliente. Llama siempre primero.', parameters: { type: 'object', properties: { nombreCliente: { type: 'string' }, tipoLead: { type: 'string', enum: ['Venta','Captacion','Gestion'] } }, required: ['nombreCliente','tipoLead'] } } },
          { type: 'function', function: { name: 'buscarPropiedades', description: 'Busca propiedades para leads Venta.', parameters: { type: 'object', properties: { zona: { type: 'string' }, precioMax: { type: 'number' } } } } },
        ],
        tool_choice: 'auto',
        max_tokens: 600,
        temperature: 0.4,
      }),
    });

    if (!res.ok) throw new Error(`NVIDIA ${res.status}`);
    const data = await res.json();
    const assistantMsg = data.choices?.[0]?.message;
    let respuestaFinal = assistantMsg?.content || '';
    let docId: string | null = null;
    let propiedadesEncontradas: any[] = [];
    let zonaDetectada: string | null = null;

    // Procesar tool calls en paralelo
    if (assistantMsg?.tool_calls?.length > 0) {
      await Promise.all(
        assistantMsg.tool_calls.map(async (toolCall: any) => {
          const nombre = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          console.log(`[${requestId}] Tool: ${nombre}`);

          if (nombre === 'registrarCliente') {
            const resultado = await prepararEntornoCliente(args.nombreCliente, args.tipoLead);
            if (resultado.docId) docId = resultado.docId;
          } else if (nombre === 'buscarPropiedades') {
            zonaDetectada = args.zona || null;
            const resultado = await searchPropertiesInSupabase({
              urbanizacion: args.zona, municipioDeducido: args.zona, precioMax: args.precioMax
            });
            if (resultado.propiedades) propiedadesEncontradas = resultado.propiedades;
          }
        })
      );

      // Construir respuesta sin segunda llamada a NVIDIA
      if (!respuestaFinal) {
        respuestaFinal = construirRespuesta(propiedadesEncontradas, contacto.nombre, zonaDetectada);
      }

      // Auto-log async
      if (docId && respuestaFinal) {
        actualizarHistorial(docId, ultimoMensaje, respuestaFinal).catch(() => {});
      }
    }

    // Si el modelo respondió en texto directamente (sin tool calls)
    if (!respuestaFinal) {
      respuestaFinal = 'Encantado. ¿Con quién tengo el placer de hablar?';
    }

    return new Response(
      JSON.stringify({ success: true, message: respuestaFinal, docId, requestId }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error(`[${requestId}] Error:`, error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message, requestId }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
