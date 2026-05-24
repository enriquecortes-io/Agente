import { SYSTEM_PROMPT } from '../../../agents/realEstateExecutive.js';
import { searchPropertiesInSupabase } from '../../../tools/supabaseTools.js';
import { prepararEntornoCliente, actualizarHistorial } from '../../../tools/driveLogger.js';
import { sendCrmLeadNotification } from '../../../tools/webhookTools.js';
import { notificarEnrique } from '../../../tools/notificacionTools.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

function isAuthorized(req: Request): boolean {
  const secret = process.env.AGENT_API_SECRET;
  if (!secret) return true;
  return req.headers.get('x-agent-key') === secret;
}

const TOOLS = [
  { type: 'function', function: { name: 'registrarCliente', description: 'Registra al cliente en Drive. Llama esto SIEMPRE primero.', parameters: { type: 'object', properties: { nombreCliente: { type: 'string' }, tipoLead: { type: 'string', enum: ['Venta','Captacion','Gestion'] } }, required: ['nombreCliente','tipoLead'] } } },
  { type: 'function', function: { name: 'buscarPropiedades', description: 'Busca propiedades. Solo para leads Venta.', parameters: { type: 'object', properties: { zona: { type: 'string' }, precioMax: { type: 'number' } } } } },
  { type: 'function', function: { name: 'notificarLeadCRM', description: 'Registra lead. Llama cuando tengas nombre + contacto + presupuesto.', parameters: { type: 'object', properties: { nombre: { type: 'string' }, contacto: { type: 'string' }, presupuesto: { type: 'number' }, notasCualificacion: { type: 'string' }, tipoLead: { type: 'string' } }, required: ['nombre','contacto','notasCualificacion'] } } },
  { type: 'function', function: { name: 'guardarConversacion', description: 'Guarda el turno. Llama UNA VEZ al final.', parameters: { type: 'object', properties: { docId: { type: 'string' }, mensajeUsuario: { type: 'string' }, respuestaAgente: { type: 'string' } }, required: ['docId','mensajeUsuario','respuestaAgente'] } } },
];

async function llamarNvidia(messages: any[], apiKey: string) {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'meta/llama-3.3-70b-instruct',
      messages, tools: TOOLS, tool_choice: 'auto',
      max_tokens: 800, temperature: 0.4,
    }),
  });
  if (!res.ok) throw new Error(`NVIDIA ${res.status}: ${await res.text()}`);
  return (await res.json()).choices?.[0]?.message;
}

// Detectar datos de contacto en el mensaje
function detectarContacto(mensaje: string) {
  const emailMatch = mensaje.match(/[\w.-]+@[\w.-]+\.[a-z]{2,}/i);
  const phoneMatch = mensaje.match(/\+?[\d\s\-]{9,}/);
  const nombreMatch = mensaje.match(/(?:soy|me llamo)\s+([\w\s]{3,30}?)(?:,|\.|quiero|busco|mi\s)/i);
  const presupuestoMatch = mensaje.match(/(\d+(?:[.,]\d+)?)\s*(?:millones?|M€|M\s*eur)/i);

  return {
    email: emailMatch?.[0] || null,
    phone: phoneMatch?.[0]?.trim() || null,
    nombre: nombreMatch?.[1]?.trim() || null,
    presupuesto: presupuestoMatch ? parseFloat(presupuestoMatch[1].replace(',', '.')) * 1_000_000 : null,
  };
}

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

  // Detectar contacto ANTES de llamar a NVIDIA
  const contacto = detectarContacto(ultimoMensaje);
  const tieneContacto = !!(contacto.email || contacto.phone) && !!contacto.nombre;

  // Si tiene contacto, notificar de forma asíncrona sin bloquear
  if (tieneContacto) {
    const contactoStr = contacto.email || contacto.phone || '';
    const nombreStr = contacto.nombre || 'Cliente';
    console.log(`[${requestId}] auto-crm detectado: ${nombreStr} / ${contactoStr}`);
    
    // Fire and forget — no await
    sendCrmLeadNotification({
      nombre: nombreStr,
      contacto: contactoStr,
      presupuesto: contacto.presupuesto || undefined,
      notasCualificacion: ultimoMensaje.slice(0, 300),
      tipoLead: 'Venta',
    }).then((r: any) => {
      if (r.success) {
        return notificarEnrique({
          nombre: nombreStr,
          contacto: contactoStr,
          presupuesto: contacto.presupuesto || undefined,
          tipoLead: 'Venta',
          notasCualificacion: ultimoMensaje.slice(0, 300),
        });
      }
    }).catch((e: any) => console.error('[auto-crm error]', e.message));
  }

  try {
    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...incomingMessages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    let docId: string | null = null;
    let respuestaFinal = '';
    let conversacionGuardada = false;

    // RONDA 1
    const msg1 = await llamarNvidia(messages, apiKey);
    messages.push(msg1);
    if (msg1.content) respuestaFinal = msg1.content;

    if (msg1.tool_calls?.length > 0) {
      const toolResults = await Promise.all(
        msg1.tool_calls.map(async (toolCall: any) => {
          const nombre = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          console.log(`[${requestId}] Tool: ${nombre}`);
          let resultado: any = { success: true };

          if (nombre === 'registrarCliente') {
            resultado = await prepararEntornoCliente(args.nombreCliente, args.tipoLead);
            if (resultado.docId) docId = resultado.docId;
          } else if (nombre === 'buscarPropiedades') {
            resultado = await searchPropertiesInSupabase({ urbanizacion: args.zona, municipioDeducido: args.zona, precioMax: args.precioMax });
          } else if (nombre === 'notificarLeadCRM') {
            resultado = { success: true, message: 'Lead registrado.' }; // ya lo hicimos arriba
          } else if (nombre === 'guardarConversacion' && !conversacionGuardada && args.docId?.length >= 20) {
            conversacionGuardada = true;
            await actualizarHistorial(args.docId, args.mensajeUsuario, args.respuestaAgente);
          }

          return { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(resultado) };
        })
      );
      toolResults.forEach((r: any) => messages.push(r));

      // RONDA 2
      const msg2 = await llamarNvidia(messages, apiKey);
      if (msg2.content) respuestaFinal = msg2.content;

      if (msg2.tool_calls?.length > 0) {
        for (const toolCall of msg2.tool_calls) {
          const nombre = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          if (nombre === 'guardarConversacion' && !conversacionGuardada && args.docId?.length >= 20) {
            conversacionGuardada = true;
            await actualizarHistorial(args.docId, args.mensajeUsuario, args.respuestaAgente).catch(() => {});
          }
        }
      }
    }

    if (docId && respuestaFinal && !conversacionGuardada) {
      actualizarHistorial(docId, ultimoMensaje, respuestaFinal).catch(() => {});
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
