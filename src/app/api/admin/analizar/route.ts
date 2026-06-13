import { analizarYGuardar } from '../../../../tools/apifyTools.js';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(req: Request) {
  const { username } = await req.json();
  const { reels } = await analizarYGuardar(username, 10);
  return new Response(JSON.stringify({ success: true, reels: reels.length }), { headers: { 'Content-Type': 'application/json' } });
}
