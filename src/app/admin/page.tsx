'use client';

import { useState, useEffect } from 'react';

const ACCENT = '#1a56db';
const BG = '#f9fafb';
const SURFACE = '#ffffff';
const BORDER = '#e5e7eb';
const TEXT = '#111827';
const MUTED = '#6b7280';
const LIGHT = '#f3f4f6';

const tabs = [
 { id: 'Chat', icon: '💬' },
 { id: 'Leads', icon: '📋' },
 { id: 'Competencia', icon: '📊' },
 { id: 'Publicaciones', icon: '📝' },
 { id: 'Conversaciones', icon: '🗂' },
 { id: 'Métricas', icon: '📈' },
];

const quickActions = [
 'Resumen de leads de hoy',
 'Tendencias de la competencia',
 'Resumen de métodos',
 'Resumen de todos los contactos',
];

const apiKey = 'dda3fb2a36a29de06fa337e5a72b29638a12a0afea647e8fd14af556d76f0e1d';

export default function AdminPage() {
 const [activeTab, setActiveTab] = useState('Chat');
 const [messages, setMessages] = useState<{role: string, content: string}[]>([]);
 const [input, setInput] = useState('');
 const [loading, setLoading] = useState(false);
 const [leads, setLeads] = useState<any[]>([]);
 const [competencia, setCompetencia] = useState<any[]>([]);
 const [publicaciones, setPublicaciones] = useState<any[]>([]);
 const [propForm, setPropForm] = useState({ titulo: '', precio: '', zona: '', habitaciones: '', m2: '', slug: '', descripcion: '' });
  const [ingestUrl, setIngestUrl] = useState('');
  const [ingestando, setIngestando] = useState(false);
  const [ingestResult, setIngestResult] = useState<any>(null);
 const [generando, setGenerando] = useState(false);
 const [copyResult, setCopyResult] = useState<any>(null);
 const [competidorUsername, setCompetidorUsername] = useState('');
 const [analizando, setAnalizando] = useState(false);
 const [listening, setListening] = useState(false);

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

 async function sendMessage(text?: string) {
   const msg = text || input;
   if (!msg.trim()) return;
   const userMsg = { role: 'user', content: msg };
   const newMessages = [...messages, userMsg];
   setMessages(newMessages);
   setInput('');
   setLoading(true);
   try {
     const res = await fetch('/api/chat', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'x-agent-key': apiKey },
       body: JSON.stringify({ messages: newMessages }),
     });
     const contentType = res.headers.get('content-type') || '';
     if (contentType.includes('text/plain')) {
       const reader = res.body!.getReader();
       const decoder = new TextDecoder();
       let fullText = '';
       setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
       while (true) {
         const { done, value } = await reader.read();
         if (done) break;
         fullText += decoder.decode(value, { stream: true });
         setMessages(prev => {
           const updated = [...prev];
           updated[updated.length - 1] = { role: 'assistant', content: fullText };
           return updated;
         });
       }
     } else {
       const data = await res.json();
       setMessages(prev => [...prev, { role: 'assistant', content: data.message || 'Sin respuesta' }]);
     }
   } catch {
     setMessages(prev => [...prev, { role: 'assistant', content: 'Error de conexión.' }]);
   }
   setLoading(false);
 }

 function startListening() {
   const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
   if (!SpeechRecognition) return alert('Tu navegador no soporta dictado por voz');
   const recognition = new SpeechRecognition();
   recognition.lang = 'es-ES';
   recognition.onstart = () => setListening(true);
   recognition.onend = () => setListening(false);
   recognition.onresult = (e: any) => {
     const transcript = e.results[0][0].transcript;
     setInput(transcript);
   };
   recognition.start();
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
       body: JSON.stringify({ username: competidorUsername.replace('@', '') }),
     });
     const data = await res.json();
     alert(`✅ Análisis completado: ${data.reels} reels analizados`);
     fetchCompetencia();
   } catch {
     alert('Error analizando competidor');
   }
   setAnalizando(false);
   setCompetidorUsername('');
 }

 const s = {
   page: { background: BG, minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: TEXT },
   header: { background: SURFACE, borderBottom: `1px solid ${BORDER}`, padding: '0 20px', display: 'flex', alignItems: 'center', gap: '32px', position: 'sticky' as const, top: 0, zIndex: 100 },
   logo: { fontSize: '15px', fontWeight: '600', color: TEXT, padding: '16px 0', whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', gap: '8px' },
   nav: { display: 'flex', gap: '0', overflowX: 'auto' as const },
   tab: (active: boolean) => ({
     padding: '16px 16px',
     fontSize: '13px',
     fontWeight: active ? '600' : '400',
     cursor: 'pointer',
     color: active ? ACCENT : MUTED,
     background: 'none',
     border: 'none',
     borderBottom: active ? `2px solid ${ACCENT}` : '2px solid transparent',
     whiteSpace: 'nowrap' as const,
     display: 'flex',
     alignItems: 'center',
     gap: '6px',
   }),
   content: { padding: '24px 20px', maxWidth: '900px', margin: '0 auto' },
   card: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '20px', marginBottom: '12px' },
   label: { fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' as const, color: MUTED, marginBottom: '4px', letterSpacing: '0.5px', display: 'block' },
   input: { background: LIGHT, border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '10px 14px', color: TEXT, fontSize: '14px', width: '100%', outline: 'none', fontFamily: 'inherit' },
   btn: { background: ACCENT, color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 20px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' },
   btnOutline: { background: 'none', color: ACCENT, border: `1px solid ${ACCENT}`, borderRadius: '10px', padding: '8px 16px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
   badge: (color: string) => ({ background: color + '15', color: color, borderRadius: '6px', padding: '3px 10px', fontSize: '12px', fontWeight: '500' }),
   chatBubble: (role: string) => ({
     background: role === 'user' ? ACCENT : SURFACE,
     color: role === 'user' ? '#fff' : TEXT,
     border: role === 'user' ? 'none' : `1px solid ${BORDER}`,
     borderRadius: role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
     padding: '12px 16px',
     maxWidth: '75%',
     fontSize: '14px',
     lineHeight: '1.6',
     whiteSpace: 'pre-wrap' as const,
   }),
   quickBtn: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '20px', padding: '8px 16px', fontSize: '13px', color: TEXT, cursor: 'pointer', whiteSpace: 'nowrap' as const },
 };

 return (
   <div style={s.page}>
     {/* HEADER */}
     <div style={s.header}>
       <div style={s.logo}>
         <span>🏠</span> Harvis Admin
       </div>
       <nav style={s.nav}>
         {tabs.map(t => (
           <button key={t.id} style={s.tab(activeTab === t.id)} onClick={() => setActiveTab(t.id)}>
             <span>{t.icon}</span> {t.id}
           </button>
         ))}
       </nav>
     </div>

     <div style={s.content}>

       {/* CHAT */}
       {activeTab === 'Chat' && (
         <div>
           {messages.length === 0 ? (
             <div style={{ textAlign: 'center', padding: '48px 0 32px' }}>
               <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏠</div>
               <div style={{ fontSize: '22px', fontWeight: '600', marginBottom: '8px' }}>Harvis</div>
               <div style={{ fontSize: '14px', color: MUTED, marginBottom: '32px' }}>Escribe un mensaje para comenzar</div>
               <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '8px', justifyContent: 'center' }}>
                 {quickActions.map(a => (
                   <button key={a} style={s.quickBtn} onClick={() => sendMessage(a)}>{a}</button>
                 ))}
               </div>
             </div>
           ) : (
             <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '12px', paddingBottom: '120px' }}>
               {messages.map((m, i) => (
                 <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                   {m.role === 'assistant' && (
                     <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: ACCENT + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', marginRight: '8px', flexShrink: 0 }}>🏠</div>
                   )}
                   <div style={s.chatBubble(m.role)}>{m.content}</div>
                 </div>
               ))}
               {loading && (
                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                   <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: ACCENT + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🏠</div>
                   <div style={{ ...s.chatBubble('assistant'), color: MUTED }}>Escribiendo...</div>
                 </div>
               )}
             </div>
           )}

           {/* INPUT FIJO */}
           <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: SURFACE, borderTop: `1px solid ${BORDER}`, padding: '12px 20px' }}>
             <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
               <input
                 style={{ ...s.input, flex: 1 }}
                 value={input}
                 onChange={e => setInput(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && sendMessage()}
                 placeholder="Escribe un mensaje..."
               />
               <button style={{ background: listening ? '#ef4444' : LIGHT, border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '10px 12px', cursor: 'pointer', fontSize: '18px' }} onClick={startListening}>
                 🎤
               </button>
               <button style={s.btn} onClick={() => sendMessage()}>Enviar</button>
             </div>
           </div>
         </div>
       )}

       {/* LEADS */}
       {activeTab === 'Leads' && (
         <div>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
             <div style={{ fontSize: '20px', fontWeight: '600' }}>{leads.length} Leads</div>
             <button style={s.btnOutline} onClick={fetchLeads}>↻ Actualizar</button>
           </div>
           {leads.map((lead, i) => (
             <div key={i} style={s.card}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                 <div>
                   <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '2px' }}>{lead.name}</div>
                   <div style={{ fontSize: '13px', color: MUTED }}>{lead.email}</div>
                 </div>
                 <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const, justifyContent: 'flex-end' }}>
                   {lead.score > 0 && <span style={s.badge(ACCENT)}>Score {lead.score}</span>}
                   {lead.urgencia && <span style={s.badge(lead.urgencia === 'alta' ? '#ef4444' : lead.urgencia === 'media' ? '#f59e0b' : MUTED)}>{lead.urgencia}</span>}
                   <span style={s.badge(lead.estado === 'perdido' ? '#ef4444' : lead.estado === 'frio' ? MUTED : '#10b981')}>{lead.estado || 'activo'}</span>
                 </div>
               </div>
               {(lead.horizon || lead.motivacion) && (
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${BORDER}` }}>
                   {lead.horizon && <div><span style={s.label}>Presupuesto</span><div style={{ fontSize: '14px' }}>{lead.horizon}</div></div>}
                   {lead.motivacion && <div><span style={s.label}>Motivación</span><div style={{ fontSize: '14px' }}>{lead.motivacion}</div></div>}
                 </div>
               )}
             </div>
           ))}
         </div>
       )}

       {/* COMPETENCIA */}
       {activeTab === 'Competencia' && (
         <div>
           <div style={{ ...s.card, marginBottom: '24px' }}>
             <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Analizar competidor</div>
             <div style={{ display: 'flex', gap: '8px' }}>
               <input style={{ ...s.input, flex: 1 }} value={competidorUsername} onChange={e => setCompetidorUsername(e.target.value)} placeholder="@username de Instagram" />
               <button style={s.btn} onClick={analizarCompetidor} disabled={analizando}>{analizando ? 'Analizando...' : 'Analizar'}</button>
             </div>
           </div>
           <div style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>{competencia.length} competidores analizados</div>
           {competencia.map((c, i) => (
             <div key={i} style={s.card}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                 <div style={{ fontSize: '15px', fontWeight: '600' }}>@{c.username}</div>
                 <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                   <span style={s.badge(ACCENT)}>{c.reels_analizados} reels</span>
                   <span style={{ fontSize: '12px', color: MUTED }}>{new Date(c.created_at).toLocaleDateString('es-ES')}</span>
                 </div>
               </div>
               {c.analisis_raw && (
                 <details>
                   <summary style={{ fontSize: '13px', color: ACCENT, cursor: 'pointer', fontWeight: '500' }}>Ver análisis completo</summary>
                   <div style={{ marginTop: '12px', fontSize: '13px', lineHeight: '1.7', color: MUTED }}>{c.analisis_raw.slice(0, 800)}...</div>
                 </details>
               )}
             </div>
           ))}
         </div>
       )}

       {/* PUBLICACIONES */}
       {activeTab === 'Publicaciones' && (
         <div>
           <div style={{ ...s.card, marginBottom: '24px' }}>
             <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>🔗 Ingerir propiedad desde URL</div>
             <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
               <input style={{ ...s.input, flex: 1 }} value={ingestUrl} onChange={e => setIngestUrl(e.target.value)} placeholder='https://solvilla.es/...' />
               <button style={s.btn} onClick={ingerirDesdeUrl} disabled={ingestando}>{ingestando ? 'Procesando...' : '⚡ Ingerir'}</button>
             </div>
             {ingestResult && (
               <div style={{ background: ingestResult.error ? '#fef2f2' : '#f0fdf4', border: '1px solid ' + (ingestResult.error ? '#fecaca' : '#bbf7d0'), borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
                 {ingestResult.error
                   ? <div style={{ color: '#ef4444', fontSize: '14px' }}>❌ {ingestResult.error}</div>
                   : <div>
                       <div style={{ color: '#10b981', fontWeight: '600', marginBottom: '8px' }}>✅ Publicada en The Edit Marbella</div>
                       <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>{ingestResult.galeriaUrls?.length} imágenes subidas a Drive</div>
                       <div style={{ fontSize: '13px', lineHeight: '1.6', background: '#fff', padding: '12px', borderRadius: '8px' }}>{ingestResult.copyReel}</div>
                     </div>
                 }
               </div>
             )}
             <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>✍️ Generar publicación manual</div>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
               {[['titulo','Título'],['precio','Precio (€)'],['zona','Zona'],['habitaciones','Habitaciones'],['m2','m²'],['slug','Slug URL']].map(([key, label]) => (
                 <div key={key}>
                   <span style={s.label}>{label}</span>
                   <input style={s.input} value={(propForm as any)[key]} onChange={e => setPropForm(p => ({...p, [key]: e.target.value}))} />
                 </div>
               ))}
               <div style={{ gridColumn: '1 / -1' }}>
                 <span style={s.label}>Descripción</span>
                 <textarea style={{...s.input, height: '80px', resize: 'vertical' as const}} value={propForm.descripcion} onChange={e => setPropForm(p => ({...p, descripcion: e.target.value}))} />
               </div>
             </div>
             <button style={{...s.btn, marginTop: '16px', width: '100%'}} onClick={generarPublicacion} disabled={generando}>
               {generando ? 'Generando...' : '✨ Generar publicación'}
             </button>
           </div>

           {copyResult && !copyResult.error && (
             <div style={s.card}>
               <div style={{ fontSize: '24px', fontWeight: '700', color: ACCENT, marginBottom: '20px' }}>{copyResult.hook}</div>
               <div style={{ marginBottom: '20px' }}>
                 <span style={s.label}>Instagram</span>
                 <div style={{ fontSize: '13px', lineHeight: '1.7', background: LIGHT, padding: '14px', borderRadius: '8px', marginTop: '6px' }}>{copyResult.instagram}</div>
                 <button style={{...s.btnOutline, marginTop: '8px', fontSize: '12px'}} onClick={() => navigator.clipboard.writeText(copyResult.instagram)}>📋 Copiar</button>
               </div>
               <div style={{ marginBottom: '20px' }}>
                 <span style={s.label}>LinkedIn</span>
                 <div style={{ fontSize: '13px', lineHeight: '1.7', background: LIGHT, padding: '14px', borderRadius: '8px', marginTop: '6px' }}>{copyResult.linkedin}</div>
                 <button style={{...s.btnOutline, marginTop: '8px', fontSize: '12px'}} onClick={() => navigator.clipboard.writeText(copyResult.linkedin)}>📋 Copiar</button>
               </div>
               <div>
                 <span style={s.label}>Hashtags</span>
                 <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '6px', marginTop: '6px' }}>
                   {copyResult.hashtags?.map((h: string) => <span key={h} style={s.badge(ACCENT)}>{h}</span>)}
                 </div>
               </div>
             </div>
           )}

           {publicaciones.length > 0 && (
             <div style={{ marginTop: '24px' }}>
               <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Historial</div>
               {publicaciones.map((p, i) => (
                 <div key={i} style={s.card}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                     <div style={{ fontSize: '14px', fontWeight: '500' }}>{p.propiedad_slug}</div>
                     <div style={{ fontSize: '12px', color: MUTED }}>{new Date(p.created_at).toLocaleDateString('es-ES')}</div>
                   </div>
                   <div style={{ fontSize: '12px', color: MUTED }}>{p.copy_instagram?.slice(0, 100)}...</div>
                 </div>
               ))}
             </div>
           )}
         </div>
       )}

       {/* CONVERSACIONES */}
       {activeTab === 'Conversaciones' && (
         <div style={{ textAlign: 'center', padding: '80px 0' }}>
           <div style={{ fontSize: '40px', marginBottom: '16px' }}>🗂️</div>
           <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Próximamente</div>
           <div style={{ fontSize: '14px', color: MUTED }}>Historial de conversaciones con clientes</div>
         </div>
       )}

       {/* MÉTRICAS */}
       {activeTab === 'Métricas' && (
         <div style={{ textAlign: 'center', padding: '80px 0' }}>
           <div style={{ fontSize: '40px', marginBottom: '16px' }}>📈</div>
           <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Próximamente</div>
           <div style={{ fontSize: '14px', color: MUTED }}>Dashboard de métricas y conversiones</div>
         </div>
       )}

     </div>
   </div>
 );
}
