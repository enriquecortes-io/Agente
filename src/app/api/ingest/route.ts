import { ingerirPropiedad } from '../../../tools/propertyIngestionTools.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { url, slug } = await req.json();
    if (!url) return new Response(JSON.stringify({ error: 'Falta URL' }), { status: 400 });
    const result = await ingerirPropiedad(url, slug);
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
