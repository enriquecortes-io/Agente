import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import { createClientFolder } from './tools/googleDriveTools.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
const MODELO = 'meta/llama-3.1-8b-instruct';

type Mensaje = { role: string; content: string };
let historialChat: Mensaje[] = [];

// 🪓 EL MACHETAZO FINAL: Fetch puro sin librerías de Vercel
async function llamarNvidiaPuro(systemPrompt: string, mensajesUsuario: Mensaje[], temperatura: number) {
  const mensajes = [
    { role: 'system', content: systemPrompt },
    ...mensajesUsuario
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

async function hablarConHarvis(mensajeCliente: string) {
  console.log(`\n╔═════════════════════════════════════════════════════════════════════════`);
  console.log(`║ 👤 CLIENTE: "${mensajeCliente}"`);
  console.log(`╚═════════════════════════════════════════════════════════════════════════`);

  historialChat.push({ role: 'user', content: mensajeCliente });

  try {
    // --- FASE 1: PENSAR (Fetch Puro) ---
    const promptExtractor = `
    Eres un analizador de datos. Tu ÚNICA salida debe ser un objeto JSON válido, sin texto adicional, sin formato markdown, SOLO el JSON.
    Reglas: Deduce municipios de España (Zagaleta=Benahavis, Sotogrande=San Roque). Quédate con el presupuesto más alto en números puros.
    
    Estructura OBLIGATORIA del JSON:
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
    let contextoDrive = null;

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
      const d = intencion.parametrosDrive;
      console.log(`    [⚙️ SISTEMA] Creando carpeta Drive para: ${d.nombreCliente}`);
      contextoDrive = await createClientFolder(d.nombreCliente, d.tipoInteraccion);
    }

    // --- FASE 3: RESPONDER (Fetch Puro) ---
    const promptDeVenta = `
    Eres Harvis, broker inmobiliario de superlujo. 
    Resultado de la base de datos: ${JSON.stringify(contextoSupabase)}
    Resultado Drive: ${JSON.stringify(contextoDrive)}

    REGLAS:
    1. Si 'tipo_coincidencia' es 'exacto', véndelo con entusiasmo y cita la referencia.
    2. Si es 'precio_aproximado' o 'zona_aproximada', dile que le ofreces alternativas similares exclusivas.
    3. Si se creó carpeta de Drive, infórmale de que la documentación está lista.
    Responde SIEMPRE de forma concisa y elegante en el idioma del usuario.
    `;

    const respuestaFinal = await llamarNvidiaPuro(promptDeVenta, historialChat, 0.7);

    console.log(`\n🤖 AGENTE HARVIS (NVIDIA Raw Fetch):`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(respuestaFinal);
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);

    historialChat.push({ role: 'assistant', content: respuestaFinal });

  } catch (error: any) {
    console.error('❌ Error Salvaje (Fetch API):', error.message || error);
  }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function iniciarSimulador() {
  await hablarConHarvis("Hi! I need a villa in La Zagaleta, my budget is around 6M euros. What do you have?");
  await delay(3000);
  await hablarConHarvis("Great! I am Charles Vance. Please prepare the NDA so we can move forward.");
}

iniciarSimulador();
