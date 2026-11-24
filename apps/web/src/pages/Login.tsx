import { useState } from 'react';
import { supabase } from '../supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(kind: 'in' | 'up') {
    setBusy(true); setMsg(null);
    const redirect = window.location.origin + window.location.pathname;
    const res = kind === 'in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
    setBusy(false);
    if (res.error) setMsg(res.error.message);
    else if (kind === 'up' && !res.data.session) setMsg('Check your email to confirm your account, then sign in.');
  }

  return (
    <div className="panel" style={{ maxWidth: 420 }}>
      <h2>Take charge of a club</h2>
      <p className="muted">Sign in, or create an account and take over a club in the USA league.</p>
      <div style={{ display: 'grid', gap: 8 }}>
        <input placeholder="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="password (8+ characters)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="row">
          <button className="primary" disabled={busy} onClick={() => go('in')}>Sign in</button>
          <button disabled={busy} onClick={() => go('up')}>Create account</button>
        </div>
        {msg && <p className={msg.startsWith('Check') ? 'muted' : 'error'}>{msg}</p>}
      </div>
    </div>
  );
}
