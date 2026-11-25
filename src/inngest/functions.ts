import { inngest } from './client.js';
import { ingerirPropiedad } from '../tools/propertyIngestionTools.js';
import { createClient } from '@supabase/supabase-js';
import { ingerirPropiedadSolena } from '../tools/solenaIngestionTools.js';
import { sendEmail, templateImpacto3 } from '../email.js';

function getSupabase() {
  return createClient(
    process.env.SOLENA_SUPABASE_URL!,
    process.env.SOLENA_SERVICE_ROLE_KEY!
  );
}

// ─── Existente ───────────────────────────────
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

// ─── Lead Caliente ───────────────────────────
export const notificarCaliente = inngest.createFunction(
  { id: 'leads-notificar-caliente', triggers: [{ event: 'leads/notificar-caliente' }] },
  async ({ event, step }: any) => {
    const lead = event.data.lead;
    const supabase = getSupabase();

    await step.run('email-caliente', async () => {
      if (!lead.email) throw new Error(`Lead ${lead.id} sin email`);
      await sendEmail({
        to: lead.email,
        subject: `${lead.name}, te contactamos desde Solena`,
        html: templateImpacto3(lead.name, lead.zona),
      });
    });

    await step.run('registrar', async () => {
      await supabase.from('lead_seguimientos').insert({
        lead_id: lead.id,
        tipo: 'email_enviado',
        contenido: `Email caliente enviado a ${lead.email}`,
      });
      await supabase.from('leads').update({ fase: 'contacto_pendiente' }).eq('id', lead.id);
    });

    return { success: true };
  }
);

// ─── Lead Templado ───────────────────────────
export const procesarTemplado = inngest.createFunction(
  { id: 'leads-procesar-templado', triggers: [{ event: 'leads/procesar-templado' }] },
  async ({ event, step }: any) => {
    const lead = event.data.lead;
    const supabase = getSupabase();

    await step.run('enviar-email', async () => {
      if (!lead.email) throw new Error(`Lead ${lead.id} sin email`);
      await sendEmail({
        to: lead.email,
        subject: `${lead.name}, tenemos propiedades en ${lead.zona || 'la Costa del Sol'} que encajan contigo`,
        html: templateImpacto3(lead.name, lead.zona),
      });
    });

    await step.run('registrar-email', async () => {
      await supabase.from('lead_seguimientos').insert({
        lead_id: lead.id,
        tipo: 'email_enviado',
        contenido: `Email Impacto 3 → ${lead.email}`,
      });
      await supabase.from('leads').update({
        fase: 'email_enviado',
        seguimiento_enviado_at: new Date().toISOString(),
      }).eq('id', lead.id);
    });

    await step.sleep('esperar-24h', '24h');

    await step.run('recordatorio-24h', async () => {
      await sendEmail({
        to: process.env.ENRIQUE_EMAIL!,
        subject: `Follow-up pendiente: ${lead.name} — ${lead.zona}`,
        html: `<p>Han pasado 24h desde el primer email a <strong>${lead.name}</strong> (${lead.zona}). Estado actualizado a contacto_pendiente.</p>`,
      });
      await supabase.from('lead_seguimientos').insert({
        lead_id: lead.id,
        tipo: 'email_enviado',
        contenido: `Recordatorio 24h enviado a Enrique`,
      });
      await supabase.from('leads').update({ fase: 'contacto_pendiente' }).eq('id', lead.id);
    });

    return { success: true };
  }
);

export const ingestPropertySolena = inngest.createFunction(
  { 
    id: 'ingest-property-solena', 
    triggers: [{ event: 'solena/ingest' }],
    timeouts: { finish: '10m' },
  },
  async ({ event, step }: any) => {
    const { url, slug } = event.data;

    // Step 1: extraer datos y contar imágenes
    const datosBasicos = await step.run('extraer-datos', async () => {
      const { extraerDatosPropiedad } = await import('../tools/propertyIngestionTools.js');
      const datos = await extraerDatosPropiedad(url);
      return {
        titulo: datos.titulo,
        precio: datos.precio,
        habitaciones: datos.habitaciones,
        banos: datos.banos,
        m2: datos.m2,
        textoLimpio: datos.textoLimpio.slice(0, 1000),
        imagenes: datos.imagenes,
        urlOriginal: url,
        totalImagenes: datos.imagenes.length,
      };
    });

    console.log(`[Solena Inngest] Imágenes extraídas: ${datosBasicos.totalImagenes}`);

    // Step 2: ingesta completa
    const result = await step.run('ingerir-propiedad-solena', async () => {
      return await ingerirPropiedadSolena(url, slug);
    });

    return { ...result, debug: { imagenesEncontradas: datosBasicos.totalImagenes } };
  }
);

