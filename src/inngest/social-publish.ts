import { inngest } from './client.js';
import { schedulePost, type SocialNetwork } from '../lib/social/metricool.js';
import { updateSocialPostStatus } from '../lib/social/db.js';

interface SocialPublishEvent {
  postId: string;
  texto: string;
  redes: SocialNetwork[];
  scheduledAt: string;
  imagenUrl?: string;
}

export const socialPublish = inngest.createFunction(
  { id: 'social-publish', triggers: [{ event: 'social/publish' }] },
  async ({ event, step }: { event: { data: SocialPublishEvent }; step: any }) => {
    const { postId, texto, redes, scheduledAt, imagenUrl } = event.data;

    const result = await step.run('publicar-en-metricool', async () => {
      return schedulePost({
        text: texto,
        networks: redes,
        scheduledAt,
        ...(imagenUrl ? { imageUrls: [imagenUrl] } : {}),
      });
    });

    await step.run('actualizar-estado', async () => {
      await updateSocialPostStatus(postId, 'scheduled', result.id);
    });

    return { success: true, metricoolId: result.id };
  }
);
