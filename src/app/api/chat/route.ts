import { SYSTEM_PROMPT } from '../../../agents/realEstateExecutive.js';
import { searchPropertiesInSupabase } from '../../../tools/supabaseTools.js';
import { prepararEntornoCliente, actualizarHistorial } from '../../../tools/driveLogger.js';
import { sendCrmLeadNotification } from '../../../tools/webhookTools.js';
import { agendarVisita } from '../../../tools/calendarTools.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function isAuthorized(req: Request): boolean {
  const secret = process.env.AGENT_API_SECRET;
  if (!secret) return true;
  return req.headers.get('x-agent-key') === secret;
}

const ZONAS = ["Golden Mile","Milla de Oro","Sierra Blanca","Nagüeles","Cascada de Camoján","Puerto Banús","Nueva Andalucía","Las Brisas","Los Naranjos","La Cerquilla","Los Monteros","Río Real","Cabopino","Elviria","Las Chapas","La Mairena","El Rosario","La Cañada","La Carolina","Marbella Centro","La Alzambra","La Zagaleta","Los Flamingos","La Quinta","Monte Halcones","Los Arqueros","Atalaya","El Paraíso","Benahavís","El Madroñal","Estepona","Guadalmina","San Pedro de Alcántara","Mijas","Sotogrande"];

function detectarContacto(texto: string) {
  const emailMatch = texto.match(/[\w.-]+@[\w.-]+\.[a-z]{2,}/i);
  const phoneMatch = texto.match(/\+?[\d\s\-]{9,}/);
  const nombreMatch = texto.match(/(?:soy|me llamo|cliente[:\s]+|con\s+)([A-ZÁÉÍÓÚÑa-záéíóúñ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ][a-záéíóúñ]+){0,2})/i);
  const presupuestoMatch = texto.match(/(\d+(?:[.,]\d+)?)\s*(?:millones?|M€)/i) || texto.match(/(\d{1,3}(?:[.,]\d{3})*)\s*(?:euros?|€)/i);
  return {
    email: emailMatch?.[0] || null,
    phone: phoneMatch?.[0]?.trim() || null,
    nombre: nombreMatch?.[1]?.trim() || null,
    presupuesto: presupuestoMatch ? parseFloat(presupuestoMatch[1].replace(/\./g,'').replace(',','.')) * (presupuestoMatch[0].match(/millon/i)?1_000_000:1) : null,
  };
}

// Detectar intent de calendario — palabras clave ampliadas
function esIntentCalendario(texto: string): boolean {
  return /\b(agenda|agendar|crea?\s+(?:un\s+)?evento|añade?\s+(?:al\s+)?calendar|programa|reserva|visita\s+(?:con|para)|cita\s+(?:con|para)|apunta)\b/i.test(texto);
}

// Extraer hora del texto
function extraerHora(texto: string): string | null {
  const m = texto.match(/(?:a las?\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:h(?:oras?)?|de la\s+(?:mañana|tarde|noche))?/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = m[2] || '00';
  if (/tarde|noche/i.test(texto) && h < 12) h += 12;
  return `${String(h).padStart(2,'0')}:${min}`;
}

// Extraer fecha del texto
function extraerFecha(texto: string): string | null {
  const hoy = new Date();
  if (/\bhoy\b/i.test(texto)) return hoy.toISOString().slice(0,10);
  if (/\bmañana\b/i.test(texto)) { const d=new Date(hoy); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); }
  if (/pasado\s+mañana/i.test(texto)) { const d=new Date(hoy); d.setDate(d.getDate()+2); return d.toISOString().slice(0,10); }
  const dias: Record<string,number> = {lunes:1,martes:2,'miércoles':3,miercoles:3,jueves:4,viernes:5,'sábado':6,sabado:6,domingo:0};
  for (const [dia,num] of Object.entries(dias)) {
    if (new RegExp(`\\b${dia}\\b`,'i').test(texto)) {
      const d=new Date(hoy); const diff=(num-d.getDay()+7)%7||7; d.setDate(d.getDate()+diff); return d.toISOString().slice(0,10);
    }
  }
  const meses: Record<string,string> = {enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};
  const fm = texto.match(/(\d{1,2})\s*de\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i);
  if (fm) return `${hoy.getFullYear()}-${meses[fm[2].toLowerCase()]}-${fm[1].padStart(2,'0')}`;
  return null;
}

