import { createClient } from '@supabase/supabase-js';
export const dynamic = 'force-dynamic';

function getSupabase(project: string) {
  if (project === 'solena') {
    return createClient(process.env.SOLENA_SUPABASE_URL!, process.env.SOLENA_SERVICE_ROLE_KEY!);
  }
  if (project === 'smc') {
    return createClient(process.env.SMC_SUPABASE_URL!, process.env.SMC_SERVICE_ROLE_KEY!);
  }
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const project = url.searchParams.get('project') || 'tem';
  console.log('[Campanas] project:', project, 'SMC_URL exists:', !!process.env.SMC_SUPABASE_URL);
  const supabase = getSupabase(project);
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('proyecto', project)
    .not('email', 'is', null)
    .neq('email', '')
    .order('created_at', { ascending: false });
  if (error) { console.log('[Campanas] Supabase error:', JSON.stringify(error)); return new Response(JSON.stringify({ error: error.message, debug: error }), { status: 500 }); }
  console.log('[Campanas] data count:', data?.length);
  return new Response(JSON.stringify({ leads: data }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
}
