import { ejecutarSeguimientos } from '../../../../tools/seguimientoTools.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'No autorizado.' }), { status: 401 });
  }

  try {
    console.log('[Cron] Ejecutando seguimientos...');
    const resultado = await ejecutarSeguimientos();
    console.log('[Cron] Completado:', JSON.stringify(resultado));
    return new Response(JSON.stringify({ success: true, ...resultado }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[Cron] Error:', error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
