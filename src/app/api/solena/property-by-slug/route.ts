import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug');
  if (!slug) return Response.json({ error: 'slug requerido' }, { status: 400 });

  const supabase = createClient(
    process.env.SOLENA_SUPABASE_URL!,
    process.env.SOLENA_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from('properties')
    .select('id, slug, galeria_urls')
    .eq('slug', slug)
    .single();

  if (error || !data) return Response.json({ error: 'No encontrada' }, { status: 404 });
  return Response.json(data);
}
