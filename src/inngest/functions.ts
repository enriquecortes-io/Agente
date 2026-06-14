import { inngest } from './client.js';
import { ingerirPropiedad } from '../tools/propertyIngestionTools.js';

export const ingestProperty = inngest.createFunction(
  { id: 'ingest-property', triggers: [{ event: 'property/ingest' }] },
  async ({ event, step }: any) => {
    const { url, slug } = event.data;
    const result = await step.run('ingerir-propiedad', async () => {
      return await ingerirPropiedad(url, slug);
    });
    return result;
  }
);
