const WA_API_URL = `https://graph.facebook.com/v19.0/${process.env.WA_PHONE_NUMBER_ID}/messages`;

interface SendWhatsAppParams {
  to: string;
  message: string;
}

export async function sendWhatsApp({ to, message }: SendWhatsAppParams) {
  const res = await fetch(WA_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.replace('+', ''),
      type: 'text',
      text: { body: message },
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('[WhatsApp] Error Meta API:', data);
    throw new Error(`Error WhatsApp: ${JSON.stringify(data)}`);
  }

  console.log(`[WhatsApp] Enviado a ${to} — ID: ${data.messages?.[0]?.id}`);
  return { success: true, id: data.messages?.[0]?.id };
}

export function mensajeLeadCaliente(nombre: string, zona: string, email: string, phone: string): string {
  return `🔥 *LEAD CALIENTE — SOLENA*\n\n*Nombre:* ${nombre}\n*Zona:* ${zona}\n*Email:* ${email}\n*Tel:* ${phone}\n\n⏱ Contactar en < 60 minutos`;
}

export function mensajeRecordatorio24h(nombre: string, zona: string): string {
  return `📋 *Follow-up — SOLENA*\n\n*Lead:* ${nombre}\n*Zona:* ${zona}\n\n24h desde el email inicial → contacto_pendiente`;
}
