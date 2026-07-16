import { createClient } from '@supabase/supabase-js';
export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('email_leads')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ leads: data }), { headers: { 'Content-Type': 'application/json' } });
}
