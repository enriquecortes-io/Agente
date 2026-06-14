import { Inngest } from 'inngest';

export const inngest = new Inngest({ 
  id: 'harvis',
  eventKey: process.env.INNGEST_EVENT_KEY,
});
