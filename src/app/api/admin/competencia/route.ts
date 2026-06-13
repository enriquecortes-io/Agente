import { createClient } from '@supabase/supabase-js';
export const dynamic = 'force-dynamic';
export async function GET() {
  const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await s.from('competencia_analisis').select('*').order('created_at', { ascending: false });
  return new Response(JSON.stringify({ analisis: data || [] }), { headers: { 'Content-Type': 'application/json' } });
}
