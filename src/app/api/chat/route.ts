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
  const presupuestoMatch = mensaje.match(/(\d+(?:[.,]\d+)?)\s*(?:millones?|M€|M\s*eur)/i);
  return {
    email: emailMatch?.[0] || null,
    phone: phoneMatch?.[0]?.trim() || null,
    nombre: nombreMatch?.[1]?.trim() || null,
    presupuesto: presupuestoMatch ? parseFloat(presupuestoMatch[1].replace(',', '.')) * 1_000_000 : null,
  };
}

async function llamarNvidia(messages: any[], apiKey: string, conTools = true) {
  const body: any = {
    model: 'meta/llama-3.3-70b-instruct',
    messages,
    max_tokens: 800,
    temperature: 0.4,
  };
  if (conTools) {
    body.tools = [
      { type: 'function', function: { name: 'registrarCliente', description: 'Registra al cliente. Llama siempre primero.', parameters: { type: 'object', properties: { nombreCliente: { type: 'string' }, tipoLead: { type: 'string', enum: ['Venta','Captacion','Gestion'] } }, required: ['nombreCliente','tipoLead'] } } },
      { type: 'function', function: { name: 'buscarPropiedades', description: 'Busca propiedades para leads Venta.', parameters: { type: 'object', properties: { zona: { type: 'string' }, precioMax: { type: 'number' } } } } },
    ];
    body.tool_choice = 'auto';
  }
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`NVIDIA ${res.status}`);
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

  // Detectar e insertar lead antes de NVIDIA — dispara webhook Supabase
  const contacto = detectarContacto(ultimoMensaje);
  if (contacto.nombre && (contacto.email || contacto.phone)) {
    const nombreStr = contacto.nombre;
    const contactoStr = contacto.email || contacto.phone || '';
    console.log(`[${requestId}] auto-crm: ${nombreStr} / ${contactoStr}`);
    sendCrmLeadNotification({
      nombre: nombreStr, contacto: contactoStr,
      presupuesto: contacto.presupuesto || undefined,
      notasCualificacion: ultimoMensaje.slice(0, 300), tipoLead: 'Venta',
    }).catch(() => {});
  }

  try {
    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...incomingMessages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    // RONDA 1 — con tools
    const msg1 = await llamarNvidia(messages, apiKey, true);
    let respuestaFinal = msg1?.content || '';
    let docId: string | null = null;

    if (msg1?.tool_calls?.length > 0) {
      // Procesar tools en paralelo
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
          }
          return resultado;
        })
      );

      // RONDA 2 — sin tools, solo para generar texto de respuesta
      messages.push(msg1);
      msg1.tool_calls.forEach((tc: any, i: number) => {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(toolResults[i]) });
      });

      const msg2 = await llamarNvidia(messages, apiKey, false);
      respuestaFinal = msg2?.content || '';

      // Auto-log async
      if (docId && respuestaFinal) {
        actualizarHistorial(docId, ultimoMensaje, respuestaFinal).catch(() => {});
      }
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