// ─── Reel Intel: competencia → patrones → plan de contenido ──
export const reelIntel = inngest.createFunction(
  {
    id: 'reel-intel',
    triggers: [{ event: 'reels/intel' }],
    concurrency: { limit: 1, key: 'event.data.marca' },
    timeouts: { finish: '30m' },
  },
  async ({ event, step }: any) => {
    const RI = await import('../tools/reelIntelTools.js');
    const marca = event.data.marca as 'tem' | 'solena' | 'smc';
    const nGuiones = Number(event.data.nGuiones || 6);
    const soloFuente: string | undefined = event.data.fuenteId;

    const runId = await step.run('crear-run', () => RI.crearRun(marca));

    try {
      const fuentes = await step.run('cargar-fuentes', async () => {
        let q = RI.getSupabase().from('ig_fuentes').select('*').eq('marca', marca).eq('activa', true);
        if (soloFuente) q = q.eq('id', soloFuente);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return data || [];
      });
      if (!fuentes.length) {
        await RI.cerrarRun(runId, 'error', 'Sin fuentes activas');
        return { marca, aviso: 'Sin fuentes activas' };
      }

      // Un step por fuente: si una falla, Inngest reintenta solo esa
      let scrapeados = 0;
      let descubiertas = 0;
      for (let i = 0; i < fuentes.length; i++) {
        const f = fuentes[i];
        await RI.marcarPaso(runId, `Escaneando fuente ${i + 1}/${fuentes.length}: ${f.tipo === 'cuenta' ? '@' : f.tipo === 'hashtag' ? '#' : '📍'}${f.valor}`);
        const resultado = await step.run(`scrape-${f.tipo}-${f.valor}`, async () => {
          const reels = await RI.scrapeFuente(f, Number(event.data.limite || 30));
          await RI.guardarReels(reels);
          await RI.getSupabase().from('ig_fuentes').update({ ultimo_scrape: new Date().toISOString() }).eq('id', f.id);
          // Las fuentes de hashtag/zona no apuntan a una cuenta conocida: de sus
          // resultados, registra como nuevas fuentes 'cuenta' (auto) a quien más
          // impacto tuvo, para que el sistema siga descubriendo competidores solo.
          const nuevas = await RI.descubrirCuentas(f, reels);
          return { n: reels.length, nuevas };
        });
        scrapeados += resultado.n;
        descubiertas += resultado.nuevas;
      }

      await RI.marcarPaso(runId, 'Recalculando puntuaciones (outlier score)');
      await step.run('recalcular-scores', () => RI.recalcularScores(marca));

      // Un step por reel ganador para no chocar con el límite de tiempo
      const pendientes = await step.run('top-sin-analizar', async () =>
        (await RI.topReels(marca, Number(event.data.topN || 10), true)).map(r => r.id),
      );
      for (let i = 0; i < pendientes.length; i++) {
        const id = pendientes[i];
        await RI.marcarPaso(runId, `Analizando reel ganador ${i + 1}/${pendientes.length}`);
        await step.run(`analizar-${id}`, async () => {
          const sb = RI.getSupabase();
          const { data: r } = await sb.from('ig_reels').select('*').eq('id', id).single();
          const analisis = await RI.analizarReel(r);
          await sb.from('ig_reels').update({ analisis, analizado: true }).eq('id', id);
          return true;
        });
      }

      await RI.marcarPaso(runId, 'Extrayendo patrones comunes');
      const patron = await step.run('extraer-patrones', () => RI.extraerPatrones(marca));

      await RI.marcarPaso(runId, `Generando ${nGuiones} guiones`);
      const propiedades: string[] = event.data.propiedades || [];
      const guiones = await step.run('generar-plan', () => RI.generarPlan(marca, patron.id, nGuiones, propiedades));

      await RI.cerrarRun(runId, 'completado');
      return { marca, fuentes: fuentes.length, scrapeados, descubiertas, analizados: pendientes.length, patronId: patron.id, guiones };
    } catch (e: any) {
      await RI.cerrarRun(runId, 'error', e.message || String(e));
      throw e;
    }
  },
);

// Cron semanal: lunes 07:00 (Madrid) lanza el pipeline para cada marca con fuentes activas
export const reelIntelSemanal = inngest.createFunction(
  { id: 'reel-intel-semanal', triggers: [{ cron: 'TZ=Europe/Madrid 0 7 * * 1' }] },
  async ({ step }: any) => {
    const marcas = await step.run('marcas-activas', async () => {
      const { getSupabase } = await import('../tools/reelIntelTools.js');
      const { data } = await getSupabase().from('ig_fuentes').select('marca').eq('activa', true);
      return [...new Set((data || []).map((d: any) => d.marca))];
    });
    if (marcas.length) {
      await step.sendEvent('lanzar-por-marca', marcas.map((marca: string) => ({ name: 'reels/intel', data: { marca } })));
    }
    return { marcas };
  },
);
