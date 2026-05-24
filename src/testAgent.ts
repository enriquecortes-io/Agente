import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { GoogleGenerativeAI, Tool, FunctionCallingMode } from '@google/generative-ai';
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

async function testAgenteDirecto(mensaje = 'Hola, soy Carlos García, busco una villa en La Zagaleta con presupuesto de 5 millones') {
  header('Agente Directo — Gemini con Function Calling');

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error('Falta GOOGLE_GENERATIVE_AI_API_KEY en .env.local');

  const genAI = new GoogleGenerativeAI(apiKey);

  const tools: Tool[] = [{
    functionDeclarations: [
      {
        name: 'registrarCliente',
        description: 'Registra al cliente en Drive. Llama esto en cuanto tengas nombre y tipo de gestión.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            nombreCliente: { type: 'STRING' as any, description: 'Nombre completo del cliente.' },
            tipoLead: { type: 'STRING' as any, description: 'Venta, Captacion o Gestion.' },
          },
          required: ['nombreCliente', 'tipoLead'],
        },
      },
      {
        name: 'guardarConversacion',
        description: 'Guarda el turno en el historial. SIEMPRE llama esto después de responder al cliente, incluyendo el texto exacto de tu respuesta en respuestaAgente.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            docId: { type: 'STRING' as any, description: 'ID del doc obtenido al registrar cliente.' },
            mensajeUsuario: { type: 'STRING' as any, description: 'Mensaje exacto del cliente.' },
            respuestaAgente: { type: 'STRING' as any, description: 'Texto exacto de la respuesta de Harvis.' },
          },
          required: ['docId', 'mensajeUsuario', 'respuestaAgente'],
        },
      },
      {
        name: 'buscarPropiedades',
        description: 'Busca propiedades en Supabase por zona y precio.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            zona: { type: 'STRING' as any, description: 'Zona en Marbella.' },
            precioMax: { type: 'NUMBER' as any, description: 'Presupuesto máximo en euros.' },
          },
        },
      },
      {
        name: 'notificarLeadCRM',
        description: 'Registra el lead cualificado en el CRM.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            nombre: { type: 'STRING' as any },
            contacto: { type: 'STRING' as any },
            presupuesto: { type: 'NUMBER' as any },
            notasCualificacion: { type: 'STRING' as any },
            tipoLead: { type: 'STRING' as any },
          },
          required: ['nombre', 'contacto', 'notasCualificacion'],
        },
      },
    ],
  }];

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
    tools,
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
  });

  const chat = model.startChat({ history: [] });

  console.log(`\n💬 Usuario: "${mensaje}"\n`);

  let inputActual: any = mensaje;
  let docId: string | null = null;
  let ultimoTextoHarvis = '';

  for (let i = 0; i < 10; i++) {
    const result = await chat.sendMessage(inputActual);
    const response = result.response;
    const parts = response.candidates?.[0]?.content?.parts ?? [];

    const toolResults = [];
    let textoEsteRound = '';

    for (const part of parts) {
      if (part.text) {
        textoEsteRound += part.text;
      }
      if ((part as any).functionCall) {
        const { name, args } = (part as any).functionCall;

        // Si es guardarConversacion y no tiene respuestaAgente, inyectamos el texto actual
        if (name === 'guardarConversacion' && !args.respuestaAgente && ultimoTextoHarvis) {
          args.respuestaAgente = ultimoTextoHarvis;
        }

        const toolResult = await ejecutarTool(name, args);
        if (name === 'registrarCliente' && toolResult.docId) {
          docId = toolResult.docId;
        }
        toolResults.push({
          functionResponse: { name, response: toolResult },
        });
      }
    }

    if (textoEsteRound) {
      ultimoTextoHarvis = textoEsteRound;
      console.log(`\n🤖 Harvis: ${textoEsteRound}`);
    }

    if (toolResults.length > 0) {
      inputActual = toolResults;
      continue;
    }

    // Sin más tool calls — guardamos la conversación si tenemos docId
    if (docId && ultimoTextoHarvis) {
      console.log(`\n  [Auto-log] Guardando conversación en doc...`);
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
