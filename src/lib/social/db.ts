import 'server-only';
import { createClient } from '@supabase/supabase-js';

export type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed';

export interface SocialPost {
  id: string;
  texto: string;
  redes: string[];
  scheduled_at: string;
  status: PostStatus;
  metricool_id?: string | null;
  imagen_url?: string | null;
  proyecto?: string | null;
  created_at: string;
}

function db() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function getSocialPosts(proyecto?: string): Promise<SocialPost[]> {
  let q = db()
    .from('social_posts')
    .select('*')
    .order('scheduled_at', { ascending: false });

  if (proyecto) q = q.eq('proyecto', proyecto);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SocialPost[];
}

export async function createSocialPost(
  post: Omit<SocialPost, 'id' | 'created_at'>
): Promise<SocialPost> {
  const { data, error } = await db()
    .from('social_posts')
    .insert(post)
    .select()
    .single();
  if (error) throw error;
  return data as SocialPost;
}

export async function updateSocialPostStatus(
  id: string,
  status: PostStatus,
  metricoolId?: string
): Promise<void> {
  const { error } = await db()
    .from('social_posts')
    .update({ status, ...(metricoolId ? { metricool_id: metricoolId } : {}) })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteSocialPost(id: string): Promise<void> {
  const { error } = await db().from('social_posts').delete().eq('id', id);
  if (error) throw error;
}
