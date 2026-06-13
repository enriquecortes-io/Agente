import { generarCopyConNvidia, PropiedadContent } from '../../../tools/contentTools.js';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const HASHTAGS = ['#TheEditMarbella','#MarbellaRealEstate','#LuxuryLiving','#CostaDelSol','#Marbella','#LuxuryRealEstate','#PropiedadesDeLujo','#GoldenMile'];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const propiedad: PropiedadContent = body.propiedad;
    if (!propiedad) return new Response(JSON.stringify({ error: 'Falta propiedad' }), { status: 400 });

    // Solo NVIDIA — sin Supabase en el path crítico
    const copy = await generarCopyConNvidia(propiedad, HASHTAGS);

    // Guardar en Supabase fire-and-forget
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    supabase.from('publicaciones').insert({
      propiedad_slug: propiedad.slug,
      copy_instagram: copy.instagram,
      copy_linkedin: copy.linkedin,
      hashtags: HASHTAGS,
      hook: copy.hook,
    }).then(({ error }) => {
      if (error) console.error('[Content] Error guardando:', error.message);
    });

    return new Response(
      JSON.stringify({ success: true, ...copy, hashtags: HASHTAGS }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
