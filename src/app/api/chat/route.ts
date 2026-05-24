import { SYSTEM_PROMPT } from '../../../agents/realEstateExecutive.js';
import { searchPropertiesInSupabase } from '../../../tools/supabaseTools.js';
import { prepararEntornoCliente, actualizarHistorial } from '../../../tools/driveLogger.js';
import { sendCrmLeadNotification } from '../../../tools/webhookTools.js';

export const dynamic = 'force-dynamic';

function isAuthorized(req: Request): boolean {
 const secret = process.env.AGENT_API_SECRET;
 if (!secret) return true;
 return req.headers.get('x-agent-key') === secret;
}

// ─── Tool executor ────────────────────────────────────────────────────────────
async function ejecutarTool(nombre: string, args: any): Promise<any> {
 switch (nombre) {
   case 'registrarCliente':
     return await prepararEntornoCliente(args.nombreCliente, args.tipoLead);
   case 'guardarConversacion':
     await actualizarHistorial(args.docId, args.mensajeUsuario, args.respuestaAgente);
     return { success: true };
   case 'buscarPropiedades':
     return await searchPropertiesInSupabase({
       urbanizacion: args.zona,
       municipioDeducido: args.zona,
       precioMax: args.precioMax,
     });
   case 'notificarLeadCRM':
     return await sendCrmLeadNotification(args);
   default:
     return { error: `Tool desconocida: ${nombre}` };
 }
}

// ─── Tools schema ─────────────────────────────────────────────────────────────
const TOOLS = [
 {
   type: 'function',
   function: {
     name: 'registrarCliente',
     description: 'Registra al cliente en Drive. Llama esto en cuanto tengas nombre y tipo de gestión.',
     parameters: {
       type: 'object',
       properties: {
         nombreCliente: { type: 'string', description: 'Nombre completo del cliente.' },
         tipoLead: { type: 'string', enum: ['Venta', 'Captacion', 'Gestion'], description: 'Tipo de gestión.' },
       },
       required: ['nombreCliente', 'tipoLead'],
     },
   },
 },
 {
   type: 'function',
   function: {
     name: 'guardarConversacion',
     description: 'Guarda el turno en el historial. SIEMPRE llama esto después de responder.',
     parameters: {
       type: 'object',
       properties: {
         docId: { type: 'string', description: 'ID exacto del doc obtenido al registrar cliente.' },
         mensajeUsuario: { type: 'string', description: 'Mensaje exacto del cliente.' },
         respuestaAgente: { type: 'string', description: 'Texto exacto de tu respuesta.' },
       },
       required: ['docId', 'mensajeUsuario', 'respuestaAgente'],
     },
   },
 },
 {
   type: 'function',
   function: {
     name: 'buscarPropiedades',
     description: 'Busca propiedades en Supabase por zona y precio.',
     parameters: {
       type: 'object',
       properties: {
         zona: { type: 'string', description: 'Zona en Marbella.' },
         precioMax: { type: 'number', description: 'Presupuesto máximo en euros.' },
       },
     },
   },
 },
 {
   type: 'function',
   function: {
     name: 'notificarLeadCRM',
     description: 'Registra el lead cualificado en el CRM.',
     parameters: {
       type: 'object',
       properties: {
         nombre: { type: 'string' },
         contacto: { type: 'string' },
         presupuesto: { type: 'number' },
         notasCualificacion: { type: 'string' },
         tipoLead: { type: 'string', enum: ['Venta', 'Captacion', 'Gestion'] },
       },
       required: ['nombre', 'contacto', 'notasCualificacion'],
     },
   },
 },
];

// ─── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
 if (!isAuthorized(req)) {
   return new Response(JSON.stringify({ error: 'No autorizado.' }), {
     status: 401,
     headers: { 'Content-Type': 'application/json' },
   });
 }

 let body: any;
 try {
   body = await req.json();
 } catch {
   return new Response(JSON.stringify({ error: 'Body inválido.' }), {
     status: 400,
     headers: { 'Content-Type': 'application/json' },
   });
 }

 const { messages: incomingMessages } = body;
 if (!Array.isArray(incomingMessages) || incomingMessages.length === 0) {
   return new Response(JSON.stringify({ error: 'Falta el campo "messages".' }), {
     status: 400,
     headers: { 'Content-Type': 'application/json' },
   });
 }

 const requestId = crypto.randomUUID().slice(0, 8);
 const apiKey = process.env.NVIDIA_API_KEY;

 if (!apiKey) {
   return new Response(JSON.stringify({ error: 'Falta NVIDIA_API_KEY.' }), {
     status: 500,
     headers: { 'Content-Type': 'application/json' },
   });
 }

 try {
   // Construir mensajes: system + historial del cliente
   const messages: any[] = [
     { role: 'system', content: SYSTEM_PROMPT },
     ...incomingMessages.map((m: any) => ({ role: m.role, content: m.content })),
   ];

   const ultimoMensajeUsuario = incomingMessages[incomingMessages.length - 1]?.content || '';

   let docId: string | null = null;
   let respuestaFinal = '';

   // Bucle agentico — max 10 iteraciones
   for (let i = 0; i < 10; i++) {
     const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${apiKey}`,
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({
         model: 'meta/llama-3.3-70b-instruct',
         messages,
         tools: TOOLS,
         tool_choice: 'auto',
         max_tokens: 1024,
         temperature: 0.7,
       }),
     });

     if (!response.ok) {
       const err = await response.text();
       throw new Error(`NVIDIA API ${response.status}: ${err}`);
     }

     const data = await response.json();
     const assistantMsg = data.choices?.[0]?.message;
     messages.push(assistantMsg);

     if (assistantMsg.content) {
       respuestaFinal = assistantMsg.content;
     }

     // Procesar tool calls
     if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
       for (const toolCall of assistantMsg.tool_calls) {
         const nombre = toolCall.function.name;
         const args = JSON.parse(toolCall.function.arguments);

         console.log(`[${requestId}] Tool: ${nombre}`, args);
         const resultado = await ejecutarTool(nombre, args);

         if (nombre === 'registrarCliente' && resultado.docId) {
           docId = resultado.docId;
         }

         messages.push({
           role: 'tool',
           tool_call_id: toolCall.id,
           content: JSON.stringify(resultado),
         });
       }
       continue;
     }

     // Sin más tool calls — auto-log y salir
     if (docId && respuestaFinal) {
       await actualizarHistorial(docId, ultimoMensajeUsuario, respuestaFinal);
     }
     break;
   }

   return new Response(JSON.stringify({
     success: true,
     message: respuestaFinal,
     docId,
     requestId,
   }), {
     status: 200,
     headers: { 'Content-Type': 'application/json' },
   });

 } catch (error: any) {
   console.error(`[${requestId}] Error:`, error.message);
   return new Response(JSON.stringify({
     success: false,
     error: error.message,
     requestId,
   }), {
     status: 500,
     headers: { 'Content-Type': 'application/json' },
   });
 }
}
