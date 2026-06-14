import { inngest } from '../../../inngest/client.js';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
 try {
   const { url, slug } = await req.json();
   if (!url) return new Response(JSON.stringify({ error: 'Falta URL' }), { status: 400 });

   const slugFinal = slug || url
     .split('/').filter(Boolean).pop()
     ?.toLowerCase()
     .replace(/[^a-z0-9-]/g, '-')
     .slice(0, 60) || 'propiedad';

   await inngest.send({
     name: 'property/ingest',
     data: { url, slug: slugFinal },
   });

   return new Response(
     JSON.stringify({ success: true, message: 'Ingesta iniciada en background', slug: slugFinal }),
     { status: 200, headers: { 'Content-Type': 'application/json' } }
   );
 } catch (error: any) {
   return new Response(JSON.stringify({ error: error.message }), { status: 500 });
 }
}
