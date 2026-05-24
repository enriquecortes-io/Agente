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

function detectarContacto(mensaje: string) {
  const emailMatch = mensaje.match(/[\w.-]+@[\w.-]+\.[a-z]{2,}/i);
  const phoneMatch = mensaje.match(/\+?[\d\s\-]{9,}/);
  const nombreMatch = mensaje.match(/(?:soy|me llamo)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ][a-záéíóúñ]+){0,2})/i);
  const presupuestoMatch = mensaje.match(/(\d+(?:[.,]\d+)?)\s*(?:millones?|M€|M\s*eur)/i);
  return {
    email: emailMatch?.[0] || null,
    phone: phoneMatch?.[0]?.trim() || null,
    nombre: nombreMatch?.[1]?.trim() || null,
    presupuesto: presupuestoMatch ? parseFloat(presupuestoMatch[1].replace(',','.')) * 1_000_000 : null,
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

  // Detectar y notificar ANTES — fire and forget
  const contacto = detectarContacto(ultimoMensaje);
  if (contacto.nombre && (contacto.email || contacto.phone)) {
    const nombreStr = contacto.nombre;
    const contactoStr = contacto.email || contacto.phone || '';
    console.log(`[${requestId}] auto-crm: ${nombreStr} / ${contactoStr}`);
    sendCrmLeadNotification({
      nombre: nombreStr, contacto: contactoStr,
      presupuesto: contacto.presupuesto || undefined,
      notasCualificacion: ultimoMensaje.slice(0, 300), tipoLead: 'Venta',
    }).then((r: any) => {
      if (r.success) notificarEnrique({ nombre: nombreStr, contacto: contactoStr, presupuesto: contacto.presupuesto || undefined, tipoLead: 'Venta', notasCualificacion: ultimoMensaje.slice(0, 300) }).catch(() => {});
    }).catch(() => {});
  }

  try {
    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...incomingMessages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    // UNA SOLA llamada a NVIDIA
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
        max_tokens: 800,
        temperature: 0.4,
      }),
    });

    if (!res.ok) throw new Error(`NVIDIA ${res.status}`);
    const data = await res.json();
    const assistantMsg = data.choices?.[0]?.message;
    let respuestaFinal = assistantMsg?.content || '';
    let docId: string | null = null;

    // Procesar tools en paralelo
    if (assistantMsg?.tool_calls?.length > 0) {
      const toolResults = await Promise.all(
        assistantMsg.tool_calls.map(async (toolCall: any) => {
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

      // Construir respuesta con propiedades si las hay
      const propiedades = toolResults.find((r: any) => r.propiedades)?.propiedades || [];
      if (propiedades.length > 0 && !respuestaFinal) {
        respuestaFinal = propiedades.map((p: any) =>
          `**${p.titulo}** — ${p.referencia}\n📍 ${p.municipio} · 🛏 ${p.habitaciones} hab · 💰 €${p.precio?.toLocaleString('es-ES')}\n🔗 ${p.url}`
        ).join('\n\n');
      }

      // Si no hay respuesta de texto, hacer segunda llamada para generarla
        messages.push(assistantMsg);
        assistantMsg.tool_calls.forEach((tc: any, i: number) => {
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(toolResults[i]) });
        });

        const res2 = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'meta/llama-3.3-70b-instruct',
            messages,
            max_tokens: 800,
            temperature: 0.4,
          }),
        });
        if (res2.ok) {
          const data2 = await res2.json();
          respuestaFinal = data2.choices?.[0]?.message?.content || '';
        }
      }

      // Auto-log async
      if (docId) {
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
