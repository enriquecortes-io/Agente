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

export async function POST(req: Request) {
  const body = await req.json();
  const project = body.proyecto || body.project || 'tem';
  const supabase = getSupabase(project);

  // Batch import
  if (body.batch) {
    const leads = body.batch.map((l: any) => ({ ...l, proyecto: project, fase: l.fase || 'nuevo' }));
    const { error, count } = await supabase.from('leads').insert(leads);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true, count: leads.length });
  }

  // Single insert
  const { error } = await supabase.from('leads').insert({ ...body, fase: body.fase || 'nuevo' });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const project = body.proyecto || body.project || 'tem';
  const supabase = getSupabase(project);
  const { id, ...data } = body;
  const { error } = await supabase.from('leads').update(data).eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const project = url.searchParams.get('project') || 'tem';
  const supabase = getSupabase(project);
  if (!id) return Response.json({ error: 'Falta id' }, { status: 400 });
  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
