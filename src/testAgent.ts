import { generateText, tool, CoreMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const tools = {
  buscarPropiedades: tool({
    description: 'Búsqueda obligatoria de propiedades.',
    // 🔥 EL HACK: 1 solo campo. Le quitamos a Gemini la responsabilidad de hacer JSONs complejos.
    parameters: z.object({
      extraccion: z.string().describe('OBLIGATORIO. Escribe las zonas, los municipios deducidos y el presupuesto separados por el símbolo |. Ejemplo EXACTO: "Sotogrande, La Zagaleta|San Roque, Benahavis|7000000"')
    }),
    execute: async (args) => {
      // Si por algún milagro manda vacío, lo pillamos
      const textoSeguro = args.extraccion || '||0';
      
      // 🔪 Cortamos el texto por la tubería "|"
      const partes = textoSeguro.split('|');
      const zonas = partes[0] ? partes[0].trim() : '';
      const municipios = partes[1] ? partes[1].trim() : '';
      const presupuestoStr = partes[2] ? partes[2].trim() : '0';

      // Calculamos el precio
      let precioCalculado = 0;
      if (presupuestoStr) {
        const strLimpio = presupuestoStr.toLowerCase().replace(/euros|€/g, '').trim();
        if (strLimpio.includes('m') || strLimpio.includes('millon')) {
          const numero = parseFloat(strLimpio.replace(/[^\d.,]/g, '').replace(',', '.'));
          if (!isNaN(numero)) precioCalculado = numero * 1000000;
        } else {
          const numero = parseInt(strLimpio.replace(/\D/g, ''));
          if (!isNaN(numero)) precioCalculado = numero;
        }
      }

      console.log(`\n    🔌 [TOOL SUPABASE] ¡HACK COMPLETADO CON ÉXITO!`);
      console.log(`    📦 Raw Text de Gemini: ${textoSeguro}`);
      console.log(`    📍 Zonas extraídas:    ${zonas}`);
      console.log(`    🗺️ Municipios (IA):    ${municipios}`);
      console.log(`    💰 Presupuesto Max:    ${precioCalculado}€`);

      return await searchPropertiesInSupabase({ 
        urbanizacion: zonas, 
        municipioDeducido: municipios, 
        precioMax: precioCalculado 
      });
    }
  })
};

let historialChat: CoreMessage[] = [];

async function hablarConHarvis(mensajeCliente: string) {
  console.log(`\n╔═════════════════════════════════════════════════════════════════════════`);
  console.log(`║ 👤 CLIENTE: "${mensajeCliente}"`);
  console.log(`╚═════════════════════════════════════════════════════════════════════════`);

  historialChat.push({ role: 'user', content: mensajeCliente });

  try {
    const response = await generateText({
      model: google('gemini-2.5-flash'),
      temperature: 0,
      system: `Eres un extractor de datos en texto plano. 
DEBES llamar a la herramienta 'buscarPropiedades'.
Tu ÚNICA misión es generar un string separado por barras '|' con: Zonas pedidas | Municipios españoles deducidos | Presupuesto en números.
EJEMPLO DE RESPUESTA: "Sotogrande, La Zagaleta|San Roque, Benahavis|7000000"`,
      messages: historialChat,
      tools: tools,
      toolChoice: 'required',
      maxSteps: 5
    });

    console.log(`\n🤖 AGENTE HARVIS:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(response.text || "(Herramienta ejecutada)");
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);

  } catch (error: any) {
    console.error('❌ Error durante la simulación:', error.message || error);
  }
}

async function iniciarSimulador() {
  await hablarConHarvis("I am looking for a villa in Sotogrande or La Zagaleta, budget around 6M to 7M euros.");
}

iniciarSimulador();
