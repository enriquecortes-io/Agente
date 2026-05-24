import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const apiKey = process.env.NVIDIA_API_KEY;

async function listarModelosNvidia() {
  console.log(`\n🔍 INICIANDO ESCÁNER DE MODELOS NVIDIA NIM...`);
  
  if (!apiKey) {
    console.error(`❌ ERROR: No encuentro la NVIDIA_API_KEY en tu .env.local`);
    return;
  }

  try {
    const respuesta = await fetch(`https://integrate.api.nvidia.com/v1/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      console.error(`❌ ERROR DE NVIDIA:`, datos);
      return;
    }

    console.log(`\n✅ CONEXIÓN EXITOSA. TUS MODELOS NVIDIA DISPONIBLES SON:\n`);
    
    // Filtramos para sacar solo los modelos potentes de texto (Llama, Mistral, Nemotron)
    const modelosTexto = datos.data.filter((m: any) => 
      m.id.toLowerCase().includes('llama') || 
      m.id.toLowerCase().includes('mistral') ||
      m.id.toLowerCase().includes('nemotron')
    );

    modelosTexto.forEach((m: any) => {
      console.log(`🤖 ID Exacto a copiar:  ${m.id}`);
    });

    console.log(`\n─────────────────────────────────────────────────────────────────`);
    console.log(`💡 Copia el ID que ponga 'llama-3.1-8b-instruct' (o similar) y ponlo en testAgent.ts`);

  } catch (error: any) {
    console.error(`❌ Fallo en la conexión:`, error.message);
  }
}

listarModelosNvidia();
