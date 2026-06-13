import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
  );
}

export interface PropiedadContent {
  titulo: string;
  precio: number;
  zona: string;
  habitaciones: number;
  m2: number;
  descripcion?: string;
  slug: string;
  tipo?: string;
}

async function obtenerHashtagsOptimos(): Promise<string[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('marketing_conocimiento')
    .select('contenido, efectividad, veces_visto')
    .eq('categoria', 'hashtag')
    .order('veces_visto', { ascending: false })
    .limit(20);

  const hashtags = (data || []).map(h => h.contenido);

  // Hashtags base de The Edit Marbella siempre presentes
  const base = ['#TheEditMarbella', '#MarbellaRealEstate', '#LuxuryLiving', '#CostaDelSol'];
  const todos = [...new Set([...base, ...hashtags])];
  return todos.slice(0, 8); // máximo 8 para el algoritmo
}

export async function generarCopyConNvidia(propiedad: PropiedadContent, hashtags: string[]): Promise<{ instagram: string; linkedin: string; hook: string }> {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (!nvidiaKey) throw new Error('Falta NVIDIA_API_KEY');

  const prompt = `Eres el social media manager de The Edit Marbella, agencia inmobiliaria de lujo en la Costa del Sol.

Genera copy para Instagram y LinkedIn para esta propiedad:
- Título: ${propiedad.titulo}
- Precio: €${propiedad.precio.toLocaleString('es-ES')}
- Zona: ${propiedad.zona}
- Habitaciones: ${propiedad.habitaciones}
- m²: ${propiedad.m2}
- URL: https://www.theeditmarbella.com/es/propiedades/${propiedad.slug}
${propiedad.descripcion ? `- Descripción: ${propiedad.descripcion.slice(0, 200)}` : ''}

REGLAS ALGORITMO INSTAGRAM 2026:
- Hook en primeras 3 palabras — impactante, sin emojis al inicio
- Caption 150-300 palabras
- Máximo 8 hashtags al final
- Pregunta al final para generar comentarios
- Precio visible genera saves
- Tono: editorial, aspiracional, nunca comercial

REGLAS LINKEDIN:
- Más profesional, orientado a inversores
- Mencionar ROI potencial o valor de mercado
- 100-200 palabras
- Sin hashtags en exceso (máx 3)

Responde SOLO en este formato JSON exacto:
{
  "hook": "primeras 3 palabras impactantes para el reel",
  "instagram": "caption completo de instagram con emojis y hashtags al final",
  "linkedin": "post de linkedin profesional"
}`;

  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${nvidiaKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'meta/llama-3.3-70b-instruct',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.5,
    }),
  });

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '{}';

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return { hook: '', instagram: text, linkedin: text };
  }
}

export async function generarPublicacion(propiedad: PropiedadContent) {
  const supabase = getSupabase();
  
  // Ejecutar en paralelo — hashtags de BD y copy de NVIDIA
  const [hashtagsDB, copy] = await Promise.all([
    obtenerHashtagsOptimos(),
    generarCopyConNvidia(propiedad, ['#TheEditMarbella','#MarbellaRealEstate','#LuxuryLiving','#CostaDelSol','#Marbella','#LuxuryRealEstate','#PropiedadesDeLujo','#ElMadroñal']),
  ]);

  // Guardar async sin bloquear
  supabase.from('publicaciones').insert({
    propiedad_slug: propiedad.slug,
    copy_instagram: copy.instagram,
    copy_linkedin: copy.linkedin,
    hashtags: hashtagsDB,
    hook: copy.hook,
  }).then(({ error }) => {
    if (error) console.error('[Content] Error guardando:', error.message);
    else console.log('[Content] Publicacion guardada');
  });

  return { ...copy, hashtags: hashtagsDB };
}
