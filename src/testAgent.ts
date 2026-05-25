import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { searchPropertiesInSupabase, guardarConversacionSupabase, recuperarHistorialCliente } from './tools/supabaseTools.js';
import { prepararEntornoCliente, actualizarHistorial, borrarCarpetasAntiguas } from './tools/driveLogger.js';
import { sendCrmLeadNotification } from './tools/webhookTools.js';
import { agendarVisita } from './tools/calendarTools.js';
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

async function testAgenteDirecto(mensaje = 'Hola, soy Carlos García, busco una villa en La Zagaleta con presupuesto de 5 millones') {
  header('Agente Directo — NVIDIA con memoria');

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error('Falta NVIDIA_API_KEY en .env.local');

  console.log(`\n💬 Usuario: "${mensaje}"\n`);

  // Detectar nombre
  const matchNombre = mensaje.match(/(?:soy|me llamo|habla|es)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,2})(?:\s+de\s+nuevo|\s+otra\s+vez|,|\.|$)/i);
  const nombreDetectado = matchNombre?.[1];

  // Recuperar historial
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
    { type: 'function', function: { name: 'registrarCliente', description: 'Registra al cliente en Drive. Llama esto SIEMPRE al inicio.', parameters: { type: 'object', properties: { nombreCliente: { type: 'string' }, tipoLead: { type: 'string', enum: ['Venta','Captacion','Gestion'] } }, required: ['nombreCliente','tipoLead'] } } },
    { type: 'function', function: { name: 'guardarConversacion', description: 'Guarda el turno. Llama esto UNA SOLA VEZ tras responder al cliente.', parameters: { type: 'object', properties: { docId: { type: 'string' }, clienteNombre: { type: 'string' }, tipoLead: { type: 'string' }, mensajeUsuario: { type: 'string' }, respuestaAgente: { type: 'string' } }, required: ['docId','mensajeUsuario','respuestaAgente'] } } },
    { type: 'function', function: { name: 'buscarPropiedades', description: 'Busca propiedades. Solo para leads de Venta.', parameters: { type: 'object', properties: { zona: { type: 'string' }, precioMax: { type: 'number' } } } } },
    { type: 'function', function: { name: 'agendarVisita', description: 'Agenda una visita privada en Google Calendar y envía email de confirmación al cliente con archivo .ics.', parameters: { type: 'object', properties: { nombreCliente: { type: 'string' }, emailCliente: { type: 'string' }, propiedadTitulo: { type: 'string' }, propiedadUrl: { type: 'string' }, fecha: { type: 'string', description: 'Formato YYYY-MM-DD' }, hora: { type: 'string', description: 'Formato HH:MM' }, notas: { type: 'string' } }, required: ['nombreCliente','propiedadTitulo','fecha','hora'] } } },
    { type: 'function', function: { name: 'notificarLeadCRM', description: 'Registra lead en CRM. Llama esto UNA SOLA VEZ cuando tengas nombre + contacto + presupuesto.', parameters: { type: 'object', properties: { nombre: { type: 'string' }, contacto: { type: 'string' }, presupuesto: { type: 'number' }, notasCualificacion: { type: 'string' }, tipoLead: { type: 'string' } }, required: ['nombre','contacto','notasCualificacion'] } } },
  ];

  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...historialMensajes,
    { role: 'user', content: mensaje },
  ];

  let docId: string | null = null;
  let ultimoTextoHarvis = '';
  let crmNotificado = false;
  let conversacionGuardada = false;

  for (let i = 0; i < 10; i++) {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'meta/llama-3.3-70b-instruct',
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
        console.log(`  [Tool] ${nombre} →`, JSON.stringify(args));

        let resultado: any;

        if (nombre === 'registrarCliente') {
          resultado = await prepararEntornoCliente(args.nombreCliente, args.tipoLead);
          if (resultado.docId) docId = resultado.docId;

        } else if (nombre === 'guardarConversacion') {
          if (conversacionGuardada) {
            console.log(`  [⚠️ SKIP] guardarConversacion — ya ejecutado`);
            resultado = { success: true };
          } else if (!esDocIdValido(args.docId)) {
            console.log(`  [⚠️ BLOQUEADO] docId inválido: "${args.docId}"`);
            resultado = { success: false, error: 'docId inválido. Usa el docId de registrarCliente.' };
          } else {
            await actualizarHistorial(args.docId, args.mensajeUsuario, args.respuestaAgente);
            await guardarConversacionSupabase({
              clienteNombre: args.clienteNombre || nombreDetectado || 'Desconocido',
              tipoLead: args.tipoLead,
              mensajeUsuario: args.mensajeUsuario,
              respuestaAgente: args.respuestaAgente,
            });
            conversacionGuardada = true;
            resultado = { success: true };
          }

        } else if (nombre === 'agendarVisita') {
          resultado = await agendarVisita(args);
        } else if (nombre === 'buscarPropiedades') {
          resultado = await searchPropertiesInSupabase({ urbanizacion: args.zona, municipioDeducido: args.zona, precioMax: args.precioMax });

        } else if (nombre === 'notificarLeadCRM') {
          if (crmNotificado) {
            console.log(`  [⚠️ SKIP] notificarLeadCRM — ya ejecutado`);
            resultado = { success: true };
          } else {
            resultado = await sendCrmLeadNotification(args);
            crmNotificado = true;
          }

        } else {
          resultado = { error: `Tool desconocida: ${nombre}` };
        }

        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(resultado) });
      }
      continue;
    }

    // Auto-log final si no se guardó
    if (docId && ultimoTextoHarvis && !conversacionGuardada) {
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
    else if (arg === 'calendar')  { await testCalendar(); }
    else if (arg === 'nda')       { await testNDA(); }
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

async function testCalendar() {
  header('Google Calendar — Agendar visita');
  const { agendarVisita } = await import('./tools/calendarTools.js');
  log('agendarVisita', await agendarVisita({
    nombreCliente: 'James Wilson',
    emailCliente: 'enriquecortesgomez@gmail.com',
    propiedadTitulo: 'Villa Golden Mile',
    propiedadUrl: 'https://mdlm-xi.vercel.app/es/propiedades/villa-golden-mile',
    fecha: '2026-06-10',
    hora: '11:00',
    notas: 'Cliente relocalización desde Londres. Presupuesto 8M.',
  }));
}

async function testNDA() {
  header('NDA — Generar y enviar PDF');
  const { generarYEnviarNDA } = await import('./tools/ndaTools.js');
  log('generarYEnviarNDA', await generarYEnviarNDA({
    nombreCliente: 'James Wilson',
    emailCliente: 'enriquecortesgomez@gmail.com',
    propiedadTitulo: 'Villa Golden Mile',
    propiedadReferencia: 'VIL-110',
  }));
}
