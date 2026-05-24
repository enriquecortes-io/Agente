import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import { prepararEntornoCliente, actualizarHistorial, borrarCarpetasAntiguas } from './tools/driveLogger.js';
import { sendCrmLeadNotification } from './tools/webhookTools.js';
import { SYSTEM_PROMPT } from './agents/realEstateExecutive.js';

const OK   = '✅';
const FAIL = '❌';
const SEP  = '─'.repeat(60);

function log(label: string, result: unknown) {
 const success = (result as any)?.success !== false;
 console.log(`\n${success ? OK : FAIL} ${label}`);
 console.log(JSON.stringify(result, null, 2));
}

function header(title: string) {
 console.log(`\n${SEP}`);
 console.log(`  🧪 ${title.toUpperCase()}`);
 console.log(SEP);
}

async function testSupabase() {
 header('Supabase — Búsqueda de propiedades');
 log('La Zagaleta 5M€', await searchPropertiesInSupabase({ urbanizacion: 'La Zagaleta', municipioDeducido: 'Benahavís', precioMax: 5_000_000 }));
 log('Solo precio 3M€', await searchPropertiesInSupabase({ precioMax: 3_000_000 }));
 log('Sin filtros', await searchPropertiesInSupabase({}));
}

async function testDrive() {
 header('Google Drive — Entorno de cliente');
 try {
   const entorno = await prepararEntornoCliente(`Test ${Date.now()}`, 'Venta');
   log('prepararEntornoCliente', { success: true, ...entorno });
   await actualizarHistorial(entorno.docId, 'Mensaje test', 'Respuesta test');
   log('actualizarHistorial', { success: true });
 } catch (e: any) {
   log('prepararEntornoCliente', { success: false, error: e.message });
 }
}

async function testWebhooks() {
 header('Webhooks — CRM');
 log('sendCrmLeadNotification', await sendCrmLeadNotification({
   nombre: 'Test Investor', contacto: '+34 600 000 000',
   presupuesto: 4_500_000, notasCualificacion: 'Test lead.',
   tipoLead: 'Venta',
 }));
}

async function cleanupDrive() {
 header('Cleanup');
 try {
   await borrarCarpetasAntiguas();
   log('borrarCarpetasAntiguas', { success: true });
 } catch (e: any) {
   log('borrarCarpetasAntiguas', { success: false, error: e.message });
 }
}

// ─── Tool executor ────────────────────────────────────────────────────────────
async function ejecutarTool(nombre: string, args: any): Promise<any> {
 console.log(`  [Tool] ${nombre} →`, JSON.stringify(args));
 switch (nombre) {
   case 'registrarCliente':
     return await prepararEntornoCliente(args.nombreCliente, args.tipoLead);
   case 'guardarConversacion':
     await actualizarHistorial(args.docId, args.mensajeUsuario, args.respuestaAgente);
     return { success: true };
   case 'buscarPropiedades':
     return await searchPropertiesInSupabase({ urbanizacion: args.zona, municipioDeducido: args.zona, precioMax: args.precioMax });
   case 'notificarLeadCRM':
     return await sendCrmLeadNotification(args);
   default:
     return { error: `Tool desconocida: ${nombre}` };
 }
}

// ─── Agente con NVIDIA NIM (OpenAI-compatible API) ───────────────────────────
async function testAgenteDirecto(mensaje = 'Hola, soy Carlos García, busco una villa en La Zagaleta con presupuesto de 5 millones') {
 header('Agente Directo — NVIDIA Nemotron 49B');

 const apiKey = process.env.NVIDIA_API_KEY;
 if (!apiKey) throw new Error('Falta NVIDIA_API_KEY en .env.local');

 console.log(`\n💬 Usuario: "${mensaje}"\n`);

 const tools = [
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
       description: 'Guarda el turno en el historial. SIEMPRE llama esto después de responder, con el texto exacto de tu respuesta.',
       parameters: {
         type: 'object',
         properties: {
           docId: { type: 'string', description: 'ID del doc obtenido al registrar cliente.' },
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

 const messages: any[] = [
   { role: 'system', content: SYSTEM_PROMPT },
   { role: 'user', content: mensaje },
 ];

 let docId: string | null = null;
 let ultimoTextoHarvis = '';

 // Bucle agentico — max 10 iteraciones
 for (let i = 0; i < 10; i++) {
   const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${apiKey}`,
       'Content-Type': 'application/json',
     },
     body: JSON.stringify({
       model: 'nvidia/llama-3.3-nemotron-super-49b-v1',
       messages,
       tools,
       tool_choice: 'auto',
       max_tokens: 1024,
       temperature: 0.7,
     }),
   });

   if (!response.ok) {
     const err = await response.text();
     throw new Error(`NVIDIA API error ${response.status}: ${err}`);
   }

   const data = await response.json();
   const choice = data.choices?.[0];
   const assistantMsg = choice?.message;

   // Añadir respuesta del asistente al historial
   messages.push(assistantMsg);

   // Mostrar texto si lo hay
   if (assistantMsg.content) {
     ultimoTextoHarvis = assistantMsg.content;
     console.log(`\n🤖 Harvis: ${assistantMsg.content}`);
   }

   // Procesar tool calls si las hay
   if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
     for (const toolCall of assistantMsg.tool_calls) {
       const nombre = toolCall.function.name;
       const args = JSON.parse(toolCall.function.arguments);

       const resultado = await ejecutarTool(nombre, args);

       if (nombre === 'registrarCliente' && resultado.docId) {
         docId = resultado.docId;
       }

       // Añadir resultado de la tool al historial
       messages.push({
         role: 'tool',
         tool_call_id: toolCall.id,
         content: JSON.stringify(resultado),
       });
     }
     // Continuar el bucle para que el modelo procese los resultados
     continue;
   }

   // Sin tool calls — guardar log si tenemos docId y terminar
   if (docId && ultimoTextoHarvis) {
     console.log(`\n  [Auto-log] Guardando conversación...`);
     await actualizarHistorial(docId, mensaje, ultimoTextoHarvis);
   }

   break;
 }

 console.log(`\n`);
 log('Agente directo', { success: true, docId });
}

async function main() {
 const arg     = process.argv[2]?.toLowerCase();
 const chatMsg = process.argv[3];

 console.log(`\n${'═'.repeat(60)}`);
 console.log(`  🏠 AGENTE REAL ESTATE — TEST SUITE`);
 console.log(`  ${new Date().toLocaleString('es-ES')}`);
 console.log(`${'═'.repeat(60)}`);

 try {
   if      (arg === 'cleanup')  { await cleanupDrive(); }
   else if (arg === 'supabase') { await testSupabase(); }
   else if (arg === 'drive')    { await testDrive(); }
   else if (arg === 'webhook')  { await testWebhooks(); }
   else if (arg === 'agente')   { await testAgenteDirecto(chatMsg); }
   else {
     await testSupabase();
     await testDrive();
     await testWebhooks();
   }
 } catch (e: any) {
   console.error(`\n${FAIL} Error:`, e.message);
   process.exit(1);
 }

 console.log(`\n${'═'.repeat(60)}`);
 console.log(`  Tests completados.`);
 console.log(`${'═'.repeat(60)}\n`);
}

main();
