import { inngest } from '../../../inngest/client.js';
import { getSocialPosts, createSocialPost, deleteSocialPost } from '../../../lib/social/db.js';
import { requireAdmin } from '../../../lib/social/auth.js';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const proyecto = url.searchParams.get('proyecto') ?? undefined;
  const posts = await getSocialPosts(proyecto);
  return Response.json({ posts });
}

export async function POST(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const body = await req.json() as {
    texto: string;
    redes: string[];
    scheduled_at: string;
    imagen_url?: string;
    proyecto?: string;
  };
  const { texto, redes, scheduled_at, imagen_url, proyecto } = body;

  if (!texto || !redes?.length || !scheduled_at) {
    return Response.json(
      { error: 'texto, redes y scheduled_at son obligatorios' },
      { status: 400 }
    );
  }

  const post = await createSocialPost({
    texto,
    redes,
    scheduled_at,
    imagen_url: imagen_url ?? null,
    proyecto: proyecto ?? null,
    status: 'draft',
  });

  await inngest.send({
    name: 'social/publish',
    data: {
      postId: post.id,
      texto: post.texto,
      redes: post.redes,
      scheduledAt: post.scheduled_at,
      ...(post.imagen_url ? { imagenUrl: post.imagen_url } : {}),
    },
  });

  return Response.json({ post }, { status: 201 });
}

export async function DELETE(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ error: 'id requerido' }, { status: 400 });

  await deleteSocialPost(id);
  return Response.json({ ok: true });
}
