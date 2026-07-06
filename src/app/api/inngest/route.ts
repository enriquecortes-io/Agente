import { serve } from 'inngest/next';
import { inngest } from '../../../inngest/client.js';
import { ingestProperty, notificarCaliente, procesarTemplado } from '../../../inngest/functions.js';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [ingestProperty, notificarCaliente, procesarTemplado],
});
