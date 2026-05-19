import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function comprobarModelos() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ ERROR: No se encontró GOOGLE_GENERATIVE_AI_API_KEY en .env.local');
    return;
  }

  console.log('🔍 Conectando con los servidores de Google para listar tus modelos disponibles...\n');

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();

    if (data.error) {
      console.error('❌ Error de Google:', data.error.message);
      return;
    }

    const modelosValidos = data.models
      .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: any) => m.name.replace('models/', ''));

    console.log('✅ ESTOS SON LOS MODELOS QUE ACEPTA TU API KEY:');
    console.log('──────────────────────────────────────────────────');
    modelosValidos.forEach((m: string) => console.log(`- ${m}`));
    console.log('──────────────────────────────────────────────────\n');
    console.log('Copia el que diga algo como "gemini-1.5-flash" o "gemini-pro" y pásamelo por aquí.');
  } catch (error) {
    console.error('Error de red al conectar con Google:', error);
  }
}

comprobarModelos();
