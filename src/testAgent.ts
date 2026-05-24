/**
 * testAgent.ts — Suite de pruebas para el agente de élite
 *
 * Uso:
 *   npx tsx src/testAgent.ts                    → todos los tests
 *   npx tsx src/testAgent.ts supabase           → solo Supabase
 *   npx tsx src/testAgent.ts drive              → solo Drive
 *   npx tsx src/testAgent.ts webhook            → solo Webhooks
 *   npx tsx src/testAgent.ts chat               → solo endpoint /api/chat
 *   npx tsx src/testAgent.ts chat "tu pregunta" → chat con mensaje personalizado
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import { prepararEntornoCliente, actualizarHistorial, syncLogToDrive } from './tools/driveLogger.js';
import { sendCrmLeadNotification, triggerCmsPropertyPublish } from './tools/webhookTools.js';

const OK   = '✅';
const FAIL = '❌';
const WARN = '⚠️ ';
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

  log('Búsqueda exacta (La Zagaleta, 5M€)', await searchPropertiesInSupabase({
    urbanizacion: 'La Zagaleta',
    municipioDeducido: 'Benahavís',
    precioMax: 5_000_000,
  }));

  log('Búsqueda sin zona (solo precio 3M€)', await searchPropertiesInSupabase({
    precioMax: 3_000_000,
  }));

  log('Búsqueda con precio muy bajo (fallback +20%)', await searchPropertiesInSupabase({
    urbanizacion: 'Sierra Blanca',
    precioMax: 100_000,
  }));

  log('Búsqueda sin filtros (inventario general)', await searchPropertiesInSupabase({}));
}

async function testDrive() {
  header('Google Drive — Entorno de cliente');

  const nombre = `Test Cliente ${Date.now()}`;
  console.log(`\n${WARN} Creando entorno para: ${nombre}`);

  let folderId: string | undefined;
  let docId: string | undefined;

  if (arg === 'cleanup') { await borrarCarpetasAntiguas(); return; }

  try {
    const entorno = await prepararEntornoCliente(nombre, 'Venta');
    folderId = entorno.folderId;
    docId = entorno.docId;
    log('prepararEntornoCliente', { success: true, folderId, docId });
  } catch (e: any) {
    log('prepararEntornoCliente', { success: false, error: e.message });
    return;
  }

  if (docId) {
    if (arg === 'cleanup') { await borrarCarpetasAntiguas(); return; }

  try {
      await actualizarHistorial(docId, `[TEST ${new Date().toISOString()}]\nUsuario: Hola\nAgente: Encantado\n`);
      log('actualizarHistorial', { success: true, docId });
    } catch (e: any) {
      log('actualizarHistorial', { success: false, error: e.message });
    }
  }

  if (folderId) {
    if (arg === 'cleanup') { await borrarCarpetasAntiguas(); return; }

  try {
      await syncLogToDrive(folderId, `Log de prueba — ${new Date().toISOString()}`);
      log('syncLogToDrive', { success: true, folderId });
    } catch (e: any) {
      log('syncLogToDrive', { success: false, error: e.message });
    }
  }
}

async function testWebhooks() {
  header('Webhooks — CRM y CMS');

  log('sendCrmLeadNotification', await sendCrmLeadNotification({
    nombre: 'Test Investor',
    contacto: '+34 600 000 000',
    presupuesto: 4_500_000,
    estiloBuscado: 'Minimalista con vistas al mar',
    notasCualificacion: 'Muy cualificado. Timeline: 3 meses.',
  }));

  log('triggerCmsPropertyPublish', await triggerCmsPropertyPublish({
    titulo: 'Villa Silencio — La Zagaleta',
    ubicacion: 'La Zagaleta, Benahavís, Marbella',
    precio: 8_900_000,
    copywritingEmocional: 'Donde la piedra natural y el silencio se convierten en el verdadero lujo.',
    tagsLifestyle: ['privacidad', 'vistas-al-mar', 'off-market'],
  }));
}

async function testChat(mensaje = '¿Qué propiedades tienes en La Zagaleta por menos de 5 millones?') {
  header('Chat endpoint — /api/chat');

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const apiKey  = process.env.AGENT_API_SECRET || '';

  console.log(`\n📡 POST ${baseUrl}/api/chat`);
  console.log(`💬 "${mensaje}"\n`);

  if (arg === 'cleanup') { await borrarCarpetasAntiguas(); return; }

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-agent-key': apiKey } : {}),
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: mensaje }],
      }),
    });

    console.log(`Status: ${res.status} ${res.statusText}`);

    if (!res.ok) {
      log('Chat endpoint', { success: false, status: res.status, body: await res.text() });
      return;
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    if (reader) {
      console.log('--- STREAM ---');
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        process.stdout.write(chunk);
        fullResponse += chunk;
      }
      console.log('\n--- FIN ---');
    }

    log('Chat endpoint', { success: true, streamLength: fullResponse.length });

  } catch (e: any) {
    log('Chat endpoint', { success: false, error: e.message });
  }
}

async function testAuth() {
  header('Auth — Rechazo con clave incorrecta');

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  if (arg === 'cleanup') { await borrarCarpetasAntiguas(); return; }

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-agent-key': 'clave-incorrecta' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] }),
    });

    if (res.status === 401) {
      log('Rechazo 401', { success: true, status: 401 });
    } else {
      log('Rechazo 401', { success: false, message: `Esperaba 401, recibí ${res.status}` });
    }
  } catch (e: any) {
    console.log(`\n${WARN} Servidor no disponible — ¿está corriendo Next.js?`);
  }
}

async function main() {
  const arg    = process.argv[2]?.toLowerCase();
  const chatMsg = process.argv[3];

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  🏠 AGENTE REAL ESTATE — TEST SUITE`);
  console.log(`  ${new Date().toLocaleString('es-ES')}`);
  console.log(`${'═'.repeat(60)}`);

  if (arg === 'cleanup') { await borrarCarpetasAntiguas(); return; }

  try {
    if (!arg || arg === 'supabase') await testSupabase();
    if (!arg || arg === 'drive')    await testDrive();
    if (!arg || arg === 'webhook')  await testWebhooks();
    if (!arg || arg === 'chat')     await testChat(chatMsg);
    if (!arg || arg === 'auth')     await testAuth();
  } catch (e: any) {
    console.error(`\n${FAIL} Error no capturado:`, e.message);
    process.exit(1);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Tests completados.`);
  console.log(`${'═'.repeat(60)}\n`);
}

main();
