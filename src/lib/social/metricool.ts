import 'server-only';

const BASE = 'https://app.metricool.com';

export type SocialNetwork = 'INSTAGRAM' | 'FACEBOOK' | 'TWITTER' | 'LINKEDIN' | 'TIKTOK';

export interface SchedulePostInput {
  text: string;
  networks: SocialNetwork[];
  scheduledAt: string;
  imageUrls?: string[];
}

export interface MetricoolPost {
  id: string;
  text: string;
  networks: SocialNetwork[];
  scheduledAt: string;
  status: string;
}

async function mFetch(path: string, init?: RequestInit) {
  const token = process.env.METRICOOL_TOKEN;
  if (!token) throw new Error('METRICOOL_TOKEN no configurado');

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Metricool ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json();
}

export async function schedulePost(input: SchedulePostInput): Promise<MetricoolPost> {
  const brandId = process.env.METRICOOL_BRAND_ID;

  return mFetch('/api/v2/scheduler/posts', {
    method: 'POST',
    body: JSON.stringify({
      post: {
        text: input.text,
        networks: input.networks,
        date: input.scheduledAt,
        ...(brandId ? { brandId } : {}),
        ...(input.imageUrls?.length ? { mediaUrls: input.imageUrls } : {}),
      },
    }),
  });
}

export async function getScheduledPosts(): Promise<MetricoolPost[]> {
  const data = await mFetch('/api/v2/scheduler/posts');
  return data.posts ?? data ?? [];
}

export async function deleteScheduledPost(metricoolId: string): Promise<void> {
  await mFetch(`/api/v2/scheduler/posts/${metricoolId}`, { method: 'DELETE' });
}
