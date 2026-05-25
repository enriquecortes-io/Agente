import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

export interface ScoreData {
  nombre: string;
  presupuesto?: number;
  urgencia?: 'alta' | 'media' | 'baja';
  motivacion?: 'inversor' | 'reubicacion' | 'segunda_residencia';
  tieneEmail?: boolean;
  tieneTelefono?: boolean;
  visitaAgendada?: boolean;
}

export function calcularScore(data: ScoreData): number {
  let score = 0;

  // Base por presupuesto
  if (data.presupuesto) {
    if (data.presupuesto >= 10_000_000) score += 100;
    else if (data.presupuesto >= 5_000_000) score += 70;
    else if (data.presupuesto >= 3_000_000) score += 50;
    else if (data.presupuesto >= 1_000_000) score += 30;
    else score += 10;
  }

  // Multiplicador urgencia
  const multUrgencia = data.urgencia === 'alta' ? 2 : data.urgencia === 'media' ? 1.5 : 1;
  score = Math.round(score * multUrgencia);

  // Multiplicador motivación
  const multMotivacion = data.motivacion === 'inversor' ? 1.8 : data.motivacion === 'reubicacion' ? 1.5 : 1.2;
  score = Math.round(score * multMotivacion);

  // Bonus contacto
  if (data.tieneEmail) score += 15;
  if (data.tieneTelefono) score += 10;
  if (data.visitaAgendada) score += 30;

  return Math.min(score, 999); // cap en 999
}

export async function actualizarScoreLead(nombre: string, scoreData: ScoreData) {
  const score = calcularScore(scoreData);

  const { error } = await supabase
    .from('leads')
    .update({
      score,
      urgencia: scoreData.urgencia,
      motivacion: scoreData.motivacion,
      perfil_tipo: scoreData.motivacion,
    })
    .ilike('name', `%${nombre}%`);

  if (error) {
    console.error('[Scoring] Error:', error.message);
    return { success: false, error: error.message };
  }

  console.log(`[Scoring] ${nombre} → score ${score}`);
  return { success: true, score };
}

export async function getLeadsPriorizados() {
  const { data, error } = await supabase
    .from('leads')
    .select('name, email, phone, score, urgencia, motivacion, horizon, created_at')
    .order('score', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[Scoring] Error:', error.message);
    return [];
  }

  return data || [];
}
