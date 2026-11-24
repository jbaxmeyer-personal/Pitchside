import { computeRatings } from '@pitchside/engine';
import type { Lineup, Player, Slot, Tactics } from '@pitchside/engine';
import { autoPick, DEFAULT_TACTICS, fit, FORMATIONS } from '@pitchside/game';
import { useEffect, useMemo, useState } from 'react';
import { fullName, squad } from '../data';
import { useApp, useLoad } from '../hooks';
import { supabase } from '../supabase';

const ROWS: Slot[][] = [['LF', 'CF', 'RF'], ['LW', 'LCM', 'CM', 'RCM', 'RW'], ['LB', 'LCB', 'CB', 'RCB', 'RB'], ['GK']];
const OPTIONS: Record<keyof Tactics, string[]> = {
  mentality: ['defensive', 'balanced', 'attacking'],
  style: ['possession', 'balanced', 'direct'],
  width: ['narrow', 'balanced', 'wide'],
  line: ['deep', 'normal', 'high'],
  press: ['off', 'normal', 'high'],
};
const HELP: Record<keyof Tactics, string> = {
  mentality: 'More players forward: more chances, more counters against you.',
  style: 'Possession keeps the ball; direct goes long, past the midfield.',
  width: 'Wide play suits strong, tall strikers; narrow plays through the middle.',
  line: 'High wins the ball back sooner but leaves space behind for fast forwards.',
  press: 'Pressing forces mistakes near their goal and tires your players.',
};

export function LineupPage() {
  const { me } = useApp();
  const clubId = me?.club_id;
  const { data } = useLoad(async () => {
    if (!clubId) return null;
    const players = await squad(clubId);
    const { data: orders } = await supabase.from('club_orders').select('slots, tactics').eq('club_id', clubId).maybeSingle();
    return { players, orders: orders as { slots: Record<string, number>; tactics: Tactics } | null };
  }, [clubId]);

  const players: Player[] = useMemo(
    () => (data?.players ?? []).map((p) => ({ id: String(p.id), name: fullName(p), skills: p.skills, form: p.form })),
    [data],
  );
  const [formation, setFormation] = useState('4-4-2');
  const [slots, setSlots] = useState<Record<string, string>>({});
  const [tactics, setTactics] = useState<Tactics>(DEFAULT_TACTICS);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!data || !players.length) return;
    if (data.orders) {
      const saved = Object.fromEntries(Object.entries(data.orders.slots).map(([s, id]) => [s, String(id)]));
      const match = Object.entries(FORMATIONS).find(([, fs]) => fs.length === Object.keys(saved).length && fs.every((s) => saved[s]));
      setFormation(match?.[0] ?? 'custom');
      setSlots(saved);
      setTactics({ ...DEFAULT_TACTICS, ...data.orders.tactics });
    } else {
      pickFor('4-4-2');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, players]);

  function pickFor(f: string) {
    const l = autoPick(players, f, tactics);
    setFormation(f);
    setSlots(Object.fromEntries(Object.entries(l.slots).map(([s, p]) => [s, p!.id])));
  }

  const lineup: Lineup = useMemo(() => {
    const byId = new Map(players.map((p) => [p.id, p]));
    return { slots: Object.fromEntries(Object.entries(slots).map(([s, id]) => [s, byId.get(id)])), tactics };
  }, [slots, tactics, players]);
  const ids = Object.values(slots);
  const dupes = ids.length !== new Set(ids).size;
  const r = Object.keys(slots).length === 11 && !dupes ? computeRatings(lineup) : null;

  async function save() {
    setMsg(null);
    const payload = Object.fromEntries(Object.entries(slots).map(([s, id]) => [s, Number(id)]));
    const { error } = await supabase.rpc('save_orders', { p_slots: payload, p_tactics: tactics });
    setMsg(error ? error.message : 'Saved. These orders stand for every match until you change them.');
  }

  if (!clubId) return <p className="muted">Take over a club first.</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const activeSlots = new Set(Object.keys(slots));

  return (
    <>
      <h1>Lineup and tactics</h1>
      <div className="grid2">
        <div>
          <div className="panel row">
            <label>Formation{' '}
              <select value={formation} onChange={(e) => pickFor(e.target.value)}>
                {Object.keys(FORMATIONS).map((f) => <option key={f}>{f}</option>)}
                {formation === 'custom' && <option>custom</option>}
              </select>
            </label>
            <button onClick={() => pickFor(formation === 'custom' ? '4-4-2' : formation)}>Auto-pick best XI</button>
          </div>
          <div className="pitch">
            {ROWS.map((row, i) => (
              <div className="line" key={i}>
                {row.filter((s) => activeSlots.has(s)).map((s) => (
                  <div key={s}>
                    <div className="slotlabel">{s}</div>
                    <select value={slots[s]} onChange={(e) => setSlots({ ...slots, [s]: e.target.value })}>
                      {[...players].sort((a, b) => fit(s, b.skills) - fit(s, a.skills)).map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({Math.floor(fit(s, p.skills))})</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {dupes && <p className="error">A player is picked twice.</p>}
        </div>

        <div>
          <div className="panel">
            <h3>Tactics</h3>
            {(Object.keys(OPTIONS) as Array<keyof Tactics>).map((k) => (
              <div key={k} style={{ marginBottom: 10 }}>
                <label style={{ textTransform: 'capitalize' }}>{k}{' '}
                  <select value={tactics[k]} onChange={(e) => setTactics({ ...tactics, [k]: e.target.value } as Tactics)}>
                    {OPTIONS[k].map((o) => <option key={o}>{o}</option>)}
                  </select>
                </label>
                <div className="muted" style={{ fontSize: 12 }}>{HELP[k]}</div>
              </div>
            ))}
            <button className="primary" disabled={!r} onClick={save}>Save orders</button>
            {msg && <p className={msg.startsWith('Saved') ? 'muted' : 'error'}>{msg}</p>}
          </div>
          {r && (
            <div className="panel">
              <h3>How this lineup rates</h3>
              <table><tbody>
                <tr><td>Midfield</td><td className="num">{r.midfield.toFixed(1)}</td></tr>
                <tr><td>Attack left / center / right</td><td className="num">{r.attack.left.toFixed(1)} / {r.attack.center.toFixed(1)} / {r.attack.right.toFixed(1)}</td></tr>
                <tr><td>Defense left / center / right</td><td className="num">{r.defense.left.toFixed(1)} / {r.defense.center.toFixed(1)} / {r.defense.right.toFixed(1)}</td></tr>
                <tr><td>Counter threat</td><td className="num">{r.transition.toFixed(1)}</td></tr>
                <tr><td>Players committed forward</td><td className="num">{Math.round(r.commitment * 100)}%</td></tr>
                <tr><td>Back line pace</td><td className="num">{r.recoveryPace.toFixed(1)}</td></tr>
              </tbody></table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
