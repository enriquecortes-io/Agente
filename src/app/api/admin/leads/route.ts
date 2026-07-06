import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase(project: string) {
  if (project === 'solena') {
    return createClient(process.env.SOLENA_SUPABASE_URL!, process.env.SOLENA_SERVICE_ROLE_KEY!);
  }
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const project = url.searchParams.get('project') || 'tem';
  const supabase = getSupabase(project);
  const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ leads: data || [] });
}

export async function PATCH(req: Request) {
  const { id, fase, project } = await req.json();
  const supabase = getSupabase(project || 'tem');
  const { error } = await supabase.from('leads').update({ fase }).eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
