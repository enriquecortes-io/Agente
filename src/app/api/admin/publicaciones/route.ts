import { createClient } from '@supabase/supabase-js';
export const dynamic = 'force-dynamic';
export async function GET() {
  const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await s.from('publicaciones').select('*').order('created_at', { ascending: false }).limit(20);
  return new Response(JSON.stringify({ publicaciones: data || [] }), { headers: { 'Content-Type': 'application/json' } });
}
