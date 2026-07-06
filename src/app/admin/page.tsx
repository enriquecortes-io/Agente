'use client';
import { useState, useEffect } from 'react';

const DARK = '#111111';
const SURFACE = '#1e1e1e';
const SURFACE2 = '#2a2a2a';
const BORDER = '#333333';
const CREAM = '#ffffff';
const MUTED = '#888888';
const MUTED2 = '#444444';
const TEM_GOLD = '#c9a96e';
const SOL_TERRA = '#c1694f';
const apiKey = 'dda3fb2a36a29de06fa337e5a72b29638a12a0afea647e8fd14af556d76f0e1d';

const NAV = [
  { id: 'Panel',     icon: '○' },
  { id: 'Leads',     icon: '◈' },
  { id: 'Ingestión', icon: '◎' },
  { id: 'Análisis',  icon: '◐' },
  { id: 'Contenido', icon: '◑' },
  { id: 'Chat',      icon: '◇' },
];

export default function AdminPage() {
  const [project, setProject] = useState<'tem'|'solena'>('tem');
  const [tab, setTab] = useState('Panel');
  const [leadFilter, setLeadFilter] = useState<'todos'|'captacion'|'venta'>('todos');
  const [leads, setLeads] = useState<any[]>([]);
  const [competencia, setCompetencia] = useState<any[]>([]);
  const [publicaciones, setPublicaciones] = useState<any[]>([]);
  const [messages, setMessages] = useState<{role:string,content:string}[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
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

  const accent = project === 'tem' ? TEM_GOLD : SOL_TERRA;

  useEffect(() => {
    if (tab === 'Leads') fetchLeads();
    if (tab === 'Análisis') fetchCompetencia();
    if (tab === 'Contenido') fetchPublicaciones();
  }, [tab, project]);

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
  async function updateLeadFase(id:string, fase:string) {
    setUpdatingLead(id);
    await fetch('/api/admin/leads', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id,fase,project}) });
    await fetchLeads();
    setUpdatingLead(null);
  }
  async function sendMessage(text?:string) {
    const msg = text || input;
    if (!msg.trim()) return;
    const newMessages = [...messages, {role:'user',content:msg}];
    setMessages(newMessages);
    setInput('');
    setChatLoading(true);
    try {
      const res = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json','x-agent-key':apiKey}, body:JSON.stringify({messages:newMessages}) });
      const ct = res.headers.get('content-type')||'';
      if (ct.includes('text/plain')) {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let full = '';
        setMessages(prev=>[...prev,{role:'assistant',content:''}]);
        while(true) {
          const {done,value} = await reader.read();
          if(done) break;
          full += decoder.decode(value,{stream:true});
          setMessages(prev=>{const u=[...prev];u[u.length-1]={role:'assistant',content:full};return u;});
        }
      } else {
        const data = await res.json();
        setMessages(prev=>[...prev,{role:'assistant',content:data.message||'Sin respuesta'}]);
      }
    } catch { setMessages(prev=>[...prev,{role:'assistant',content:'Error de conexión.'}]); }
    setChatLoading(false);
  }
  function startListening() {
    const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if(!SR) return;
    const r=new SR(); r.lang='es-ES';
    r.onstart=()=>setListening(true); r.onend=()=>setListening(false);
    r.onresult=(e:any)=>setInput(e.results[0][0].transcript);
    r.start();
  }
  async function ingerirDesdeUrl() {
    setIngestando(true); setIngestResult(null);
    try { const res=await fetch('/api/ingest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:ingestUrl})}); setIngestResult(await res.json()); }
    catch { setIngestResult({error:'Error en la ingesta'}); }
    setIngestando(false);
  }
  async function generarPublicacion() {
    setGenerando(true); setCopyResult(null);
    try { const res=await fetch('/api/content',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({propiedad:{...propForm,precio:Number(propForm.precio),habitaciones:Number(propForm.habitaciones),m2:Number(propForm.m2)}})}); setCopyResult(await res.json()); }
    catch { setCopyResult({error:'Error generando'}); }
    setGenerando(false);
  }
  async function analizarCompetidor() {
    if(!competidorUsername.trim()) return;
    setAnalizando(true);
    try { const res=await fetch('/api/admin/analizar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:competidorUsername.replace('@','')})}); const data=await res.json(); alert(`Análisis completado: ${data.reels} reels`); fetchCompetencia(); }
    catch { alert('Error analizando'); }
    setAnalizando(false); setCompetidorUsername('');
  }

  const filteredLeads = leads.filter(l => leadFilter==='todos' || l.tipo_lead===leadFilter);
  const calientes = leads.filter(l=>l.temperatura==='caliente'&&l.fase!=='cerrado').length;
  const faseSig: Record<string,string> = {nuevo:'email_enviado',email_enviado:'contacto_pendiente',contacto_pendiente:'cerrado'};
  const faseLabel: Record<string,string> = {nuevo:'Nuevo',email_enviado:'Email enviado',contacto_pendiente:'Pendiente',cerrado:'Cerrado'};
  const faseColor: Record<string,string> = {nuevo:MUTED,email_enviado:'#7c5cbf',contacto_pendiente:'#b07d2a',cerrado:'#4a8a5a'};

  const css = `
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:${DARK};color:${CREAM};font-family:'Inter',system-ui,sans-serif;}
    ::placeholder{color:${MUTED};}
    ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-track{background:transparent;} ::-webkit-scrollbar-thumb{background:${MUTED2};border-radius:2px;}
    input,textarea,select{background:${SURFACE2};border:1px solid ${BORDER};color:${CREAM};border-radius:4px;padding:10px 14px;font-size:13px;width:100%;font-family:inherit;outline:none;}
    input:focus,textarea:focus{border-color:${accent};}
    details>summary{list-style:none;cursor:pointer;} details>summary::-webkit-details-marker{display:none;}
  `;

  return (
    <>
      <style>{css}</style>
      <div style={{display:'flex',height:'100vh',overflow:'hidden',background:DARK}}>

        {/* SIDEBAR */}
        <div style={{width:'220px',minWidth:'220px',borderRight:`1px solid ${BORDER}`,display:'flex',flexDirection:'column',padding:'32px 0'}}>
          {/* Logo */}
          <div style={{padding:'0 28px 32px'}}>
            <div style={{fontSize:'11px',letterSpacing:'0.2em',color:MUTED,textTransform:'uppercase',marginBottom:'4px'}}>Sistema</div>
            <div style={{fontSize:'18px',fontWeight:'300',letterSpacing:'0.1em',color:CREAM}}>HARVIS</div>
          </div>

          {/* Project switcher */}
          <div style={{padding:'0 20px 28px',borderBottom:`1px solid ${BORDER}`}}>
            <div style={{fontSize:'10px',letterSpacing:'0.15em',color:MUTED,textTransform:'uppercase',marginBottom:'10px'}}>Proyecto</div>
            <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
              {(['tem','solena'] as const).map(p=>(
                <button key={p} onClick={()=>setProject(p)} style={{background:project===p?SURFACE2:'transparent',border:`1px solid ${project===p?accent:BORDER}`,borderRadius:'4px',padding:'8px 12px',cursor:'pointer',textAlign:'left',color:project===p?accent:MUTED,fontSize:'12px',letterSpacing:'0.08em',transition:'all 0.2s'}}>
                  {p==='tem'?'The Edit Marbella':'Solena Inmobiliaria'}
                </button>
              ))}
            </div>
          </div>

          {/* Nav */}
          <nav style={{flex:1,padding:'20px 0'}}>
            {NAV.map(n=>{
              const active = tab===n.id;
              return (
                <button key={n.id} onClick={()=>setTab(n.id)} style={{width:'100%',display:'flex',alignItems:'center',gap:'12px',padding:'11px 28px',background:'none',border:'none',cursor:'pointer',color:active?CREAM:MUTED,fontSize:'12px',letterSpacing:'0.12em',textTransform:'uppercase',position:'relative',borderLeft:active?`1px solid ${accent}`:'1px solid transparent',transition:'all 0.15s'}}>
                  <span style={{fontSize:'14px',color:active?accent:MUTED2}}>{n.icon}</span>
                  {n.id}
                  {n.id==='Leads'&&calientes>0&&<span style={{marginLeft:'auto',background:accent,color:DARK,borderRadius:'10px',padding:'1px 7px',fontSize:'10px',fontWeight:'600'}}>{calientes}</span>}
                </button>
              );
            })}
          </nav>

          {/* Bottom */}
          <div style={{padding:'20px 28px',borderTop:`1px solid ${BORDER}`}}>
            <div style={{fontSize:'10px',letterSpacing:'0.1em',color:MUTED,textTransform:'uppercase',marginBottom:'4px'}}>Estado</div>
            <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
              <div style={{width:'6px',height:'6px',borderRadius:'50%',background:'#4a8a5a'}}></div>
              <span style={{fontSize:'11px',color:MUTED}}>Operativo</span>
            </div>
          </div>
        </div>

        {/* MAIN */}
        <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column'}}>
          {/* Top bar */}
          <div style={{padding:'24px 40px 20px',borderBottom:`1px solid ${BORDER}`,display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
            <div>
              <div style={{fontSize:'10px',letterSpacing:'0.2em',color:MUTED,textTransform:'uppercase',marginBottom:'4px'}}>{tab}</div>
              <div style={{fontSize:'20px',fontWeight:'300',letterSpacing:'0.05em',color:CREAM}}>{project==='tem'?'The Edit Marbella':'Solena Inmobiliaria'}</div>
            </div>
            <div style={{fontSize:'11px',color:MUTED,letterSpacing:'0.05em'}}>{new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'})}</div>
          </div>

          {/* CONTENT */}
          <div style={{flex:1,padding:'32px 40px',maxWidth:'900px',width:'100%'}}>

            {/* PANEL */}
            {tab==='Panel' && (
              <div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'12px',marginBottom:'32px'}}>
                  {[{l:'Leads activos',v:leads.length||0,s:'Total'},{l:'Calientes',v:calientes,s:'Requieren contacto'},{l:'Pendientes',v:leads.filter(l=>l.fase==='contacto_pendiente').length,s:'Sin respuesta'},{l:'Propiedades',v:publicaciones.length||0,s:'En cartera'}].map(k=>(
                    <div key={k.l} style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:'4px',padding:'20px'}}>
                      <div style={{fontSize:'10px',letterSpacing:'0.15em',color:MUTED,textTransform:'uppercase',marginBottom:'10px'}}>{k.l}</div>
                      <div style={{fontSize:'32px',fontWeight:'200',color:accent,marginBottom:'4px'}}>{k.v}</div>
                      <div style={{fontSize:'11px',color:MUTED}}>{k.s}</div>
                    </div>
                  ))}
                </div>
                <div style={{borderTop:`1px solid ${BORDER}`,paddingTop:'28px'}}>
                  <div style={{fontSize:'10px',letterSpacing:'0.2em',color:MUTED,textTransform:'uppercase',marginBottom:'16px'}}>Acceso rápido</div>
                  <div style={{display:'flex',gap:'8px',flexWrap:'wrap' as const}}>
                    {[['Ver leads calientes','Leads'],['Ingerir propiedad','Ingestión'],['Analizar competidor','Análisis'],['Generar publicación','Contenido']].map(([label,target])=>(
                      <button key={label} onClick={()=>setTab(target)} style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:'4px',padding:'9px 16px',color:MUTED,fontSize:'12px',letterSpacing:'0.05em',cursor:'pointer'}}>
                        {label} →
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* LEADS */}
            {tab==='Leads' && (
              <div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'24px'}}>
                  <div style={{display:'flex',gap:'4px'}}>
                    {(['todos','captacion','venta'] as const).map(f=>(
                      <button key={f} onClick={()=>setLeadFilter(f)} style={{background:leadFilter===f?SURFACE2:'none',border:`1px solid ${leadFilter===f?accent:BORDER}`,borderRadius:'4px',padding:'7px 14px',color:leadFilter===f?accent:MUTED,fontSize:'11px',letterSpacing:'0.1em',textTransform:'uppercase',cursor:'pointer'}}>
                        {f==='todos'?'Todos':f==='captacion'?'Captación':'Venta'}
                        <span style={{marginLeft:'6px',opacity:0.6}}>({f==='todos'?leads.length:leads.filter(l=>l.tipo_lead===f).length})</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={fetchLeads} style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:'4px',padding:'7px 14px',color:MUTED,fontSize:'11px',cursor:'pointer',letterSpacing:'0.05em'}}>↻ Actualizar</button>
                </div>

                {filteredLeads.length===0&&<div style={{textAlign:'center',padding:'64px',color:MUTED,fontSize:'13px',letterSpacing:'0.05em'}}>Sin leads con este filtro</div>}

                {filteredLeads.map((lead,i)=>{
                  const fase=lead.fase||'nuevo';
                  return (
                    <div key={i} style={{borderBottom:`1px solid ${BORDER}`,padding:'20px 0'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'12px'}}>
                        <div>
                          <div style={{fontSize:'15px',fontWeight:'400',letterSpacing:'0.02em',color:CREAM,marginBottom:'4px'}}>{lead.name}</div>
                          <div style={{fontSize:'12px',color:MUTED}}>{lead.email}{lead.phone?` · ${lead.phone}`:''}</div>
                        </div>
                        <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
                          {lead.temperatura&&<span style={{fontSize:'10px',letterSpacing:'0.1em',textTransform:'uppercase',color:lead.temperatura==='caliente'?'#c0504a':accent,border:`1px solid ${lead.temperatura==='caliente'?'#c0504a':accent}30`,borderRadius:'3px',padding:'3px 8px'}}>{lead.temperatura}</span>}
                          {lead.tipo_lead&&<span style={{fontSize:'10px',letterSpacing:'0.1em',textTransform:'uppercase',color:MUTED,border:`1px solid ${BORDER}`,borderRadius:'3px',padding:'3px 8px'}}>{lead.tipo_lead}</span>}
                          <span style={{fontSize:'10px',letterSpacing:'0.1em',textTransform:'uppercase',color:faseColor[fase]||MUTED,border:`1px solid ${faseColor[fase]||MUTED}30`,borderRadius:'3px',padding:'3px 8px'}}>{faseLabel[fase]||fase}</span>
                        </div>
                      </div>
                      {(lead.zona||lead.plazo_deseado||lead.precio_estimado)&&(
                        <div style={{display:'flex',gap:'24px',marginBottom:'14px'}}>
                          {lead.zona&&<div><span style={{fontSize:'10px',letterSpacing:'0.12em',color:MUTED,textTransform:'uppercase',display:'block',marginBottom:'2px'}}>Zona</span><span style={{fontSize:'13px',color:CREAM}}>{lead.zona}</span></div>}
                          {lead.plazo_deseado&&<div><span style={{fontSize:'10px',letterSpacing:'0.12em',color:MUTED,textTransform:'uppercase',display:'block',marginBottom:'2px'}}>Plazo</span><span style={{fontSize:'13px',color:CREAM}}>{lead.plazo_deseado}</span></div>}
                          {lead.precio_estimado&&<div><span style={{fontSize:'10px',letterSpacing:'0.12em',color:MUTED,textTransform:'uppercase',display:'block',marginBottom:'2px'}}>Precio est.</span><span style={{fontSize:'13px',color:CREAM}}>{Number(lead.precio_estimado).toLocaleString('es-ES')}€</span></div>}
                        </div>
                      )}
                      <div style={{display:'flex',gap:'8px',flexWrap:'wrap' as const}}>
                        {lead.email&&<a href={`mailto:${lead.email}`} style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:'3px',padding:'5px 12px',color:MUTED,fontSize:'11px',letterSpacing:'0.05em',textDecoration:'none',cursor:'pointer'}}>Email →</a>}
                        {lead.phone&&<a href={`https://wa.me/${lead.phone.replace('+','')}`} target="_blank" style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:'3px',padding:'5px 12px',color:MUTED,fontSize:'11px',letterSpacing:'0.05em',textDecoration:'none'}}>WhatsApp →</a>}
                        {faseSig[fase]&&<button onClick={()=>updateLeadFase(lead.id,faseSig[fase])} disabled={updatingLead===lead.id} style={{background:'none',border:`1px solid ${accent}40`,borderRadius:'3px',padding:'5px 12px',color:accent,fontSize:'11px',letterSpacing:'0.05em',cursor:'pointer'}}>
                          {updatingLead===lead.id?'...':'→ '+faseLabel[faseSig[fase]]}
                        </button>}
                        {fase!=='cerrado'&&<button onClick={()=>updateLeadFase(lead.id,'cerrado')} disabled={updatingLead===lead.id} style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:'3px',padding:'5px 12px',color:MUTED,fontSize:'11px',letterSpacing:'0.05em',cursor:'pointer'}}>Cerrar</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* INGESTIÓN */}
            {tab==='Ingestión' && (
              <div>
                <div style={{borderBottom:`1px solid ${BORDER}`,paddingBottom:'24px',marginBottom:'28px'}}>
                  <div style={{fontSize:'11px',letterSpacing:'0.15em',color:MUTED,textTransform:'uppercase',marginBottom:'20px'}}>URL de propiedad</div>
                  <div style={{display:'flex',gap:'8px'}}>
                    <input value={ingestUrl} onChange={e=>setIngestUrl(e.target.value)} placeholder='https://solvilla.es/property/...' style={{flex:1}} />
                    <button onClick={ingerirDesdeUrl} disabled={ingestando} style={{background:accent,color:DARK,border:'none',borderRadius:'4px',padding:'10px 20px',fontSize:'12px',letterSpacing:'0.1em',textTransform:'uppercase',cursor:'pointer',whiteSpace:'nowrap' as const,fontWeight:'500'}}>
                      {ingestando?'Procesando...':'Ingerir'}
                    </button>
                  </div>
                </div>
                {ingestResult&&(
                  <div style={{border:`1px solid ${ingestResult.error?'#6a3030':accent+'40'}`,borderRadius:'4px',padding:'20px'}}>
                    {ingestResult.error
                      ? <div style={{color:'#c05050',fontSize:'13px'}}>{ingestResult.error}</div>
                      : <div>
                          <div style={{color:accent,fontSize:'12px',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:'12px'}}>Ingestión completada</div>
                          <div style={{fontSize:'12px',color:MUTED,marginBottom:'8px'}}>{ingestResult.galeriaUrls?.length} imágenes subidas a Drive</div>
                          <div style={{fontSize:'13px',lineHeight:'1.7',color:CREAM,borderTop:`1px solid ${BORDER}`,paddingTop:'12px',marginTop:'12px'}}>{ingestResult.copyReel}</div>
                        </div>
                    }
                  </div>
                )}
                <div style={{marginTop:'32px'}}>
                  <div style={{fontSize:'11px',letterSpacing:'0.15em',color:MUTED,textTransform:'uppercase',marginBottom:'12px'}}>Portales compatibles</div>
                  {['Solvilla','HomeRun','Drumelia','Engel & Völkers'].map(p=>(
                    <div key={p} style={{borderBottom:`1px solid ${BORDER}`,padding:'10px 0',fontSize:'13px',color:MUTED,display:'flex',justifyContent:'space-between'}}>
                      <span>{p}</span><span style={{color:accent,fontSize:'11px'}}>✓ Activo</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ANÁLISIS */}
            {tab==='Análisis' && (
              <div>
                <div style={{borderBottom:`1px solid ${BORDER}`,paddingBottom:'24px',marginBottom:'28px'}}>
                  <div style={{fontSize:'11px',letterSpacing:'0.15em',color:MUTED,textTransform:'uppercase',marginBottom:'20px'}}>Analizar competidor</div>
                  <div style={{display:'flex',gap:'8px'}}>
                    <input value={competidorUsername} onChange={e=>setCompetidorUsername(e.target.value)} placeholder='@username Instagram' />
                    <button onClick={analizarCompetidor} disabled={analizando} style={{background:accent,color:DARK,border:'none',borderRadius:'4px',padding:'10px 20px',fontSize:'12px',letterSpacing:'0.1em',textTransform:'uppercase',cursor:'pointer',whiteSpace:'nowrap' as const,fontWeight:'500'}}>
                      {analizando?'Analizando...':'Analizar'}
                    </button>
                  </div>
                </div>
                {competencia.map((c,i)=>(
                  <div key={i} style={{borderBottom:`1px solid ${BORDER}`,padding:'20px 0'}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:'8px'}}>
                      <div style={{fontSize:'14px',color:CREAM,letterSpacing:'0.05em'}}>@{c.username}</div>
                      <div style={{display:'flex',gap:'12px',alignItems:'center'}}>
                        <span style={{fontSize:'11px',color:accent,letterSpacing:'0.08em'}}>{c.reels_analizados} reels</span>
                        <span style={{fontSize:'11px',color:MUTED}}>{new Date(c.created_at).toLocaleDateString('es-ES')}</span>
                      </div>
                    </div>
                    {c.analisis_raw&&(
                      <details>
                        <summary style={{fontSize:'11px',color:MUTED,letterSpacing:'0.1em',textTransform:'uppercase'}}>Ver análisis →</summary>
                        <div style={{marginTop:'12px',fontSize:'13px',lineHeight:'1.8',color:MUTED}}>{c.analisis_raw.slice(0,800)}...</div>
                      </details>
                    )}
                  </div>
                ))}
                {competencia.length===0&&<div style={{textAlign:'center',padding:'48px',color:MUTED,fontSize:'13px'}}>Sin análisis todavía</div>}
              </div>
            )}

            {/* CONTENIDO */}
            {tab==='Contenido' && (
              <div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'16px'}}>
                  {([['titulo','Título'],['precio','Precio (€)'],['zona','Zona'],['habitaciones','Habitaciones'],['m2','m²'],['slug','Slug URL']] as [string,string][]).map(([k,l])=>(
                    <div key={k}>
                      <div style={{fontSize:'10px',letterSpacing:'0.12em',color:MUTED,textTransform:'uppercase',marginBottom:'6px'}}>{l}</div>
                      <input value={(propForm as any)[k]} onChange={e=>setPropForm(p=>({...p,[k]:e.target.value}))} />
                    </div>
                  ))}
                  <div style={{gridColumn:'1/-1'}}>
                    <div style={{fontSize:'10px',letterSpacing:'0.12em',color:MUTED,textTransform:'uppercase',marginBottom:'6px'}}>Descripción</div>
                    <textarea value={propForm.descripcion} onChange={e=>setPropForm(p=>({...p,descripcion:e.target.value}))} style={{height:'80px',resize:'vertical' as const}} />
                  </div>
                </div>
                <button onClick={generarPublicacion} disabled={generando} style={{width:'100%',background:accent,color:DARK,border:'none',borderRadius:'4px',padding:'12px',fontSize:'12px',letterSpacing:'0.15em',textTransform:'uppercase',cursor:'pointer',fontWeight:'500'}}>
                  {generando?'Generando...':'Generar publicación'}
                </button>
                {copyResult&&!copyResult.error&&(
                  <div style={{marginTop:'28px'}}>
                    <div style={{fontSize:'18px',fontWeight:'300',color:accent,letterSpacing:'0.05em',marginBottom:'20px',borderBottom:`1px solid ${BORDER}`,paddingBottom:'16px'}}>{copyResult.hook}</div>
                    {[['Instagram',copyResult.instagram],['LinkedIn',copyResult.linkedin]].map(([plat,copy])=>copy&&(
                      <div key={plat} style={{marginBottom:'20px'}}>
                        <div style={{fontSize:'10px',letterSpacing:'0.15em',color:MUTED,textTransform:'uppercase',marginBottom:'8px'}}>{plat}</div>
                        <div style={{fontSize:'13px',lineHeight:'1.8',color:CREAM,background:SURFACE,padding:'14px',borderRadius:'4px',border:`1px solid ${BORDER}`}}>{copy}</div>
                        <button onClick={()=>navigator.clipboard.writeText(copy)} style={{background:'none',border:'none',color:MUTED,fontSize:'11px',letterSpacing:'0.05em',cursor:'pointer',marginTop:'6px'}}>Copiar →</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* CHAT */}
            {tab==='Chat' && (
              <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 160px)'}}>
                <div style={{flex:1,overflowY:'auto',paddingBottom:'20px'}}>
                  {messages.length===0&&(
                    <div style={{padding:'48px 0'}}>
                      <div style={{fontSize:'10px',letterSpacing:'0.2em',color:MUTED,textTransform:'uppercase',marginBottom:'24px'}}>Acciones frecuentes</div>
                      <div style={{display:'flex',flexDirection:'column',gap:'1px'}}>
                        {['Resumen de leads de hoy','Tendencias de la competencia','Propiedades más vistas','Generar informe semanal'].map(a=>(
                          <button key={a} onClick={()=>sendMessage(a)} style={{background:'none',border:'none',borderBottom:`1px solid ${BORDER}`,padding:'14px 0',color:MUTED,fontSize:'13px',letterSpacing:'0.03em',cursor:'pointer',textAlign:'left',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                            {a}<span style={{color:MUTED2}}>→</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {messages.map((m,i)=>(
                    <div key={i} style={{marginBottom:'20px',display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
                      <div style={{maxWidth:'75%',padding:'12px 16px',borderRadius:'4px',fontSize:'13px',lineHeight:'1.8',background:m.role==='user'?SURFACE2:SURFACE,border:`1px solid ${m.role==='user'?accent+'40':BORDER}`,color:CREAM,whiteSpace:'pre-wrap' as const}}>
                        {m.role==='assistant'&&<div style={{fontSize:'10px',letterSpacing:'0.15em',color:accent,textTransform:'uppercase',marginBottom:'6px'}}>Harvis</div>}
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading&&<div style={{color:MUTED,fontSize:'13px',letterSpacing:'0.05em'}}>Procesando...</div>}
                </div>
                <div style={{borderTop:`1px solid ${BORDER}`,paddingTop:'16px',display:'flex',gap:'8px',alignItems:'center'}}>
                  <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendMessage()} placeholder='Escribe un mensaje o instrucción...' style={{flex:1}} />
                  <button onClick={startListening} style={{background:listening?'#6a2020':SURFACE2,border:`1px solid ${BORDER}`,borderRadius:'4px',padding:'10px 12px',cursor:'pointer',color:MUTED,fontSize:'14px'}}>◉</button>
                  <button onClick={()=>sendMessage()} style={{background:accent,color:DARK,border:'none',borderRadius:'4px',padding:'10px 18px',fontSize:'11px',letterSpacing:'0.12em',textTransform:'uppercase',cursor:'pointer',fontWeight:'500'}}>Enviar</button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
