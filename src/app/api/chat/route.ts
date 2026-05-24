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
  { type: 'function', function: { name: 'guardarConversacion', description: 'Guarda el turno. Llama UNA VEZ al final con tu respuesta exacta.', parameters: { type: 'object', properties: { docId: { type: 'string' }, mensajeUsuario: { type: 'string' }, respuestaAgente: { type: 'string' } }, required: ['docId','mensajeUsuario','respuestaAgente'] } } },
];

async function llamarNvidia(messages: any[], apiKey: string) {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'meta/llama-3.3-70b-instruct',
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      max_tokens: 1024,
      temperature: 0.4,
    }),
  });
  if (!res.ok) throw new Error(`NVIDIA ${res.status}: ${await res.text()}`);
  return (await res.json()).choices?.[0]?.message;
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

  try {
    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...incomingMessages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    let docId: string | null = null;
    let respuestaFinal = '';
    let crmNotificado = false;
    let conversacionGuardada = false;

    // RONDA 1: Primera llamada a NVIDIA
    const msg1 = await llamarNvidia(messages, apiKey);
    messages.push(msg1);
    if (msg1.content) respuestaFinal = msg1.content;

    // Procesar tool calls de ronda 1 en paralelo
    if (msg1.tool_calls?.length > 0) {
      const toolPromises = msg1.tool_calls.map(async (toolCall: any) => {
        const nombre = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        console.log(`[${requestId}] Tool: ${nombre}`, JSON.stringify(args));

        let resultado: any;
        if (nombre === 'registrarCliente') {
          resultado = await prepararEntornoCliente(args.nombreCliente, args.tipoLead);
          if (resultado.docId) docId = resultado.docId;
        } else if (nombre === 'buscarPropiedades') {
          resultado = await searchPropertiesInSupabase({ urbanizacion: args.zona, municipioDeducido: args.zona, precioMax: args.precioMax });
        } else if (nombre === 'notificarLeadCRM' && !crmNotificado) {
          crmNotificado = true;
          resultado = await sendCrmLeadNotification(args);
          if (resultado.success) {
            notificarEnrique({ nombre: args.nombre, contacto: args.contacto, presupuesto: args.presupuesto, zona: args.zona, tipoLead: args.tipoLead || 'Venta', notasCualificacion: args.notasCualificacion })
              .catch((e: any) => console.error('[Resend]', e.message));
          }
        } else if (nombre === 'guardarConversacion' && !conversacionGuardada && args.docId?.length >= 20) {
          conversacionGuardada = true;
          await actualizarHistorial(args.docId, args.mensajeUsuario, args.respuestaAgente);
          resultado = { success: true };
        } else {
          resultado = { success: true };
        }

        return { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(resultado) };
      });

      const toolResults = await Promise.all(toolPromises);
      toolResults.forEach(r => messages.push(r));

      // RONDA 2: Segunda llamada con resultados de tools
      const msg2 = await llamarNvidia(messages, apiKey);
      messages.push(msg2);
      if (msg2.content) respuestaFinal = msg2.content;

      // Procesar tool calls de ronda 2 (principalmente guardarConversacion y notificarLeadCRM)
      if (msg2.tool_calls?.length > 0) {
        for (const toolCall of msg2.tool_calls) {
          const nombre = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          console.log(`[${requestId}] Tool R2: ${nombre}`, JSON.stringify(args));

          if (nombre === 'notificarLeadCRM' && !crmNotificado) {
            crmNotificado = true;
            const resultado = await sendCrmLeadNotification(args);
            if (resultado.success) {
              notificarEnrique({ nombre: args.nombre, contacto: args.contacto, presupuesto: args.presupuesto, zona: args.zona, tipoLead: args.tipoLead || 'Venta', notasCualificacion: args.notasCualificacion })
                .catch((e: any) => console.error('[Resend]', e.message));
            }
          } else if (nombre === 'guardarConversacion' && !conversacionGuardada && args.docId?.length >= 20) {
            conversacionGuardada = true;
            await actualizarHistorial(args.docId, args.mensajeUsuario, args.respuestaAgente);
          }
        }
      }
    }

    // Auto-log si no se guardó
    if (docId && respuestaFinal && !conversacionGuardada) {
      actualizarHistorial(docId, ultimoMensaje, respuestaFinal).catch(() => {});
    }

    return new Response(JSON.stringify({ success: true, message: respuestaFinal, docId, requestId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error(`[${requestId}] Error:`, error.message);
    return new Response(JSON.stringify({ success: false, error: error.message, requestId }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
