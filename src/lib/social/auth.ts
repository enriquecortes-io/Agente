import 'server-only';

const ADMIN_KEY = process.env.ADMIN_API_KEY ?? '';

export function isAdmin(req: Request): boolean {
  return req.headers.get('x-agent-key') === ADMIN_KEY;
}

export function requireAdmin(req: Request): Response | null {
  if (!isAdmin(req)) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}
