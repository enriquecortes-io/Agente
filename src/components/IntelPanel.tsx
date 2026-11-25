'use client';

// ═══════════════════════════════════════════════════════════════
// Pestaña INTELIGENCIA — fusiona Análisis de competencia + Contenido
// Fuentes → Ranking de reels → Patrones → Plan de guiones → Copy propiedad
// ═══════════════════════════════════════════════════════════════
import { useEffect, useState, type ReactNode } from 'react';

type Marca = 'tem' | 'solena' | 'smc';
type Sub = 'fuentes' | 'ranking' | 'patrones' | 'plan' | 'copy';

interface Theme { accent: string; dark: string; surface: string; surface2: string; border: string; cream: string; muted: string; }

const SUBS: [Sub, string][] = [
  ['fuentes', 'Fuentes'],
  ['ranking', 'Ranking reels'],
  ['patrones', 'Patrones'],
  ['plan', 'Plan de contenido'],
  ['copy', 'Copy propiedad'],
];
const ESTADOS = ['idea', 'aprobado', 'grabado', 'publicado', 'descartado'];

const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n ?? 0);

export default function IntelPanel({ marca, theme, children }: { marca: Marca; theme: Theme; children?: ReactNode }) {
  const T = theme;
  const [sub, setSub] = useState<Sub>('ranking');
  const [data, setData] = useState<any>({ fuentes: [], reels: [], patron: null, plan: [], run: null });
  const [cargando, setCargando] = useState(false);
  const [lanzando, setLanzando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [nuevaTipo, setNuevaTipo] = useState<'cuenta' | 'hashtag' | 'zona'>('zona');
  const [nuevaValor, setNuevaValor] = useState('');
  const [nGuiones, setNGuiones] = useState(6);
  const [abierto, setAbierto] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    try {
      const res = await fetch(`/api/admin/intel?marca=${marca}`);
      const d = await res.json();
      if (d.error) setAviso(d.error); else setData(d);
    } catch { setAviso('Error cargando datos'); }
    setCargando(false);
  }
  useEffect(() => { cargar(); }, [marca]);

  // Mientras haya una ejecución en curso, sondea cada 4s para refrescar la barra de estado.
  useEffect(() => {
    if (data.run?.estado !== 'en_curso') return;
    const t = setInterval(cargar, 4000);
    return () => clearInterval(t);
  }, [data.run?.estado, marca]);

  async function lanzar() {
    setLanzando(true); setAviso('');
    const res = await fetch('/api/admin/intel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marca, nGuiones }),
    });
    const d = await res.json();
    setAviso(d.mensaje || d.error || '');
    setLanzando(false);
    setTimeout(cargar, 1500); // el run tarda ~1s en crearse en Inngest
  }

  async function addFuente() {
    if (!nuevaValor.trim()) return;
    const res = await fetch('/api/admin/intel/fuentes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marca, tipo: nuevaTipo, valor: nuevaValor }),
    });
    const d = await res.json();
    if (d.error) setAviso(d.error);
    setNuevaValor(''); cargar();
  }
  async function toggleFuente(id: string, activa: boolean) {
    await fetch('/api/admin/intel/fuentes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, activa }) });
    cargar();
  }
  async function borrarFuente(id: string) {
    if (!confirm('¿Eliminar esta fuente? Los reels ya guardados se conservan.')) return;
    await fetch(`/api/admin/intel/fuentes?id=${id}`, { method: 'DELETE' });
    cargar();
  }
  async function cambiarEstado(id: string, estado: string) {
    await fetch('/api/admin/intel/plan', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, estado }) });
    cargar();
  }

  const label = { fontSize: '10px', letterSpacing: '0.15em', color: T.muted, textTransform: 'uppercase' as const };
  const btn = { background: T.accent, color: T.dark, border: 'none', borderRadius: '4px', padding: '10px 18px', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase' as const, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' as const };
  const ghost = { background: 'none', border: `1px solid ${T.border}`, borderRadius: '4px', padding: '6px 10px', color: T.muted, fontSize: '11px', cursor: 'pointer' };
  const P = data.patron?.patrones;

  return (
    <div>
      {/* Cabecera: lanzar pipeline */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', borderBottom: `1px solid ${T.border}`, paddingBottom: '20px', marginBottom: '20px' }}>
        <div>
          <div style={label}>Inteligencia de contenido</div>
          <div style={{ fontSize: '12px', color: T.muted, marginTop: '6px' }}>
            {data.fuentes.filter((f: any) => f.activa).length} fuentes activas
            {' '}({data.fuentes.filter((f: any) => f.activa && f.origen === 'auto').length} descubiertas solas)
            {' '}· {data.reels.length} reels en ranking · se actualiza solo cada lunes 07:00
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select value={nGuiones} onChange={e => setNGuiones(Number(e.target.value))} style={{ width: 'auto' }}>
            {[3, 6, 10].map(n => <option key={n} value={n}>{n} guiones</option>)}
          </select>
          <button onClick={lanzar} disabled={lanzando || data.run?.estado === 'en_curso' || !data.fuentes.length} style={{ ...btn, opacity: data.fuentes.length ? 1 : 0.4 }}>
            {lanzando ? 'Lanzando…' : data.run?.estado === 'en_curso' ? 'En curso…' : 'Analizar y generar plan'}
          </button>
          <button onClick={cargar} style={ghost}>{cargando ? '…' : '↻'}</button>
        </div>
      </div>
      {data.run?.estado === 'en_curso' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '10px 14px', marginBottom: '16px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: T.accent, flexShrink: 0, animation: 'pulse 1.4s ease-in-out infinite' }} />
          <span style={{ fontSize: '12px', color: T.cream }}>{data.run.paso || 'Trabajando…'}</span>
          <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }`}</style>
        </div>
      )}
      {data.run?.estado === 'error' && (
        <div style={{ fontSize: '12px', color: '#e06c6c', background: T.surface, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '10px 14px', marginBottom: '16px' }}>
          Última ejecución falló: {data.run.error || 'error desconocido'}
        </div>
      )}
      {aviso && <div style={{ fontSize: '12px', color: T.accent, marginBottom: '16px' }}>{aviso}</div>}

      {/* Sub-pestañas */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, marginBottom: '24px', overflowX: 'auto' }}>
        {SUBS.map(([id, txt]) => (
          <button key={id} onClick={() => setSub(id)} style={{ background: 'none', border: 'none', borderBottom: sub === id ? `2px solid ${T.accent}` : '2px solid transparent', padding: '8px 14px', color: sub === id ? T.accent : T.muted, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', marginBottom: '-1px', whiteSpace: 'nowrap' }}>
            {txt}
          </button>
        ))}
      </div>

      {/* FUENTES */}
      {sub === 'fuentes' && (
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
            <select value={nuevaTipo} onChange={e => setNuevaTipo(e.target.value as any)} style={{ width: '130px' }}>
              <option value='zona'>Zona</option>
              <option value='hashtag'>Hashtag</option>
              <option value='cuenta'>Cuenta</option>
            </select>
            <input value={nuevaValor} onChange={e => setNuevaValor(e.target.value)} onKeyDown={e => e.key === 'Enter' && addFuente()}
              placeholder={nuevaTipo === 'zona' ? 'Marbella, Costa del Sol…' : nuevaTipo === 'cuenta' ? '@competidor o URL del perfil' : '#marbellarealestate'} />
            <button onClick={addFuente} style={btn}>Añadir</button>
          </div>
          <div style={{ fontSize: '11px', color: T.muted, marginTop: '-14px', marginBottom: '20px' }}>
            Con una zona u hashtag no necesitas buscar competidores: el sistema rastrea el sector ahí y añade solo (marcadas <span style={{ color: T.accent }}>auto</span>) las cuentas con reels de más impacto que encuentre.
          </div>
          {data.fuentes.map((f: any) => (
            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.border}`, padding: '12px 0', opacity: f.activa ? 1 : 0.45 }}>
              <div>
                <span style={{ color: T.cream, fontSize: '13px' }}>{f.tipo === 'cuenta' ? '@' : f.tipo === 'hashtag' ? '#' : '📍'}{f.valor}</span>
                {f.origen === 'auto' && <span style={{ color: T.accent, fontSize: '10px', marginLeft: '8px', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>auto</span>}
                <span style={{ color: T.muted, fontSize: '11px', marginLeft: '12px' }}>
                  {f.ultimo_scrape ? `último scrape ${new Date(f.ultimo_scrape).toLocaleDateString('es-ES')}` : 'sin scrapear'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => toggleFuente(f.id, !f.activa)} style={ghost}>{f.activa ? 'Pausar' : 'Activar'}</button>
                <button onClick={() => borrarFuente(f.id)} style={ghost}>✕</button>
              </div>
            </div>
          ))}
          {!data.fuentes.length && <div style={{ color: T.muted, fontSize: '13px', padding: '32px 0', textAlign: 'center' }}>Añade una zona (ej. "Marbella") o un hashtag del sector para que el sistema empiece a descubrir reels y cuentas por sí mismo.</div>}
        </div>
      )}

      {/* RANKING */}
      {sub === 'ranking' && (
        <div>
          <div style={{ fontSize: '12px', color: T.muted, marginBottom: '16px' }}>
            Ordenado por <span style={{ color: T.cream }}>×media</span>: cuántas veces superó el reel a lo normal en su cuenta.
          </div>
          {data.reels.map((r: any, i: number) => (
            <div key={r.id} style={{ borderBottom: `1px solid ${T.border}`, padding: '14px 0' }}>
              <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{ width: '22px', color: T.muted, fontSize: '12px', paddingTop: '2px' }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <a href={r.url} target='_blank' rel='noreferrer' style={{ color: T.cream, fontSize: '13px', textDecoration: 'none' }}>@{r.owner} ↗</a>
                    <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: T.muted }}>
                      <span style={{ color: T.accent, fontWeight: 500 }}>×{Number(r.outlier_score).toFixed(1)}</span>
                      <span>{fmt(r.views)} views</span>
                      <span>{(Number(r.engagement_rate) * 100).toFixed(1)}% ER</span>
                      <span>{r.duracion_seg ?? '?'}s</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: T.muted, marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.caption}</div>
                  {r.analisis && (
                    <button onClick={() => setAbierto(abierto === r.id ? null : r.id)} style={{ ...ghost, border: 'none', padding: '6px 0', color: T.accent }}>
                      {abierto === r.id ? 'Ocultar desglose' : `${r.analisis.formato} · ${r.analisis.tipo_gancho} →`}
                    </button>
                  )}
                  {abierto === r.id && r.analisis && (
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '14px', fontSize: '12px', lineHeight: 1.7, color: T.cream, marginTop: '6px' }}>
                      <div><b>Gancho:</b> {r.analisis.gancho}</div>
                      <div><b>Estructura:</b> {(r.analisis.estructura || []).join(' → ')}</div>
                      <div><b>Texto en pantalla:</b> {r.analisis.texto_en_pantalla}</div>
                      <div><b>CTA:</b> {r.analisis.cta}</div>
                      <div style={{ color: T.muted, marginTop: '6px' }}>{r.analisis.por_que_funciona}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {!data.reels.length && <div style={{ color: T.muted, fontSize: '13px', padding: '32px 0', textAlign: 'center' }}>Sin reels todavía. Añade fuentes y pulsa "Analizar y generar plan".</div>}
        </div>
      )}

      {/* PATRONES */}
      {sub === 'patrones' && (
        P ? (
          <div style={{ fontSize: '13px', lineHeight: 1.8, color: T.cream }}>
            <div style={{ fontSize: '11px', color: T.muted, marginBottom: '12px' }}>Basado en {data.patron.reels_base?.length || 0} reels · {new Date(data.patron.created_at).toLocaleDateString('es-ES')}</div>
            <p style={{ marginTop: 0 }}>{P.resumen}</p>
            <Bloque t='Ganchos ganadores' T={T}>{(P.ganchos_ganadores || []).map((g: any, i: number) => <div key={i}>• <b>{g.patron}</b> — <span style={{ color: T.muted }}>{g.ejemplo}</span></div>)}</Bloque>
            <Bloque t='Formatos' T={T}>{(P.formatos_ganadores || []).map((f: any, i: number) => <div key={i}>• <b>{f.formato}</b> — <span style={{ color: T.muted }}>{f.por_que}</span></div>)}</Bloque>
            <Bloque t='Estructura tipo' T={T}>{(P.estructura_tipo || []).map((s: string, i: number) => <div key={i}>{s}</div>)}</Bloque>
            <Bloque t='Duración óptima' T={T}>{P.duracion_optima_seg?.min}–{P.duracion_optima_seg?.max} s</Bloque>
            <Bloque t='CTAs que funcionan' T={T}>{(P.ctas_que_funcionan || []).join(' · ')}</Bloque>
            <Bloque t='Evitar' T={T}>{(P.evitar || []).join(' · ')}</Bloque>
            <Bloque t='Adaptación a la marca' T={T}>{P.adaptacion_a_marca}</Bloque>
          </div>
        ) : <div style={{ color: T.muted, fontSize: '13px', padding: '32px 0', textAlign: 'center' }}>Aún no hay patrones. Se generan al final del pipeline.</div>
      )}

      {/* PLAN */}
      {sub === 'plan' && (
        <div>
          {data.plan.map((g: any) => (
            <div key={g.id} style={{ border: `1px solid ${T.border}`, borderRadius: '4px', padding: '16px', marginBottom: '12px', background: T.surface }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <div>
                  <div style={{ color: T.cream, fontSize: '14px' }}>{g.titulo}</div>
                  <div style={{ color: T.muted, fontSize: '11px', marginTop: '4px' }}>{g.formato} · {g.duracion_seg ?? '?'} s</div>
                </div>
                <select value={g.estado} onChange={e => cambiarEstado(g.id, e.target.value)} style={{ width: 'auto', fontSize: '11px', padding: '6px 10px' }}>
                  {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ color: T.accent, fontSize: '13px', marginBottom: '10px' }}>“{g.gancho}”</div>
              <button onClick={() => setAbierto(abierto === g.id ? null : g.id)} style={{ ...ghost, border: 'none', padding: 0 }}>
                {abierto === g.id ? 'Ocultar guion' : 'Ver guion completo →'}
              </button>
              {abierto === g.id && (
                <div style={{ marginTop: '12px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead><tr>{['Seg', 'Plano', 'Texto pantalla', 'Voz'].map(h => <th key={h} style={{ ...label, textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${T.border}` }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {(g.guion || []).map((s: any, i: number) => (
                        <tr key={i}>
                          {[s.seg, s.plano, s.texto_pantalla, s.voz].map((c, j) => <td key={j} style={{ padding: '8px', borderBottom: `1px solid ${T.border}`, color: j === 0 ? T.muted : T.cream, verticalAlign: 'top' }}>{c}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ ...label, marginTop: '14px', marginBottom: '6px' }}>Caption</div>
                  <div style={{ fontSize: '12px', lineHeight: 1.7, color: T.cream, whiteSpace: 'pre-wrap' }}>{g.caption}{'\n\n'}{(g.hashtags || []).join(' ')}</div>
                  <button onClick={() => navigator.clipboard.writeText(`${g.caption}\n\n${(g.hashtags || []).join(' ')}`)} style={{ ...ghost, marginTop: '8px' }}>Copiar caption</button>
                </div>
              )}
            </div>
          ))}
          {!data.plan.length && <div style={{ color: T.muted, fontSize: '13px', padding: '32px 0', textAlign: 'center' }}>Sin guiones todavía.</div>}
        </div>
      )}

      {/* COPY PROPIEDAD (el generador anterior de Contenido) */}
      {sub === 'copy' && children}
    </div>
  );
}

function Bloque({ t, T, children }: { t: string; T: Theme; children: ReactNode }) {
  return (
    <div style={{ borderTop: `1px solid ${T.border}`, padding: '14px 0' }}>
      <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: T.muted, textTransform: 'uppercase', marginBottom: '8px' }}>{t}</div>
      <div>{children}</div>
    </div>
  );
}
