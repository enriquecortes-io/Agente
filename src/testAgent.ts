import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import { createClientFolder } from './tools/googleDriveTools.js';
import { syncLogToDrive } from './tools/chatLogger.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
const MODELO = 'meta/llama-3.1-8b-instruct';

// 🔥 Añadimos 'fecha' a la interfaz del mensaje
type Mensaje = { role: string; content: string; fecha?: string };
let historialChat: Mensaje[] = [];
let carpetaActivaDrive: any = null;

async function llamarNvidiaPuro(systemPrompt: string, mensajesUsuario: Mensaje[], temperatura: number) {
  const mensajes = [
    { role: 'system', content: systemPrompt },
    // Mapeamos para quitar la fecha antes de enviarlo a la IA, ya que la API no lo acepta
    ...mensajesUsuario.map(m => ({ role: m.role, content: m.content }))
  ];

  const respuesta = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${NVIDIA_API_KEY}`
    },
    body: JSON.stringify({
      model: MODELO,
      messages: mensajes,
      temperature: temperatura,
      max_tokens: 1024
    })
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

  // Guardamos el mensaje del usuario con la fecha y hora exacta
  historialChat.push({ role: 'user', content: mensajeCliente, fecha: obtenerFechaHora() });

  try {
    const promptExtractor = `
    Eres un analizador de datos. Tu ÚNICA salida debe ser un objeto JSON válido, sin texto adicional.
    Reglas: Deduce municipios de España (Zagaleta=Benahavis). Quédate con el presupuesto más alto en números puros.
    
    Estructura OBLIGATORIA:
    {
      "requiereBuscarPropiedades": boolean,
      "parametrosSupabase": {
        "urbanizaciones": ["string"],
        "municipiosDeducidos": ["string"],
        "presupuestoMaximoEuros": number
      },
      "requiereCrearCarpetaDrive": boolean,
      "parametrosDrive": {
        "nombreCliente": "string",
        "tipoInteraccion": "string"
      }
    }
    `;

    const respuestaCruda = await llamarNvidiaPuro(promptExtractor, historialChat, 0);
    const jsonLimpio = respuestaCruda.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let intencion;
    try {
      intencion = JSON.parse(jsonLimpio);
    } catch (parseError) {
      console.error("❌ La IA no devolvió un JSON válido:", jsonLimpio);
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

    if (intencion.requiereCrearCarpetaDrive && intencion.parametrosDrive && !carpetaActivaDrive) {
      const d = intencion.parametrosDrive;
      console.log(`    [⚙️ SISTEMA] Creando nueva carpeta Drive para: ${d.nombreCliente}`);
      carpetaActivaDrive = await createClientFolder(d.nombreCliente, d.tipoInteraccion);
    }

    const promptDeVenta = `
    Eres Harvis, broker inmobiliario de superlujo. 
    Resultado de la DB: ${JSON.stringify(contextoSupabase)}
    Carpeta Cliente (si existe): ${JSON.stringify(carpetaActivaDrive)}

    REGLAS:
    1. Si 'tipo_coincidencia' es 'exacto', véndelo con entusiasmo y cita la referencia.
    2. Si es 'precio_aproximado', ofrece alternativas similares exclusivas.
    3. Si hay carpeta de Drive, infórmale de que la documentación/NDA está lista.
    Responde SIEMPRE de forma concisa y elegante en el idioma del usuario.
    `;

    const respuestaFinal = await llamarNvidiaPuro(promptDeVenta, historialChat, 0.7);

    console.log(`\n🤖 AGENTE HARVIS:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(respuestaFinal);
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);

    // Guardamos la respuesta de Harvis con la fecha y hora exacta
    historialChat.push({ role: 'assistant', content: respuestaFinal, fecha: obtenerFechaHora() });

    // 🔥 EL MOMENTO DE LA VERDAD: Guardado real en Drive
    if (carpetaActivaDrive && carpetaActivaDrive.id) {
      console.log(`    [⚙️ SISTEMA] Sincronizando log en Google Drive...`);
      
      const transcripcionLegible = historialChat.map(m => 
        `[${m.fecha}] ${m.role === 'user' ? '👤 CLIENTE' : '🤖 HARVIS'}:\n${m.content}`
      ).join('\n\n---------------------------------------------------\n\n');
      
      await syncLogToDrive(carpetaActivaDrive.id, transcripcionLegible);
    }

  } catch (error: any) {
    console.error('❌ Error Salvaje:', error.message || error);
  }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function iniciarSimulador() {
  await hablarConHarvis("Hi! I need a villa in La Zagaleta, my budget is around 6M euros. What do you have?");
  await delay(3000);
  await hablarConHarvis("Great! I am Charles Vance. Please prepare the NDA so we can move forward.");
  await delay(3000);
  await hablarConHarvis("Could you add a clause in the NDA for my associates?");
}

iniciarSimulador();
