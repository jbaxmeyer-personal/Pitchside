import { useState } from 'react';
import { useApp, when } from '../hooks';
import { supabase, WORLD_ID } from '../supabase';

const ACTIONS: Array<[string, string]> = [
  ['tick', 'Run the scheduler now'],
  ['next-kickoff', 'Warp to the next kickoff'],
  ['full-time', 'Warp to full time of the next match'],
  ['next-week', 'Warp one week'],
  ['season-end', 'Warp to the end of the season'],
];

export function AdminPage() {
  const { me, now, refresh } = useApp();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (!me?.is_admin) return <p className="muted">Admins only.</p>;

  async function run(action: string) {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('admin', { body: { action, worldId: WORLD_ID } });
    setBusy(false);
    setLog((l) => [`${action}: ${error ? error.message : JSON.stringify(data)}`, ...l]);
    refresh();
  }

  return (
    <>
      <h1>Admin</h1>
      <div className="panel">
        <p>World clock: <b>{when(now)}</b>. Warps move this world's clock forward for everyone; they can't be undone.</p>
        <div className="row">{ACTIONS.map(([a, label]) => <button key={a} disabled={busy} onClick={() => run(a)}>{label}</button>)}</div>
      </div>
      <div className="panel"><h3>Log</h3>{log.map((l, i) => <div key={i} className="event muted">{l}</div>)}</div>
    </>
  );
}
