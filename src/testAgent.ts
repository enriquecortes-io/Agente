import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import { getOrCreateClientFolder, appendToLogFile } from './tools/driveLogger.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
const MODELO = 'meta/llama-3.1-8b-instruct';

type Mensaje = { role: string; content: string };
let historialChat: Mensaje[] = [];
let carpetaActivaDrive: any = null;

async function llamarNvidiaPuro(systemPrompt: string, mensajesUsuario: Mensaje[], temperatura: number) {
  const mensajes = [ { role: 'system', content: systemPrompt }, ...mensajesUsuario ];

  const respuesta = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${NVIDIA_API_KEY}`
    },
    body: JSON.stringify({ model: MODELO, messages: mensajes, temperature: temperatura, max_tokens: 1024 })
  });

  if (!respuesta.ok) {
    const errorBody = await respuesta.text();
    throw new Error(`HTTP ${respuesta.status} - ${errorBody}`);
  }
  const datos = await respuesta.json();
  return datos.choices[0].message.content;
}

function obtenerFechaHora() {
  return new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
}

async function hablarConHarvis(mensajeCliente: string) {
  console.log(`\n╔═════════════════════════════════════════════════════════════════════════`);
  console.log(`║ 👤 CLIENTE: "${mensajeCliente}"`);
  console.log(`╚═════════════════════════════════════════════════════════════════════════`);

  historialChat.push({ role: 'user', content: mensajeCliente });

  try {
    // --- FASE 1: PENSAR (Context Boxing para que no alucine) ---
    const promptExtractor = `
    Eres un sistema de backend puro. Tu ÚNICA salida debe ser un objeto JSON válido. NO respondas como humano.
    Reglas: Deduce municipios de España (Zagaleta=Benahavis).
    Estructura OBLIGATORIA:
    {
      "requiereBuscarPropiedades": boolean,
      "parametrosSupabase": { "urbanizaciones": ["string"], "municipiosDeducidos": ["string"], "presupuestoMaximoEuros": number },
      "requiereCrearCarpetaDrive": boolean,
      "parametrosDrive": { "nombreCliente": "string", "tipoInteraccion": "string" }
    }
    `;

    // Metemos todo el historial en una caja de texto para aislar a la IA
    const textoHistorial = historialChat.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    const mensajeEnCaja: Mensaje[] = [{ 
      role: 'user', 
      content: `Extrae el JSON basándote en esta conversación:\n\n${textoHistorial}` 
    }];

    const respuestaCruda = await llamarNvidiaPuro(promptExtractor, mensajeEnCaja, 0);
    
    let intencion;
    try {
      const match = respuestaCruda.match(/\{[\s\S]*\}/);
      const jsonLimpio = match ? match[0] : respuestaCruda;
      intencion = JSON.parse(jsonLimpio);
    } catch (e: any) {
      console.error(`    [❌ ERROR JSON] El modelo no devolvió JSON puro. Respuesta del modelo:\n`, respuestaCruda);
      return;
    }

    let contextoSupabase = null;

    if (intencion.requiereBuscarPropiedades && intencion.parametrosSupabase) {
      const p = intencion.parametrosSupabase;
      console.log(`    [⚙️ SISTEMA] Buscando DB: ${p.municipiosDeducidos?.join(',')} hasta ${p.presupuestoMaximoEuros}€`);
      contextoSupabase = await searchPropertiesInSupabase({
        urbanizacion: p.urbanizaciones?.join(','),
        municipioDeducido: p.municipiosDeducidos?.join(','),
        precioMax: p.presupuestoMaximoEuros
      });
    }

    if (intencion.requiereCrearCarpetaDrive && intencion.parametrosDrive) {
      const nombreC = intencion.parametrosDrive.nombreCliente;
      if (!carpetaActivaDrive || carpetaActivaDrive.nombre !== nombreC) {
        carpetaActivaDrive = await getOrCreateClientFolder(nombreC);
        if(carpetaActivaDrive) carpetaActivaDrive.nombre = nombreC;
      }
    }

    // --- FASE 3: RESPONDER (Aquí sí le pasamos el historial normal) ---
    const promptDeVenta = `
    Eres Harvis, broker inmobiliario de superlujo. 
    DB: ${JSON.stringify(contextoSupabase)}
    Carpeta: ${JSON.stringify(carpetaActivaDrive)}
    REGLAS:
    1. Si 'tipo_coincidencia' es 'exacto', cita referencia.
    2. Si hay carpeta, confirma que la documentación está lista en Drive.
    Responde SIEMPRE conciso y elegante.
    `;

    const respuestaFinal = await llamarNvidiaPuro(promptDeVenta, historialChat, 0.7);

    console.log(`\n🤖 AGENTE HARVIS:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(respuestaFinal);
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);

    historialChat.push({ role: 'assistant', content: respuestaFinal });

    // --- FASE 4: GUARDAR EN EL LOG HISTÓRICO ---
    if (carpetaActivaDrive && carpetaActivaDrive.id) {
      const timeStamp = obtenerFechaHora();
      const logEntry = `[${timeStamp}]\n👤 CLIENTE: ${mensajeCliente}\n🤖 HARVIS: ${respuestaFinal}\n---------------------------------------------------------`;
      
      await appendToLogFile(carpetaActivaDrive.id, logEntry);
    }

  } catch (error: any) {
    console.error('❌ Error Salvaje:', error.message || error);
  }
}

async function iniciarSimulador() {
  await hablarConHarvis("Hi! I need a villa in La Zagaleta, my budget is around 6M euros. What do you have?");
  await new Promise(r => setTimeout(r, 2000));
  await hablarConHarvis("Great! I am Charles Vance. Please prepare the NDA so we can move forward.");
  await new Promise(r => setTimeout(r, 2000));
  await hablarConHarvis("Could you add a clause in the NDA for my associates?");
}

iniciarSimulador();
