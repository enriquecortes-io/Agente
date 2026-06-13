import { generarPublicacion } from '../../../tools/contentTools.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { propiedad } = body;
    if (!propiedad) return new Response(JSON.stringify({ error: 'Falta propiedad' }), { status: 400 });
    const result = await generarPublicacion(propiedad);
    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
