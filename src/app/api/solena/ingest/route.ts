import { inngest } from '../../../../inngest/client.js';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { url, slug } = await req.json();
    if (!url) return Response.json({ error: 'Falta URL' }, { status: 400 });

    const slugFinal = slug || url
      .split('/').filter(Boolean).pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 60) || 'propiedad';

    await inngest.send({
      name: 'solena/ingest',
      data: { url, slug: slugFinal },
    });

    return Response.json({ success: true, message: 'Ingesta Solena iniciada', slug: slugFinal });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