// Extraer nombre de persona del contexto "con Mariángeles", "con Pedro"
function extraerNombreCliente(texto: string): string | null {
  const m = texto.match(/\bcon\s+([A-ZÁÉÍÓÚÑÜa-záéíóúñü][a-záéíóúñü]+(?:\s+[A-ZÁÉÍÓÚÑÜa-záéíóúñü][a-záéíóúñü]+)?)/i);
  return m?.[1]?.trim() || null;
}

// Parser de múltiples visitas en un solo mensaje
function parsearVisitas(texto: string, project: string): Array<{nombreCliente:string, fecha:string, hora:string, emailCliente?:string, propiedadTitulo:string, project:string}> {
  const visitas: any[] = [];

  // Detectar si hay múltiples eventos mencionados — dividir por "y", "otro", números
  // Estrategia: buscar cada mención de hora con su contexto
  const segmentos = texto.split(/\b(?:y\s+crea|y\s+otro|segundo\s+evento|también)\b/i);

  for (const seg of segmentos) {
    const hora = extraerHora(seg);
    const fecha = extraerFecha(texto); // fecha suele estar al inicio
    const nombre = extraerNombreCliente(seg) || 'Cliente';
    const email = seg.match(/[\w.-]+@[\w.-]+\.[a-z]{2,}/i)?.[0];
    const propMatch = seg.match(/(?:villa|apartamento|piso|casa|propiedad|ático|inmueble)\s+[A-Za-záéíóúñ\s]+/i);
    const propiedad = propMatch?.[0]?.trim() || 'Visita de propiedad en Marbella';

    if (hora && fecha) {
      visitas.push({ nombreCliente: nombre, fecha, hora, emailCliente: email, propiedadTitulo: propiedad, project });
    }
  }

  return visitas;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return new Response(JSON.stringify({error:'No autorizado.'}),{status:401});

  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({error:'Body inválido.'}),{status:400}); }

  const { messages: incomingMessages, project = 'tem' } = body;
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({error:'Falta NVIDIA_API_KEY.'}),{status:500});

  const requestId = crypto.randomUUID().slice(0,8);
  const ultimoMensaje = incomingMessages[incomingMessages.length-1]?.content || '';
  const todosLosMensajes = incomingMessages.map((m:any)=>m.content).join('\n');
  const contacto = detectarContacto(todosLosMensajes);
  const esVendedor = /quiero vender|vendo|vender mi|tengo.*(?:piso|villa|casa|apartamento|finca|propiedad).*(?:vender|venta)|busco comprador|cómo funcionáis|servicio.*venta/i.test(ultimoMensaje);

  // Auto-CRM
  if (contacto.nombre && (contacto.email || contacto.phone)) {
    sendCrmLeadNotification({
      nombre: contacto.nombre, contacto: contacto.email||contacto.phone||'',
      presupuesto: contacto.presupuesto||undefined,
      notasCualificacion: ultimoMensaje.slice(0,300),
      tipoLead: esVendedor?'Captacion':'Venta',
    }).catch(()=>{});
  }

  try {
    // ── INTENT CALENDARIO ─────────────────────────────────────
    if (esIntentCalendario(ultimoMensaje)) {
      const visitas = parsearVisitas(ultimoMensaje, project);

      if (visitas.length === 0) {
        return new Response(JSON.stringify({success:true, message:'Para agendar necesito la fecha y hora. ¿Cuándo sería la visita?', requestId}),
          {status:200, headers:{'Content-Type':'application/json'}});
      }

      const resultados = await Promise.all(visitas.map(v => agendarVisita(v)));
      const exitosos = resultados.filter(r => r.success);
      const fallidos = resultados.filter(r => !r.success);

      let respuesta = '';
      if (exitosos.length > 0) {
        respuesta += `✅ ${exitosos.length === 1 ? 'Visita agendada' : `${exitosos.length} visitas agendadas`}:\n\n`;
        visitas.forEach((v, i) => {
          if (resultados[i].success) {
            respuesta += `• **${v.nombreCliente}** — ${v.fecha} a las ${v.hora}\n`;
            if (v.emailCliente) respuesta += `  📧 Confirmación enviada a ${v.emailCliente}\n`;
          }
        });
      }
      if (fallidos.length > 0) respuesta += `\n⚠️ ${fallidos.length} evento(s) no se pudieron crear.`;

      return new Response(JSON.stringify({success:true, message:respuesta.trim(), requestId}),
        {status:200, headers:{'Content-Type':'application/json'}});
    }

    // ── CAPTACIÓN ────────────────────────────────────────────
    if (esVendedor) {
      const nombre = contacto.nombre || '';
      const marca = project === 'solena' ? 'Solena' : 'The Edit Marbella';
      const respuesta = nombre
        ? `Encantado, ${nombre}. En ${marca} trabajamos con compradores precualificados y valoración por datos reales. ¿En qué zona se encuentra su propiedad y qué precio estima?`
        : '¿Con quién tengo el placer de hablar? Me gustaría conocer su propiedad.';
      return new Response(JSON.stringify({success:true, message:respuesta, requestId}),
        {status:200, headers:{'Content-Type':'application/json'}});
    }

    // ── BÚSQUEDA DIRECTA ─────────────────────────────────────
    const zonaDirecta = ZONAS.find(z => ultimoMensaje.toLowerCase().includes(z.toLowerCase())) || null;
    const yaHayPropiedades = todosLosMensajes.includes('theeditmarbella.com/es/propiedades');
    const esSeguimiento = /visita|agendar|llamada|interesa|cuando|disponible|fotos/i.test(ultimoMensaje);

    if ((zonaDirecta || contacto.presupuesto) && !yaHayPropiedades && !esSeguimiento) {
      const resultado = await searchPropertiesInSupabase({
        urbanizacion: zonaDirecta||undefined,
        municipioDeducido: zonaDirecta||undefined,
        precioMax: contacto.presupuesto||undefined,
      });
      if ((resultado.propiedades??[]).length > 0) {
        const intro = `Encantado${contacto.nombre?`, ${contacto.nombre}`:''}. He encontrado ${resultado.propiedades!.length === 1 ? 'esta propiedad' : 'estas propiedades'}:\n\n`;
        const lista = resultado.propiedades!.map((p:any) =>
          `**${p.titulo}** — ${p.referencia}\n📍 ${p.municipio} · 🛏 ${p.habitaciones} hab · 💰 €${Number(p.precio).toLocaleString('es-ES')}\n🔗 ${p.url}`
        ).join('\n\n');
        const respuesta = intro + lista + '\n\n¿Te gustaría programar una visita privada?';
        return new Response(JSON.stringify({success:true, message:respuesta, requestId}),
          {status:200, headers:{'Content-Type':'application/json'}});
      }
    }

    // ── NVIDIA STREAMING ──────────────────────────────────────
    const nvidiaRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method:'POST',
      headers:{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body: JSON.stringify({
        model:'meta/llama-3.1-8b-instruct',
        messages:[{role:'system',content:SYSTEM_PROMPT},...incomingMessages.map((m:any)=>({role:m.role,content:m.content}))],
        max_tokens:150, temperature:0.4, stream:true,
      }),
    });

    if (!nvidiaRes.ok) throw new Error(`NVIDIA ${nvidiaRes.status}`);

    const stream = new ReadableStream({
      async start(controller) {
        const reader = nvidiaRes.body!.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        try {
          while(true) {
            const {done,value} = await reader.read();
            if(done) break;
            for(const line of decoder.decode(value).split('\n').filter(l=>l.startsWith('data: '))) {
              const data = line.slice(6);
              if(data==='[DONE]') continue;
              try { const token=JSON.parse(data).choices?.[0]?.delta?.content||''; if(token){fullText+=token;controller.enqueue(new TextEncoder().encode(token));} } catch{}
            }
          }
          if(fullText&&contacto.nombre) {
            prepararEntornoCliente(contacto.nombre,'Venta').then(r=>{if(r.docId)actualizarHistorial(r.docId,ultimoMensaje,fullText).catch(()=>{});}).catch(()=>{});
          }
        } finally { controller.close(); }
      }
    });

    return new Response(stream, {headers:{'Content-Type':'text/plain; charset=utf-8','Transfer-Encoding':'chunked'}});

  } catch(error:any) {
    console.error(`[${requestId}]`,error.message);
    return new Response(JSON.stringify({success:false,error:error.message,requestId}),{status:500,headers:{'Content-Type':'application/json'}});
  }
}
