import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { searchPropertiesInSupabase, guardarConversacionSupabase, recuperarHistorialCliente } from './tools/supabaseTools.js';
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

function esDocIdValido(docId: string): boolean {
  return typeof docId === 'string' && docId.length >= 20 && !docId.toLowerCase().includes('docid');
}

async function testSupabase() {
  header('Supabase — Búsqueda de propiedades');
  log('La Zagaleta 5M€', await searchPropertiesInSupabase({ urbanizacion: 'La Zagaleta', municipioDeducido: 'Benahavís', precioMax: 5_000_000 }));
  log('Sin filtros', await searchPropertiesInSupabase({}));
}

async function testDrive() {
  header('Google Drive — Entorno de cliente');
  try {
    const entorno = await prepararEntornoCliente(`Test ${Date.now()}`, 'Venta');
    log('prepararEntornoCliente', { success: true, ...entorno });
  } catch (e: any) {
    log('prepararEntornoCliente', { success: false, error: e.message });
  }
}

async function testMemoria() {
  header('Memoria — Recuperar historial de Carlos García');
  log('recuperarHistorialCliente', await recuperarHistorialCliente('Carlos García', 5));
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

async function ejecutarTool(nombre: string, args: any, clienteNombre?: string): Promise<any> {
  console.log(`  [Tool] ${nombre} →`, JSON.stringify(args));

  switch (nombre) {
    case 'registrarCliente':
      return await prepararEntornoCliente(args.nombreCliente, args.tipoLead);

    case 'guardarConversacion':
      if (!esDocIdValido(args.docId)) {
        console.log(`  [⚠️ BLOQUEADO] docId inválido: "${args.docId}" — necesita registrarCliente primero`);
        return { success: false, error: 'docId inválido. Llama registrarCliente primero para obtener el docId real.' };
      }
      await actualizarHistorial(args.docId, args.mensajeUsuario, args.respuestaAgente);
      await guardarConversacionSupabase({
        clienteNombre: args.clienteNombre || clienteNombre || 'Desconocido',
        tipoLead: args.tipoLead,
        mensajeUsuario: args.mensajeUsuario,
        respuestaAgente: args.respuestaAgente,
      });
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

async function testAgenteDirecto(mensaje = 'Hola, soy Carlos García, busco una villa en La Zagaleta con presupuesto de 5 millones') {
  header('Agente Directo — NVIDIA Nemotron 49B con memoria');

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error('Falta NVIDIA_API_KEY en .env.local');

  console.log(`\n💬 Usuario: "${mensaje}"\n`);

  const matchNombre = mensaje.match(/(?:soy|me llamo|habla|es)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,2})(?:\s+de\s+nuevo|\s+otra\s+vez|,|\.|$)/i);
  const nombreDetectado = matchNombre?.[1];

  const historialMensajes: any[] = [];
  if (nombreDetectado) {
    const { turnos } = await recuperarHistorialCliente(nombreDetectado, 5);
    const turnosArr = (turnos as any[]) || [];
    if (turnosArr.length > 0) {
      console.log(`  🧠 ${turnosArr.length} turnos previos de ${nombreDetectado} cargados`);
      for (const t of turnosArr) {
        historialMensajes.push({ role: 'user', content: t.mensaje_usuario });
        historialMensajes.push({ role: 'assistant', content: t.respuesta_agente });
      }
    } else {
      console.log(`  🧠 Sin historial previo para ${nombreDetectado}`);
    }
  }

  const tools = [
    { type: 'function', function: { name: 'registrarCliente', description: 'Registra al cliente en Drive. Llama esto SIEMPRE al inicio de cada conversación para obtener el docId real.', parameters: { type: 'object', properties: { nombreCliente: { type: 'string' }, tipoLead: { type: 'string', enum: ['Venta','Captacion','Gestion'] } }, required: ['nombreCliente','tipoLead'] } } },
    { type: 'function', function: { name: 'guardarConversacion', description: 'Guarda el turno. Requiere el docId real de registrarCliente.', parameters: { type: 'object', properties: { docId: { type: 'string' }, clienteNombre: { type: 'string' }, tipoLead: { type: 'string' }, mensajeUsuario: { type: 'string' }, respuestaAgente: { type: 'string' } }, required: ['docId','mensajeUsuario','respuestaAgente'] } } },
    { type: 'function', function: { name: 'buscarPropiedades', description: 'Busca propiedades en Supabase.', parameters: { type: 'object', properties: { zona: { type: 'string' }, precioMax: { type: 'number' } } } } },
    { type: 'function', function: { name: 'notificarLeadCRM', description: 'Registra lead en CRM.', parameters: { type: 'object', properties: { nombre: { type: 'string' }, contacto: { type: 'string' }, presupuesto: { type: 'number' }, notasCualificacion: { type: 'string' }, tipoLead: { type: 'string' } }, required: ['nombre','contacto','notasCualificacion'] } } },
  ];

  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...historialMensajes,
    { role: 'user', content: mensaje },
  ];

  let docId: string | null = null;
  let ultimoTextoHarvis = '';

  for (let i = 0; i < 10; i++) {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nvidia/llama-3.3-nemotron-super-49b-v1',
        messages, tools, tool_choice: 'auto',
        max_tokens: 1500, temperature: 0.4,
      }),
    });

    if (!response.ok) throw new Error(`NVIDIA ${response.status}: ${await response.text()}`);

    const data = await response.json();
    const assistantMsg = data.choices?.[0]?.message;
    messages.push(assistantMsg);

    if (assistantMsg.content) {
      ultimoTextoHarvis = assistantMsg.content;
      console.log(`\n🤖 Harvis: ${assistantMsg.content}`);
    }

    if (assistantMsg.tool_calls?.length > 0) {
      for (const toolCall of assistantMsg.tool_calls) {
        const nombre = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        const resultado = await ejecutarTool(nombre, args, nombreDetectado);
        if (nombre === 'registrarCliente' && resultado.docId) docId = resultado.docId;
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(resultado) });
      }
      continue;
    }

    if (docId && ultimoTextoHarvis) {
      console.log(`\n  [Auto-log] Drive + Supabase`);
      await actualizarHistorial(docId, mensaje, ultimoTextoHarvis);
      if (nombreDetectado) {
        await guardarConversacionSupabase({
          clienteNombre: nombreDetectado,
          mensajeUsuario: mensaje,
          respuestaAgente: ultimoTextoHarvis,
        });
      }
    }
    break;
  }

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
    else if (arg === 'memoria')  { await testMemoria(); }
    else if (arg === 'agente')   { await testAgenteDirecto(chatMsg); }
    else {
      await testSupabase();
      await testDrive();
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
