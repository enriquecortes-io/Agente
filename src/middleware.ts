import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE = 'harvis_admin';
const ABIERTAS = ['/admin/login', '/api/admin/login'];

async function firmar(dato: string, secreto: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(dato));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (ABIERTAS.some(p => pathname.startsWith(p))) return NextResponse.next();

  const password = process.env.ADMIN_PASSWORD;
  const apiToken = process.env.ADMIN_API_TOKEN;
  // Sin configurar no bloquea nada, para no dejar fuera al dueño por olvidar una variable.
  if (!password && !apiToken) return NextResponse.next();

  if (apiToken && req.headers.get('x-admin-token') === apiToken) return NextResponse.next();

  if (password) {
    const cookie = req.cookies.get(COOKIE)?.value;
    const [exp, sig] = (cookie || '').split('.');
    if (exp && sig && Number(exp) > Date.now() && (await firmar(exp, password)) === sig) {
      return NextResponse.next();
    }
  }

  if (pathname.startsWith('/api/')) {
    return new NextResponse(JSON.stringify({ error: 'No autorizado' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/admin/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] };
