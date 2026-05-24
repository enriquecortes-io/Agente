import dotenv from 'dotenv';

// Cargamos tu entorno exacto
dotenv.config({ path: '.env.local' });

// Pillamos la API Key (probamos los dos nombres más comunes)
const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;

async function listarModelosGemini() {
  console.log(`\n🔍 INICIANDO ESCÁNER DE MODELOS GOOGLE GEMINI...`);
  
  if (!apiKey) {
    console.error(`❌ ERROR: No encuentro la API Key de Google en tu .env.local`);
    return;
  }

  try {
    const respuesta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const datos = await respuesta.json();

    if (datos.error) {
      console.error(`❌ ERROR DE GOOGLE:`, datos.error.message);
      return;
    }

    console.log(`\n✅ CONEXIÓN EXITOSA. MODELOS DISPONIBLES:\n`);
    
    // Filtramos un poco para que no te escupa morralla antigua
    const modelosUtiles = datos.models.filter((m: any) => 
      m.name.includes('gemini') && !m.name.includes('vision')
    );

    modelosUtiles.forEach((m: any) => {
      console.log(`🤖 Modelo:      ${m.name.replace('models/', '')}`);
      console.log(`   Descripción: ${m.description}`);
      console.log(`   Límites:     Tokens Entrada: ${m.inputTokenLimit} | Salida: ${m.outputTokenLimit}`);
      console.log(`─────────────────────────────────────────────────────────────────`);
    });

    console.log(`\n💡 TIP DE ARQUITECTURA:`);
    console.log(`- Usa versiones 'flash' para velocidad y menor coste (ideal para extraer JSON).`);
    console.log(`- Usa versiones 'pro' para razonamiento complejo (ideal para el prompt de ventas).`);
    console.log(`\n`);

  } catch (error: any) {
    console.error(`❌ Fallo en la conexión:`, error.message);
  }
}

listarModelosGemini();
