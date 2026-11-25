import { createHmac, timingSafeEqual } from 'crypto';

export const dynamic = 'force-dynamic';
const DIAS = 30;

export async function POST(req: Request) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return new Response(JSON.stringify({ error: 'No hay ADMIN_PASSWORD configurada' }), { status: 500 });
  }

  const { clave } = await req.json().catch(() => ({ clave: '' }));
  const a = Buffer.from(String(clave || ''));
  const b = Buffer.from(password);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    return new Response(JSON.stringify({ error: 'Contraseña incorrecta' }), { status: 401 });
  }

  const exp = String(Date.now() + DIAS * 864e5);
  const sig = createHmac('sha256', password).update(exp).digest('hex');

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `harvis_admin=${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DIAS * 86400}`,
    },
  });
}
