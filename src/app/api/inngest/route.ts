import { serve } from 'inngest/next';
import { inngest } from '../../../inngest/client.js';
import { ingestProperty, ingestPropertySolena, notificarCaliente, procesarTemplado } from '../../../inngest/functions.js';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [ingestProperty, ingestPropertySolena, notificarCaliente, procesarTemplado],
});
