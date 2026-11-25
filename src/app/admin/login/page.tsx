'use client';

import { useState } from 'react';

export default function Login() {
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [entrando, setEntrando] = useState(false);

  async function entrar() {
    setEntrando(true); setError('');
    const res = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clave }),
    });
    if (res.ok) { window.location.href = '/admin'; return; }
    const d = await res.json().catch(() => ({}));
    setError(d.error || 'No se pudo entrar');
    setEntrando(false);
  }

  return (
    <div style={{ background: '#111111', color: '#e8e8e8', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia, serif' }}>
      <div style={{ width: '320px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#777', marginBottom: '20px' }}>Harvis</div>
        <input
          type='password' value={clave} autoFocus
          onChange={e => setClave(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && entrar()}
          placeholder='Contraseña'
          style={{ width: '100%', background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: '4px', padding: '12px', color: '#e8e8e8', fontSize: '14px', boxSizing: 'border-box' }}
        />
        <button
          onClick={entrar} disabled={entrando}
          style={{ width: '100%', marginTop: '12px', background: '#c9a961', color: '#111', border: 'none', borderRadius: '4px', padding: '12px', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}
        >
          {entrando ? 'Entrando…' : 'Entrar'}
        </button>
        {error && <div style={{ color: '#e06c6c', fontSize: '12px', marginTop: '12px' }}>{error}</div>}
      </div>
    </div>
  );
}
