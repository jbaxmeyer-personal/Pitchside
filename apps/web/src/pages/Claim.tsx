import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../hooks';
import { supabase, WORLD_ID } from '../supabase';

export function Claim() {
  const { refresh } = useApp();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function claim() {
    const { data, error } = await supabase.rpc('claim_club', { p_world: WORLD_ID, p_display_name: name || 'Manager' });
    if (error) return setErr(error.message);
    refresh();
    nav(`/club/${data}`);
  }

  return (
    <div className="panel" style={{ maxWidth: 480 }}>
      <h2>Your new job</h2>
      <p>A club at the bottom of the pyramid needs a manager. The squad, the ground and the fans are yours. Climb.</p>
      <div className="row">
        <input placeholder="your manager name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" onClick={claim}>Take over a club</button>
      </div>
      {err && <p className="error">{err}</p>}
    </div>
  );
}
