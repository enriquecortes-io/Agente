import { inngest } from './client.js';
import { ingerirPropiedad } from '../tools/propertyIngestionTools.js';

export const ingestProperty = inngest.createFunction(
  { id: 'ingest-property' },
  { event: 'property/ingest' as const },
  async ({ event, step }: { event: { data: { url: string; slug?: string } }; step: any }) => {
    const { url, slug } = event.data;
    const result = await step.run('ingerir-propiedad', async () => {
      return await ingerirPropiedad(url, slug);
    });
    return result;
  }
);
