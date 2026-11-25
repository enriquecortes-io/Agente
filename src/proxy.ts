// Protege /admin y /api/admin. Usa solo APIs web estándar: el tsconfig del
// proyecto (NodeNext) no resuelve los tipos de 'next/server'.
const COOKIE = 'harvis_admin';
const ABIERTAS = ['/admin/login', '/api/admin/login'];

async function firmar(dato: string, secreto: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(dato));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function leerCookie(req: Request, nombre: string): string | null {
  for (const parte of (req.headers.get('cookie') || '').split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return v.join('=');
  }
  return null;
}

export async function proxy(req: Request): Promise<Response | undefined> {
  const url = new URL(req.url);
  const { pathname } = url;
  if (ABIERTAS.some(p => pathname.startsWith(p))) return;

  const password = process.env.ADMIN_PASSWORD;
  const apiToken = process.env.ADMIN_API_TOKEN;
  // Sin configurar no bloquea nada, para no dejar fuera al dueño por olvidar una variable.
  if (!password && !apiToken) return;

  if (apiToken && req.headers.get('x-admin-token') === apiToken) return;

  if (password) {
    const [exp, sig] = (leerCookie(req, COOKIE) || '').split('.');
    if (exp && sig && Number(exp) > Date.now() && (await firmar(exp, password)) === sig) return;
  }

  if (pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
  return Response.redirect(new URL('/admin/login', url).toString(), 307);
}

export default proxy;

export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] };
