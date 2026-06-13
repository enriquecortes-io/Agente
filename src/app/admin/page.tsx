'use client';

import { useState, useEffect } from 'react';

const ACCENT = '#0066FF';
const BG = '#0a0a0a';
const SURFACE = '#111111';
const BORDER = '#1a1a1a';
const TEXT = '#e8e8e8';
const MUTED = '#555555';

const tabs = ['Chat', 'Leads', 'Competencia', 'Publicaciones', 'Conversaciones', 'Métricas'];

export default function AdminPage() {
 const [activeTab, setActiveTab] = useState('Chat');
 const [messages, setMessages] = useState<{role: string, content: string}[]>([]);
 const [input, setInput] = useState('');
 const [loading, setLoading] = useState(false);
 const [leads, setLeads] = useState<any[]>([]);
 const [competencia, setCompetencia] = useState<any[]>([]);
 const [publicaciones, setPublicaciones] = useState<any[]>([]);
 const [propForm, setPropForm] = useState({ titulo: '', precio: '', zona: '', habitaciones: '', m2: '', slug: '', descripcion: '' });
 const [generando, setGenerando] = useState(false);
 const [copyResult, setCopyResult] = useState<any>(null);
 const [competidorUsername, setCompetidorUsername] = useState('');
 const [analizando, setAnalizando] = useState(false);

 const apiKey = process.env.NEXT_PUBLIC_AGENT_KEY || '';

 useEffect(() => {
   if (activeTab === 'Leads') fetchLeads();
   if (activeTab === 'Competencia') fetchCompetencia();
   if (activeTab === 'Publicaciones') fetchPublicaciones();
 }, [activeTab]);

 async function fetchLeads() {
   const res = await fetch('/api/admin/leads');
   const data = await res.json();
   setLeads(data.leads || []);
 }

 async function fetchCompetencia() {
   const res = await fetch('/api/admin/competencia');
   const data = await res.json();
   setCompetencia(data.analisis || []);
 }

 async function fetchPublicaciones() {
   const res = await fetch('/api/admin/publicaciones');
   const data = await res.json();
   setPublicaciones(data.publicaciones || []);
 }

 async function sendMessage() {
   if (!input.trim()) return;
   const userMsg = { role: 'user', content: input };
   setMessages(prev => [...prev, userMsg]);
   setInput('');
   setLoading(true);
   try {
     const res = await fetch('/api/chat', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'x-agent-key': apiKey },
       body: JSON.stringify({ messages: [...messages, userMsg] }),
     });
     const data = await res.json();
     setMessages(prev => [...prev, { role: 'assistant', content: data.message || 'Sin respuesta' }]);
   } catch {
     setMessages(prev => [...prev, { role: 'assistant', content: 'Error de conexión.' }]);
   }
   setLoading(false);
 }

 async function generarPublicacion() {
   setGenerando(true);
   setCopyResult(null);
   try {
     const res = await fetch('/api/content', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ propiedad: { ...propForm, precio: Number(propForm.precio), habitaciones: Number(propForm.habitaciones), m2: Number(propForm.m2) } }),
     });
     const data = await res.json();
     setCopyResult(data);
   } catch {
     setCopyResult({ error: 'Error generando publicación' });
   }
   setGenerando(false);
 }

 async function analizarCompetidor() {
   if (!competidorUsername.trim()) return;
   setAnalizando(true);
   try {
     const res = await fetch('/api/admin/analizar', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ username: competidorUsername }),
     });
     const data = await res.json();
     alert(`Análisis completado: ${data.reels} reels analizados`);
     fetchCompetencia();
   } catch {
     alert('Error analizando competidor');
   }
   setAnalizando(false);
   setCompetidorUsername('');
 }

 const s = {
   page: { background: BG, minHeight: '100vh', fontFamily: "'Georgia', serif", color: TEXT },
   header: { borderBottom: `1px solid ${BORDER}`, padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
   logo: { fontSize: '11px', letterSpacing: '4px', textTransform: 'uppercase' as const, color: ACCENT },
   nav: { display: 'flex', gap: '0' },
   tab: (active: boolean) => ({ padding: '20px 24px', fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase' as const, cursor: 'pointer', color: active ? ACCENT : MUTED, background: 'none', border: 'none', borderBottom: active ? `2px solid ${ACCENT}` : '2px solid transparent' }),
   content: { padding: '32px' },
   card: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '4px', padding: '24px', marginBottom: '16px' },
   label: { fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase' as const, color: MUTED, marginBottom: '8px', display: 'block' },
   value: { fontSize: '15px', color: TEXT },
   input: { background: '#0f0f0f', border: `1px solid ${BORDER}`, borderRadius: '4px', padding: '12px 16px', color: TEXT, fontSize: '14px', fontFamily: 'Georgia, serif', width: '100%', outline: 'none' },
   btn: { background: ACCENT, color: '#fff', border: 'none', borderRadius: '4px', padding: '12px 24px', fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase' as const, cursor: 'pointer' },
   btnOutline: { background: 'none', color: ACCENT, border: `1px solid ${ACCENT}`, borderRadius: '4px', padding: '10px 20px', fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase' as const, cursor: 'pointer' },
   chatBubble: (role: string) => ({ background: role === 'user' ? '#0a1628' : SURFACE, border: `1px solid ${role === 'user' ? '#0033aa' : BORDER}`, borderRadius: '4px', padding: '16px', marginBottom: '12px', maxWidth: '80%', alignSelf: role === 'user' ? 'flex-end' : 'flex-start' }),
   grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
   badge: (color: string) => ({ background: color + '22', color: color, border: `1px solid ${color}44`, borderRadius: '2px', padding: '2px 8px', fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase' as const }),
 };

 return (
   <div style={s.page}>
     <div style={s.header}>
       <span style={s.logo}>Harvis — Admin</span>
       <nav style={s.nav}>
         {tabs.map(t => (
           <button key={t} style={s.tab(activeTab === t)} onClick={() => setActiveTab(t)}>{t}</button>
         ))}
       </nav>
     </div>

     <div style={s.content}>

       {/* CHAT */}
       {activeTab === 'Chat' && (
         <div>
           <div style={{ display: 'flex', flexDirection: 'column', gap: '0', minHeight: '60vh', marginBottom: '24px' }}>
             {messages.length === 0 && (
               <div style={{ textAlign: 'center', padding: '80px 0', color: MUTED }}>
                 <div style={{ fontSize: '11px', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '8px' }}>Harvis</div>
                 <div style={{ fontSize: '13px' }}>Escribe un mensaje para comenzar</div>
               </div>
             )}
             {messages.map((m, i) => (
               <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '12px' }}>
                 <div style={s.chatBubble(m.role)}>
                   <div style={{ fontSize: '10px', letterSpacing: '2px', color: m.role === 'user' ? ACCENT : MUTED, marginBottom: '6px', textTransform: 'uppercase' }}>
                     {m.role === 'user' ? 'Tú' : 'Harvis'}
                   </div>
                   <div style={{ fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{m.content}</div>
                 </div>
               </div>
             ))}
             {loading && (
               <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
                 <div style={s.chatBubble('assistant')}>
                   <div style={{ color: MUTED, fontSize: '13px' }}>Harvis está pensando...</div>
                 </div>
               </div>
             )}
           </div>
           <div style={{ display: 'flex', gap: '12px' }}>
             <input
               style={s.input}
               value={input}
               onChange={e => setInput(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && sendMessage()}
               placeholder="Escribe un mensaje..."
             />
             <button style={s.btn} onClick={sendMessage}>Enviar</button>
           </div>
         </div>
       )}

       {/* LEADS */}
       {activeTab === 'Leads' && (
         <div>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
             <div style={{ fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase', color: MUTED }}>{leads.length} leads</div>
             <button style={s.btnOutline} onClick={fetchLeads}>Actualizar</button>
           </div>
           {leads.map((lead, i) => (
             <div key={i} style={s.card}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                 <div>
                   <div style={{ fontSize: '16px', marginBottom: '4px' }}>{lead.name}</div>
                   <div style={{ fontSize: '12px', color: MUTED }}>{lead.email}</div>
                 </div>
                 <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                   {lead.score > 0 && <span style={s.badge(ACCENT)}>Score {lead.score}</span>}
                   {lead.urgencia && <span style={s.badge(lead.urgencia === 'alta' ? '#ff4444' : lead.urgencia === 'media' ? '#ffaa00' : MUTED)}>{lead.urgencia}</span>}
                   <span style={s.badge(lead.estado === 'perdido' ? '#ff4444' : lead.estado === 'frio' ? MUTED : '#00cc66')}>{lead.estado || 'activo'}</span>
                 </div>
               </div>
               <div style={s.grid}>
                 <div><span style={s.label}>Presupuesto</span><span style={s.value}>{lead.horizon || '—'}</span></div>
                 <div><span style={s.label}>Motivación</span><span style={s.value}>{lead.motivacion || '—'}</span></div>
               </div>
             </div>
           ))}
         </div>
       )}

       {/* COMPETENCIA */}
       {activeTab === 'Competencia' && (
         <div>
           <div style={{ ...s.card, marginBottom: '32px' }}>
             <span style={s.label}>Analizar nuevo competidor</span>
             <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
               <input
                 style={s.input}
                 value={competidorUsername}
                 onChange={e => setCompetidorUsername(e.target.value)}
                 placeholder="@username de Instagram"
               />
               <button style={s.btn} onClick={analizarCompetidor} disabled={analizando}>
                 {analizando ? 'Analizando...' : 'Analizar'}
               </button>
             </div>
           </div>
           {competencia.map((c, i) => (
             <div key={i} style={s.card}>
               <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                 <div style={{ fontSize: '15px' }}>@{c.username}</div>
                 <span style={s.badge(ACCENT)}>{c.reels_analizados} reels</span>
               </div>
               <div style={{ fontSize: '12px', color: MUTED }}>{new Date(c.created_at).toLocaleDateString('es-ES')}</div>
               {c.analisis_raw && (
                 <details style={{ marginTop: '12px' }}>
                   <summary style={{ fontSize: '11px', letterSpacing: '2px', color: ACCENT, cursor: 'pointer', textTransform: 'uppercase' }}>Ver análisis</summary>
                   <div style={{ marginTop: '12px', fontSize: '13px', lineHeight: '1.7', color: '#aaa', whiteSpace: 'pre-wrap' }}>{c.analisis_raw.slice(0, 1000)}...</div>
                 </details>
               )}
             </div>
           ))}
         </div>
       )}

       {/* PUBLICACIONES */}
       {activeTab === 'Publicaciones' && (
         <div>
           <div style={{ ...s.card, marginBottom: '32px' }}>
             <span style={s.label}>Generar nueva publicación</span>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
               {[['titulo','Título'],['precio','Precio (€)'],['zona','Zona'],['habitaciones','Habitaciones'],['m2','m²'],['slug','Slug URL']].map(([key, label]) => (
                 <div key={key}>
                   <span style={s.label}>{label}</span>
                   <input style={s.input} value={(propForm as any)[key]} onChange={e => setPropForm(p => ({...p, [key]: e.target.value}))} />
                 </div>
               ))}
               <div style={{ gridColumn: '1 / -1' }}>
                 <span style={s.label}>Descripción</span>
                 <textarea style={{...s.input, height: '80px', resize: 'vertical'}} value={propForm.descripcion} onChange={e => setPropForm(p => ({...p, descripcion: e.target.value}))} />
               </div>
             </div>
             <button style={{...s.btn, marginTop: '16px'}} onClick={generarPublicacion} disabled={generando}>
               {generando ? 'Generando...' : 'Generar publicación'}
             </button>
           </div>

           {copyResult && !copyResult.error && (
             <div style={s.card}>
               <div style={{ marginBottom: '24px' }}>
                 <span style={s.label}>Hook</span>
                 <div style={{ fontSize: '20px', color: ACCENT }}>{copyResult.hook}</div>
               </div>
               <div style={{ marginBottom: '24px' }}>
                 <span style={s.label}>Instagram</span>
                 <div style={{ fontSize: '13px', lineHeight: '1.7', whiteSpace: 'pre-wrap', background: '#0f0f0f', padding: '16px', borderRadius: '4px' }}>{copyResult.instagram}</div>
                 <button style={{...s.btnOutline, marginTop: '8px'}} onClick={() => navigator.clipboard.writeText(copyResult.instagram)}>Copiar</button>
               </div>
               <div style={{ marginBottom: '24px' }}>
                 <span style={s.label}>LinkedIn</span>
                 <div style={{ fontSize: '13px', lineHeight: '1.7', whiteSpace: 'pre-wrap', background: '#0f0f0f', padding: '16px', borderRadius: '4px' }}>{copyResult.linkedin}</div>
                 <button style={{...s.btnOutline, marginTop: '8px'}} onClick={() => navigator.clipboard.writeText(copyResult.linkedin)}>Copiar</button>
               </div>
               <div>
                 <span style={s.label}>Hashtags</span>
                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                   {copyResult.hashtags?.map((h: string) => <span key={h} style={s.badge(ACCENT)}>{h}</span>)}
                 </div>
               </div>
             </div>
           )}

           <div style={{ marginTop: '32px' }}>
             <div style={{ fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase', color: MUTED, marginBottom: '16px' }}>Historial</div>
             {publicaciones.map((p, i) => (
               <div key={i} style={s.card}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                   <div style={{ fontSize: '14px' }}>{p.propiedad_slug}</div>
                   <div style={{ fontSize: '11px', color: MUTED }}>{new Date(p.created_at).toLocaleDateString('es-ES')}</div>
                 </div>
                 <div style={{ fontSize: '12px', color: MUTED }}>{p.copy_instagram?.slice(0, 100)}...</div>
               </div>
             ))}
           </div>
         </div>
       )}

       {/* CONVERSACIONES */}
       {activeTab === 'Conversaciones' && (
         <div style={{ textAlign: 'center', padding: '80px 0', color: MUTED }}>
           <div style={{ fontSize: '11px', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '8px' }}>Próximamente</div>
           <div style={{ fontSize: '13px' }}>Historial de conversaciones con clientes</div>
         </div>
       )}

       {/* MÉTRICAS */}
       {activeTab === 'Métricas' && (
         <div style={{ textAlign: 'center', padding: '80px 0', color: MUTED }}>
           <div style={{ fontSize: '11px', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '8px' }}>Próximamente</div>
           <div style={{ fontSize: '13px' }}>Dashboard de métricas y conversiones</div>
         </div>
       )}

     </div>
   </div>
 );
}
