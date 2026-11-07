'use client';

import { useState, useEffect } from 'react';

const DARK = '#111111';
const SURFACE = '#1e1e1e';
const SURFACE2 = '#2a2a2a';
const BORDER = '#333333';
const CREAM = '#ffffff';
const MUTED = '#888888';
const GOLD = '#c9a96e';

const REDES = ['INSTAGRAM', 'FACEBOOK', 'TWITTER', 'LINKEDIN', 'TIKTOK'] as const;
type Red = (typeof REDES)[number];

interface Post {
  id: string;
  texto: string;
  redes: string[];
  scheduled_at: string;
  status: string;
  imagen_url?: string | null;
  proyecto?: string | null;
  created_at: string;
}

const API_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY ?? '';

const statusColor: Record<string, string> = {
  draft: '#6a6a3a',
  scheduled: '#3a7a9a',
  published: '#4a8a5a',
  failed: '#9a4a4a',
};

export default function SocialPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    texto: '',
    redes: [] as Red[],
    scheduled_at: '',
    imagen_url: '',
    proyecto: 'tem',
  });

  useEffect(() => { fetchPosts(); }, []);

  async function fetchPosts() {
    setLoading(true);
    try {
      const res = await fetch('/api/social', { headers: { 'x-agent-key': API_KEY } });
      const data = await res.json();
      setPosts(data.posts ?? []);
    } catch { /* silent */ }
    setLoading(false);
  }

  async function savePost() {
    if (!form.texto || !form.redes.length || !form.scheduled_at) {
      alert('Texto, redes y fecha son obligatorios');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-agent-key': API_KEY },
        body: JSON.stringify({
          ...form,
          imagen_url: form.imagen_url || null,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        alert(e.error ?? 'Error al guardar');
        return;
      }
      setModal(false);
      setForm({ texto: '', redes: [], scheduled_at: '', imagen_url: '', proyecto: 'tem' });
      fetchPosts();
    } catch (e) { alert(String(e)); }
    setSaving(false);
  }

  async function removePost(id: string) {
    if (!confirm('¿Eliminar este post?')) return;
    await fetch(`/api/social?id=${id}`, { method: 'DELETE', headers: { 'x-agent-key': API_KEY } });
    fetchPosts();
  }

  function toggleRed(r: Red) {
    setForm(f => ({
      ...f,
      redes: f.redes.includes(r) ? f.redes.filter(x => x !== r) : [...f.redes, r],
    }));
  }

  return (
    <div style={{ minHeight: '100vh', background: DARK, color: CREAM, fontFamily: "'Inter',system-ui,sans-serif", padding: '40px' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '36px' }}>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: MUTED, textTransform: 'uppercase', marginBottom: '4px' }}>
              Harvis · Social
            </div>
            <div style={{ fontSize: '22px', fontWeight: '300', letterSpacing: '0.05em' }}>Publicaciones</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => fetchPosts()} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: '4px', padding: '8px 14px', color: MUTED, fontSize: '12px', cursor: 'pointer' }}>↻</button>
            <button onClick={() => setModal(true)} style={{ background: GOLD, border: 'none', borderRadius: '4px', padding: '8px 18px', color: DARK, fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: '500' }}>+ Nuevo post</button>
          </div>
        </div>

        {/* List */}
        {loading && <div style={{ color: MUTED, fontSize: '13px', letterSpacing: '0.05em' }}>Cargando...</div>}

        {!loading && posts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px', color: MUTED, fontSize: '13px', letterSpacing: '0.05em' }}>
            Sin publicaciones todavía — pulsa "+ Nuevo post"
          </div>
        )}

        {posts.map(post => (
          <div key={post.id} style={{ borderBottom: `1px solid ${BORDER}`, padding: '20px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div style={{ flex: 1, marginRight: '16px' }}>
                <div style={{ fontSize: '13px', lineHeight: '1.7', color: CREAM, marginBottom: '8px', whiteSpace: 'pre-wrap' }}>{post.texto}</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {post.redes.map(r => (
                    <span key={r} style={{ fontSize: '10px', letterSpacing: '0.1em', color: GOLD, border: `1px solid ${GOLD}30`, borderRadius: '3px', padding: '2px 7px' }}>{r}</span>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                <span style={{ fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', background: (statusColor[post.status] ?? '#333') + '22', color: statusColor[post.status] ?? MUTED, border: `1px solid ${statusColor[post.status] ?? BORDER}50`, borderRadius: '3px', padding: '3px 8px' }}>
                  {post.status}
                </span>
                <button onClick={() => removePost(post.id)} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: '3px', padding: '4px 10px', color: '#9a4a4a', fontSize: '10px', cursor: 'pointer' }}>✕</button>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: MUTED }}>
              {new Date(post.scheduled_at).toLocaleString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {post.proyecto && <span style={{ marginLeft: '12px', color: '#555' }}>{post.proyecto.toUpperCase()}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setModal(false); }}>
          <div style={{ background: '#111', border: `1px solid ${BORDER}`, borderRadius: '6px', padding: '32px', width: '540px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ fontSize: '11px', letterSpacing: '0.2em', color: MUTED, textTransform: 'uppercase', marginBottom: '24px' }}>Nuevo post</div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: MUTED, textTransform: 'uppercase', marginBottom: '5px' }}>Texto</div>
              <textarea value={form.texto} onChange={e => setForm(f => ({ ...f, texto: e.target.value }))}
                rows={5} placeholder='Escribe el copy del post...'
                style={{ width: '100%', background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: '3px', padding: '10px 12px', color: CREAM, fontSize: '13px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }} />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: MUTED, textTransform: 'uppercase', marginBottom: '8px' }}>Redes</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {REDES.map(r => (
                  <button key={r} onClick={() => toggleRed(r)}
                    style={{ background: form.redes.includes(r) ? GOLD + '22' : 'none', border: `1px solid ${form.redes.includes(r) ? GOLD : BORDER}`, borderRadius: '3px', padding: '5px 12px', color: form.redes.includes(r) ? GOLD : MUTED, fontSize: '11px', cursor: 'pointer', letterSpacing: '0.08em' }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: MUTED, textTransform: 'uppercase', marginBottom: '5px' }}>Fecha y hora</div>
                <input type='datetime-local' value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
                  style={{ width: '100%', background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: '3px', padding: '8px 10px', color: CREAM, fontSize: '12px', boxSizing: 'border-box', outline: 'none', colorScheme: 'dark' }} />
              </div>
              <div>
                <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: MUTED, textTransform: 'uppercase', marginBottom: '5px' }}>Proyecto</div>
                <select value={form.proyecto} onChange={e => setForm(f => ({ ...f, proyecto: e.target.value }))}
                  style={{ width: '100%', background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: '3px', padding: '8px 10px', color: CREAM, fontSize: '12px', outline: 'none' }}>
                  <option value='tem'>The Edit Marbella</option>
                  <option value='solena'>Solena Inmobiliaria</option>
                  <option value='smc'>Santamaría Collection</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: MUTED, textTransform: 'uppercase', marginBottom: '5px' }}>URL de imagen (opcional)</div>
              <input value={form.imagen_url} onChange={e => setForm(f => ({ ...f, imagen_url: e.target.value }))}
                placeholder='https://...'
                style={{ width: '100%', background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: '3px', padding: '8px 10px', color: CREAM, fontSize: '12px', boxSizing: 'border-box', outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: '3px', padding: '9px 18px', color: MUTED, fontSize: '11px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={savePost} disabled={saving} style={{ background: GOLD, border: 'none', borderRadius: '3px', padding: '9px 22px', color: DARK, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                {saving ? 'Guardando...' : 'Programar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
