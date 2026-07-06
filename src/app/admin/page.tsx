'use client';
import { useState, useEffect } from 'react';

const ACCENT = '#1a56db';
const BG = '#f9fafb';
const SURFACE = '#ffffff';
const BORDER = '#e5e7eb';
const TEXT = '#111827';
const MUTED = '#6b7280';
const LIGHT = '#f3f4f6';
const TEM_COLOR = '#1a1a1a';
const SOL_COLOR = '#6B3F2A';
const apiKey = 'dda3fb2a36a29de06fa337e5a72b29638a12a0afea647e8fd14af556d76f0e1d';

const TABS = ['Panel','Leads','Ingestión','Análisis','Contenido','Chat'];

const quickActions = ['Resumen de leads de hoy','Tendencias de la competencia','Resumen de métricas','Propiedades más vistas'];

export default function AdminPage() {
  const [project, setProject] = useState<'tem'|'solena'>('tem');
  const [activeTab, setActiveTab] = useState('Panel');
  const [leadFilter, setLeadFilter] = useState<'todos'|'captacion'|'venta'>('todos');
  const [leads, setLeads] = useState<any[]>([]);
  const [competencia, setCompetencia] = useState<any[]>([]);
  const [publicaciones, setPublicaciones] = useState<any[]>([]);
  const [messages, setMessages] = useState<{role:string,content:string}[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [ingestUrl, setIngestUrl] = useState('');
  const [ingestando, setIngestando] = useState(false);
  const [ingestResult, setIngestResult] = useState<any>(null);
  const [propForm, setPropForm] = useState({titulo:'',precio:'',zona:'',habitaciones:'',m2:'',slug:'',descripcion:''});
  const [generando, setGenerando] = useState(false);
  const [copyResult, setCopyResult] = useState<any>(null);
  const [competidorUsername, setCompetidorUsername] = useState('');
  const [analizando, setAnalizando] = useState(false);
  const [updatingLead, setUpdatingLead] = useState<string|null>(null);

  const accentColor = project === 'tem' ? TEM_COLOR : SOL_COLOR;

  useEffect(() => {
    if (activeTab === 'Leads') fetchLeads();
    if (activeTab === 'Análisis') fetchCompetencia();
    if (activeTab === 'Contenido') fetchPublicaciones();
  }, [activeTab, project]);

  async function fetchLeads() {
    const res = await fetch(`/api/admin/leads?project=${project}`);
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

  async function updateLeadEstado(id: string, fase: string) {
    setUpdatingLead(id);
    try {
      await fetch(`/api/admin/leads`, {
        method: 'PATCH',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ id, fase, project }),
      });
      await fetchLeads();
    } catch(e) { console.error(e); }
    setUpdatingLead(null);
  }

  async function sendMessage(text?: string) {
    const msg = text || input;
    if (!msg.trim()) return;
    const userMsg = {role:'user',content:msg};
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {'Content-Type':'application/json','x-agent-key':apiKey},
        body: JSON.stringify({messages: newMessages}),
      });
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/plain')) {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        setMessages(prev => [...prev, {role:'assistant',content:''}]);
        while (true) {
          const {done,value} = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, {stream:true});
          setMessages(prev => { const u=[...prev]; u[u.length-1]={role:'assistant',content:fullText}; return u; });
        }
      } else {
        const data = await res.json();
        setMessages(prev => [...prev, {role:'assistant',content:data.message||'Sin respuesta'}]);
      }
    } catch {
      setMessages(prev => [...prev, {role:'assistant',content:'Error de conexión.'}]);
    }
    setLoading(false);
  }

  function startListening() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return alert('Tu navegador no soporta dictado');
    const r = new SR(); r.lang='es-ES';
    r.onstart=()=>setListening(true);
    r.onend=()=>setListening(false);
    r.onresult=(e:any)=>setInput(e.results[0][0].transcript);
    r.start();
  }

  async function ingerirDesdeUrl() {
    setIngestando(true); setIngestResult(null);
    try {
      const res = await fetch('/api/ingest', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({url:ingestUrl}),
      });
      setIngestResult(await res.json());
    } catch { setIngestResult({error:'Error en la ingesta'}); }
    setIngestando(false);
  }

  async function generarPublicacion() {
    setGenerando(true); setCopyResult(null);
    try {
      const res = await fetch('/api/content', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({propiedad:{...propForm,precio:Number(propForm.precio),habitaciones:Number(propForm.habitaciones),m2:Number(propForm.m2)}}),
      });
      setCopyResult(await res.json());
    } catch { setCopyResult({error:'Error generando publicación'}); }
    setGenerando(false);
  }

  async function analizarCompetidor() {
    if (!competidorUsername.trim()) return;
    setAnalizando(true);
    try {
      const res = await fetch('/api/admin/analizar', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({username:competidorUsername.replace('@','')}),
      });
      const data = await res.json();
      alert(`✅ Análisis completado: ${data.reels} reels analizados`);
      fetchCompetencia();
    } catch { alert('Error analizando competidor'); }
    setAnalizando(false); setCompetidorUsername('');
  }

  const filteredLeads = leads.filter(l => leadFilter === 'todos' || l.tipo_lead === leadFilter);
  const calientes = leads.filter(l => l.temperatura === 'caliente' && l.fase !== 'cerrado').length;
  const pendientes = leads.filter(l => l.fase === 'contacto_pendiente').length;

  const s = {
    page:{ background:BG, minHeight:'100vh', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', color:TEXT },
    header:{ background:SURFACE, borderBottom:`1px solid ${BORDER}`, padding:'0 20px', display:'flex', alignItems:'center', gap:'24px', position:'sticky' as const, top:0, zIndex:100 },
    logo:{ fontSize:'15px', fontWeight:'600', color:TEXT, padding:'16px 0', whiteSpace:'nowrap' as const },
    switcher:{ display:'flex', gap:'6px', padding:'10px 0' },
    swBtn:(p:'tem'|'solena')=>({ padding:'5px 14px', borderRadius:'8px', border:`1px solid ${p===project ? accentColor : BORDER}`, fontSize:'13px', cursor:'pointer', background:p===project ? accentColor : SURFACE, color:p===project ? '#fff' : MUTED, fontWeight:p===project?'600':'400' }),
    nav:{ display:'flex', gap:'0', overflowX:'auto' as const, flex:1 },
    tab:(active:boolean)=>({ padding:'16px 14px', fontSize:'13px', fontWeight:active?'600':'400', cursor:'pointer', color:active?accentColor:MUTED, background:'none', border:'none', borderBottom:active?`2px solid ${accentColor}`:'2px solid transparent', whiteSpace:'nowrap' as const }),
    content:{ padding:'24px 20px', maxWidth:'900px', margin:'0 auto' },
    card:{ background:SURFACE, border:`1px solid ${BORDER}`, borderRadius:'12px', padding:'20px', marginBottom:'12px' },
    label:{ fontSize:'11px', fontWeight:'600', textTransform:'uppercase' as const, color:MUTED, marginBottom:'4px', letterSpacing:'0.5px', display:'block' },
    input:{ background:LIGHT, border:`1px solid ${BORDER}`, borderRadius:'10px', padding:'10px 14px', color:TEXT, fontSize:'14px', width:'100%', outline:'none', fontFamily:'inherit' },
    btn:{ background:accentColor, color:'#fff', border:'none', borderRadius:'10px', padding:'10px 20px', fontSize:'14px', fontWeight:'500', cursor:'pointer' },
    btnOutline:{ background:'none', color:accentColor, border:`1px solid ${accentColor}`, borderRadius:'10px', padding:'8px 16px', fontSize:'13px', fontWeight:'500', cursor:'pointer' },
    btnSm:(color:string)=>({ background:color+'15', color:color, border:`1px solid ${color}30`, borderRadius:'6px', padding:'4px 10px', fontSize:'11px', fontWeight:'500', cursor:'pointer' }),
    badge:(color:string)=>({ background:color+'15', color:color, borderRadius:'6px', padding:'3px 10px', fontSize:'12px', fontWeight:'500' }),
    kpi:{ background:SURFACE, border:`1px solid ${BORDER}`, borderRadius:'10px', padding:'16px', flex:1 },
    subtab:(active:boolean)=>({ padding:'6px 14px', borderRadius:'20px', fontSize:'13px', cursor:'pointer', border:`1px solid ${active?accentColor:BORDER}`, background:active?accentColor:SURFACE, color:active?'#fff':MUTED, fontWeight:active?'500':'400' }),
    chatBubble:(role:string)=>({ background:role==='user'?accentColor:SURFACE, color:role==='user'?'#fff':TEXT, border:role==='user'?'none':`1px solid ${BORDER}`, borderRadius:role==='user'?'18px 18px 4px 18px':'18px 18px 18px 4px', padding:'12px 16px', maxWidth:'75%', fontSize:'14px', lineHeight:'1.6', whiteSpace:'pre-wrap' as const }),
    quickBtn:{ background:SURFACE, border:`1px solid ${BORDER}`, borderRadius:'20px', padding:'8px 16px', fontSize:'13px', color:TEXT, cursor:'pointer', whiteSpace:'nowrap' as const },
  };

  const faseColors: Record<string,string> = { nuevo:'#6b7280', email_enviado:'#7c3aed', contacto_pendiente:'#d97706', cerrado:'#10b981' };
  const faseLabel: Record<string,string> = { nuevo:'Nuevo', email_enviado:'Email enviado', contacto_pendiente:'Pendiente', cerrado:'Cerrado' };
  const faseSiguiente: Record<string,string> = { nuevo:'email_enviado', email_enviado:'contacto_pendiente', contacto_pendiente:'cerrado' };

  return (
    <div style={s.page}>
      {/* HEADER */}
      <div style={s.header}>
        <div style={s.logo}>Harvis</div>
        <div style={s.switcher}>
          <button style={s.swBtn('tem')} onClick={()=>setProject('tem')}>The Edit Marbella</button>
          <button style={s.swBtn('solena')} onClick={()=>setProject('solena')}>Solena</button>
        </div>
        <nav style={s.nav}>
          {TABS.map(t=>(
            <button key={t} style={s.tab(activeTab===t)} onClick={()=>setActiveTab(t)}>{t}</button>
          ))}
        </nav>
      </div>

      <div style={s.content}>

        {/* PANEL */}
        {activeTab==='Panel' && (
          <div>
            <div style={{fontSize:'20px',fontWeight:'600',marginBottom:'20px'}}>
              {project==='tem'?'The Edit Marbella':'Solena Inmobiliaria'}
            </div>
            <div style={{display:'flex',gap:'12px',marginBottom:'24px',flexWrap:'wrap' as const}}>
              {[
                {label:'Leads activos', val:leads.length||'—', sub:'Total'},
                {label:'🔥 Calientes', val:calientes||'—', sub:'Requieren contacto'},
                {label:'⏳ Pendientes', val:pendientes||'—', sub:'Sin respuesta 24h'},
                {label:'Propiedades', val:publicaciones.length||'—', sub:'En cartera'},
              ].map(k=>(
                <div key={k.label} style={s.kpi}>
                  <div style={{fontSize:'11px',color:MUTED,marginBottom:'4px',textTransform:'uppercase' as const,letterSpacing:'0.5px'}}>{k.label}</div>
                  <div style={{fontSize:'28px',fontWeight:'600',color:accentColor}}>{k.val}</div>
                  <div style={{fontSize:'12px',color:MUTED,marginTop:'2px'}}>{k.sub}</div>
                </div>
              ))}
            </div>
            <div style={{...s.card,background:LIGHT,border:'none'}}>
              <div style={{fontSize:'13px',color:MUTED}}>Acciones rápidas</div>
              <div style={{display:'flex',gap:'8px',marginTop:'12px',flexWrap:'wrap' as const}}>
                {['Ver leads calientes','Ingerir propiedad','Analizar competidor','Generar publicación'].map(a=>(
                  <button key={a} style={s.quickBtn} onClick={()=>{
                    if(a.includes('lead')){setActiveTab('Leads');setLeadFilter('todos');}
                    else if(a.includes('Ingerir')){setActiveTab('Ingestión');}
                    else if(a.includes('competidor')){setActiveTab('Análisis');}
                    else if(a.includes('publicación')){setActiveTab('Contenido');}
                  }}>{a}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* LEADS */}
        {activeTab==='Leads' && (
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
              <div style={{fontSize:'20px',fontWeight:'600'}}>{filteredLeads.length} Leads</div>
              <button style={s.btnOutline} onClick={fetchLeads}>↻ Actualizar</button>
            </div>

            {/* Subtabs tipo_lead */}
            <div style={{display:'flex',gap:'8px',marginBottom:'20px'}}>
              {(['todos','captacion','venta'] as const).map(f=>(
                <button key={f} style={s.subtab(leadFilter===f)} onClick={()=>setLeadFilter(f)}>
                  {f==='todos'?'Todos':f==='captacion'?'Captación':'Venta'}
                  {' '}({f==='todos'?leads.length:leads.filter(l=>l.tipo_lead===f).length})
                </button>
              ))}
            </div>

            {filteredLeads.length===0 && (
              <div style={{textAlign:'center',padding:'48px',color:MUTED,fontSize:'14px'}}>No hay leads con este filtro</div>
            )}

            {filteredLeads.map((lead,i)=>{
              const fase = lead.fase || 'nuevo';
              const siguiente = faseSiguiente[fase];
              return (
                <div key={i} style={s.card}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'10px'}}>
                    <div>
                      <div style={{fontSize:'15px',fontWeight:'600'}}>{lead.name}</div>
                      <div style={{fontSize:'13px',color:MUTED,marginTop:'2px'}}>{lead.email} · {lead.phone}</div>
                    </div>
                    <div style={{display:'flex',gap:'6px',flexWrap:'wrap' as const,justifyContent:'flex-end'}}>
                      {lead.temperatura && (
                        <span style={s.badge(lead.temperatura==='caliente'?'#dc2626':'#7c3aed')}>
                          {lead.temperatura==='caliente'?'🔥':'🌡'} {lead.temperatura}
                        </span>
                      )}
                      {lead.tipo_lead && (
                        <span style={s.badge(lead.tipo_lead==='captacion'?SOL_COLOR:ACCENT)}>
                          {lead.tipo_lead==='captacion'?'Captación':'Venta'}
                        </span>
                      )}
                      <span style={s.badge(faseColors[fase]||MUTED)}>{faseLabel[fase]||fase}</span>
                    </div>
                  </div>

                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'12px',paddingTop:'10px',borderTop:`1px solid ${BORDER}`,fontSize:'13px'}}>
                    {lead.zona && <div><span style={s.label}>Zona</span>{lead.zona}</div>}
                    {lead.plazo_deseado && <div><span style={s.label}>Plazo</span>{lead.plazo_deseado}</div>}
                    {lead.precio_estimado && <div><span style={s.label}>Precio est.</span>{Number(lead.precio_estimado).toLocaleString('es-ES')}€</div>}
                  </div>

                  {/* Acciones */}
                  <div style={{display:'flex',gap:'8px',marginTop:'12px',flexWrap:'wrap' as const}}>
                    {lead.email && (
                      <a href={`mailto:${lead.email}`} style={{...s.btnSm(ACCENT),textDecoration:'none'}}>✉️ Email</a>
                    )}
                    {lead.phone && (
                      <a href={`https://wa.me/${lead.phone.replace('+','')}`} target="_blank" style={{...s.btnSm('#16a34a'),textDecoration:'none'}}>💬 WhatsApp</a>
                    )}
                    {siguiente && (
                      <button
                        style={s.btnSm(faseColors[siguiente]||MUTED)}
                        onClick={()=>updateLeadEstado(lead.id, siguiente)}
                        disabled={updatingLead===lead.id}
                      >
                        {updatingLead===lead.id?'...':`→ ${faseLabel[siguiente]}`}
                      </button>
                    )}
                    {fase!=='cerrado' && (
                      <button style={s.btnSm('#6b7280')} onClick={()=>updateLeadEstado(lead.id,'cerrado')} disabled={updatingLead===lead.id}>
                        Cerrar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* INGESTIÓN */}
        {activeTab==='Ingestión' && (
          <div>
            <div style={{fontSize:'20px',fontWeight:'600',marginBottom:'20px'}}>Ingerir propiedad</div>
            <div style={s.card}>
              <div style={{fontSize:'14px',color:MUTED,marginBottom:'16px'}}>
                Pega la URL de cualquier portal (Solvilla, HomeRun, Drumelia, Engel & Völkers...)
              </div>
              <div style={{display:'flex',gap:'8px',marginBottom:'12px'}}>
                <input style={{...s.input,flex:1}} value={ingestUrl} onChange={e=>setIngestUrl(e.target.value)} placeholder='https://solvilla.es/property/...' />
                <button style={s.btn} onClick={ingerirDesdeUrl} disabled={ingestando}>
                  {ingestando?'Procesando...':'⚡ Ingerir'}
                </button>
              </div>
              {ingestResult && (
                <div style={{background:ingestResult.error?'#fef2f2':'#f0fdf4',border:`1px solid ${ingestResult.error?'#fecaca':'#bbf7d0'}`,borderRadius:'10px',padding:'16px'}}>
                  {ingestResult.error
                    ? <div style={{color:'#ef4444',fontSize:'14px'}}>❌ {ingestResult.error}</div>
                    : <div>
                        <div style={{color:'#10b981',fontWeight:'600',marginBottom:'8px'}}>✅ Propiedad ingerida</div>
                        <div style={{fontSize:'13px',color:'#6b7280',marginBottom:'8px'}}>{ingestResult.galeriaUrls?.length} imágenes subidas a Drive</div>
                        <div style={{fontSize:'13px',lineHeight:'1.6',background:'#fff',padding:'12px',borderRadius:'8px'}}>{ingestResult.copyReel}</div>
                      </div>
                  }
                </div>
              )}
            </div>
          </div>
        )}

        {/* ANÁLISIS (Competencia + Reels) */}
        {activeTab==='Análisis' && (
          <div>
            <div style={{fontSize:'20px',fontWeight:'600',marginBottom:'20px'}}>Competencia y Reels</div>
            <div style={{...s.card,marginBottom:'24px'}}>
              <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'16px'}}>Analizar competidor</div>
              <div style={{display:'flex',gap:'8px'}}>
                <input style={{...s.input,flex:1}} value={competidorUsername} onChange={e=>setCompetidorUsername(e.target.value)} placeholder='@username de Instagram' />
                <button style={s.btn} onClick={analizarCompetidor} disabled={analizando}>{analizando?'Analizando...':'Analizar'}</button>
              </div>
            </div>
            <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'12px'}}>{competencia.length} competidores</div>
            {competencia.map((c,i)=>(
              <div key={i} style={s.card}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
                  <div style={{fontSize:'15px',fontWeight:'600'}}>@{c.username}</div>
                  <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                    <span style={s.badge(accentColor)}>{c.reels_analizados} reels</span>
                    <span style={{fontSize:'12px',color:MUTED}}>{new Date(c.created_at).toLocaleDateString('es-ES')}</span>
                  </div>
                </div>
                {c.analisis_raw && (
                  <details>
                    <summary style={{fontSize:'13px',color:accentColor,cursor:'pointer',fontWeight:'500'}}>Ver análisis completo</summary>
                    <div style={{marginTop:'12px',fontSize:'13px',lineHeight:'1.7',color:MUTED}}>{c.analisis_raw.slice(0,800)}...</div>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}

        {/* CONTENIDO */}
        {activeTab==='Contenido' && (
          <div>
            <div style={{fontSize:'20px',fontWeight:'600',marginBottom:'20px'}}>Generar publicación</div>
            <div style={s.card}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
                {([['titulo','Título'],['precio','Precio (€)'],['zona','Zona'],['habitaciones','Habitaciones'],['m2','m²'],['slug','Slug URL']] as [string,string][]).map(([key,label])=>(
                  <div key={key}>
                    <span style={s.label}>{label}</span>
                    <input style={s.input} value={(propForm as any)[key]} onChange={e=>setPropForm(p=>({...p,[key]:e.target.value}))} />
                  </div>
                ))}
                <div style={{gridColumn:'1 / -1'}}>
                  <span style={s.label}>Descripción</span>
                  <textarea style={{...s.input,height:'80px',resize:'vertical' as const}} value={propForm.descripcion} onChange={e=>setPropForm(p=>({...p,descripcion:e.target.value}))} />
                </div>
              </div>
              <button style={{...s.btn,marginTop:'16px',width:'100%'}} onClick={generarPublicacion} disabled={generando}>
                {generando?'Generando...':'✨ Generar publicación'}
              </button>
            </div>

            {copyResult && !copyResult.error && (
              <div style={s.card}>
                <div style={{fontSize:'22px',fontWeight:'700',color:accentColor,marginBottom:'20px'}}>{copyResult.hook}</div>
                {[['Instagram',copyResult.instagram],['LinkedIn',copyResult.linkedin]].map(([plat,copy])=>(
                  <div key={plat} style={{marginBottom:'20px'}}>
                    <span style={s.label}>{plat}</span>
                    <div style={{fontSize:'13px',lineHeight:'1.7',background:LIGHT,padding:'14px',borderRadius:'8px',marginTop:'6px'}}>{copy}</div>
                    <button style={{...s.btnOutline,marginTop:'8px',fontSize:'12px'}} onClick={()=>navigator.clipboard.writeText(copy)}>📋 Copiar</button>
                  </div>
                ))}
                <div>
                  <span style={s.label}>Hashtags</span>
                  <div style={{display:'flex',flexWrap:'wrap' as const,gap:'6px',marginTop:'6px'}}>
                    {copyResult.hashtags?.map((h:string)=><span key={h} style={s.badge(accentColor)}>{h}</span>)}
                  </div>
                </div>
              </div>
            )}

            {publicaciones.length>0 && (
              <div style={{marginTop:'24px'}}>
                <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'12px'}}>Historial</div>
                {publicaciones.map((p,i)=>(
                  <div key={i} style={s.card}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px'}}>
                      <div style={{fontSize:'14px',fontWeight:'500'}}>{p.propiedad_slug}</div>
                      <div style={{fontSize:'12px',color:MUTED}}>{new Date(p.created_at).toLocaleDateString('es-ES')}</div>
                    </div>
                    <div style={{fontSize:'12px',color:MUTED}}>{p.copy_instagram?.slice(0,100)}...</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CHAT */}
        {activeTab==='Chat' && (
          <div>
            {messages.length===0 ? (
              <div style={{textAlign:'center',padding:'48px 0 32px'}}>
                <div style={{fontSize:'32px',marginBottom:'12px'}}>🏠</div>
                <div style={{fontSize:'22px',fontWeight:'600',marginBottom:'8px'}}>Harvis</div>
                <div style={{fontSize:'14px',color:MUTED,marginBottom:'32px'}}>Escribe un mensaje para comenzar</div>
                <div style={{display:'flex',flexWrap:'wrap' as const,gap:'8px',justifyContent:'center'}}>
                  {quickActions.map(a=><button key={a} style={s.quickBtn} onClick={()=>sendMessage(a)}>{a}</button>)}
                </div>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column' as const,gap:'12px',paddingBottom:'120px'}}>
                {messages.map((m,i)=>(
                  <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
                    {m.role==='assistant' && (
                      <div style={{width:'32px',height:'32px',borderRadius:'50%',background:accentColor+'20',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',marginRight:'8px',flexShrink:0}}>🏠</div>
                    )}
                    <div style={s.chatBubble(m.role)}>{m.content}</div>
                  </div>
                ))}
                {loading && (
                  <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                    <div style={{width:'32px',height:'32px',borderRadius:'50%',background:accentColor+'20',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px'}}>🏠</div>
                    <div style={{...s.chatBubble('assistant'),color:MUTED}}>Escribiendo...</div>
                  </div>
                )}
              </div>
            )}
            <div style={{position:'fixed',bottom:0,left:0,right:0,background:SURFACE,borderTop:`1px solid ${BORDER}`,padding:'12px 20px'}}>
              <div style={{maxWidth:'900px',margin:'0 auto',display:'flex',gap:'8px',alignItems:'center'}}>
                <input style={{...s.input,flex:1}} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendMessage()} placeholder='Escribe un mensaje...' />
                <button style={{background:listening?'#ef4444':LIGHT,border:`1px solid ${BORDER}`,borderRadius:'10px',padding:'10px 12px',cursor:'pointer',fontSize:'18px'}} onClick={startListening}>🎤</button>
                <button style={s.btn} onClick={()=>sendMessage()}>Enviar</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
