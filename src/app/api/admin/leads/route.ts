import { createClient } from '@supabase/supabase-js';
export const dynamic = 'force-dynamic';
export async function GET() {
  const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await s.from('leads').select('*').order('score', { ascending: false }).limit(50);
  return new Response(JSON.stringify({ leads: data || [] }), { headers: { 'Content-Type': 'application/json' } });
}
