import { generateText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function diagnosticoHarvis() {
  console.log(`\n🩺 INICIANDO RADIOGRAFÍA DE GEMINI...`);
  console.log(`👤 CLIENTE: "I am looking for a villa in Sotogrande or La Zagaleta, budget around 6M to 7M euros."`);

  try {
    const response = await generateText({
      model: google('gemini-2.5-flash'),
      prompt: "I am looking for a villa in Sotogrande or La Zagaleta, budget around 6M to 7M euros.",
      tools: {
        buscarPropiedades: tool({
          description: 'Extract location and budget from the user.',
          parameters: z.object({
            zonas: z.string(),
            municipios: z.string(),
            presupuesto: z.string()
          }),
          execute: async (args) => {
            // AQUÍ ESTÁ LA TRAMPA: Imprimimos EL OBJETO ENTERO, sin filtros.
            console.log(`\n🚨 [X-RAY] ¡ESTO ES LO QUE GEMINI HA ENVIADO REALMENTE!:`);
            console.log(JSON.stringify(args, null, 2));
            return "Diagnóstico completado.";
          }
        })
      },
      toolChoice: 'required',
      temperature: 0
    });

    console.log(`\n🤖 RAW TOOL CALLS (El JSON nativo):`);
    console.log(JSON.stringify(response.toolCalls, null, 2));

  } catch (error: any) {
    console.error('\n❌ ERROR SALVAJE APARECE:', error.message || error);
  }
}

diagnosticoHarvis();
