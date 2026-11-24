import { naturalRole } from '@pitchside/game';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { Skill } from '../components/Skill';
import { club, clubsById, fixturesFor, fullName, seriesById, squad } from '../data';
import type { PlayerRow } from '../data';
import { money, useApp, useLoad, when } from '../hooks';
import { supabase } from '../supabase';

export const bestRole = (p: PlayerRow) => naturalRole(p.skills);
const ROLE_ORDER = ['GK', 'CB', 'WB', 'W', 'CM', 'FW'];

export function ClubPage() {
  const id = Number(useParams().id);
  const { world, session, refresh } = useApp();
  const { data, error, reload } = useLoad(async () => {
    const c = await club(id);
    if (!c || !world) return null;
    const [s, players, fixtures] = await Promise.all([seriesById(c.series_id), squad(id), fixturesFor({ clubId: id, season: world.season })]);
    const names = await clubsById(fixtures.flatMap((f) => [f.home_id, f.away_id]));
    return { c, s, players, fixtures, names };
  }, [id, world?.season]);
  const [rename, setRename] = useState('');

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const { c, s, players, fixtures, names } = data;
  const mine = session?.user.id === c.owner;
  const sorted = [...players].sort((a, b) => ROLE_ORDER.indexOf(bestRole(a)) - ROLE_ORDER.indexOf(bestRole(b)) || a.last_name.localeCompare(b.last_name));
  const played = fixtures.filter((f) => f.state === 'final').slice(-5).reverse();
  const upcoming = fixtures.filter((f) => f.state !== 'final').slice(0, 5);

  async function doRename() {
    const { error: e } = await supabase.rpc('rename_club', { p_name: rename });
    if (e) alert(e.message); else { setRename(''); reload(); refresh(); }
  }

  return (
    <>
      <div className="panel row">
        <Badge name={c.name} colors={c.colors} seed={c.badge_seed} size={64} />
        <div style={{ flex: 1 }}>
          <h1>{c.name}</h1>
          <div className="muted">
            {s && <Link to={`/series/${s.id}`}>{s.name}</Link>} · {c.city} · {c.fans.toLocaleString()} fans{mine && <> · {money(c.cash)} in the bank</>}
            {' · '}{c.owner ? <span className="tag">human</span> : <span className="tag">bot</span>}
          </div>
        </div>
        {mine && (
          <div className="row">
            <Link to="/lineup"><button className="primary">Set lineup</button></Link>
            <input placeholder="rename club" value={rename} onChange={(e) => setRename(e.target.value)} style={{ width: 140 }} />
            <button disabled={rename.length < 3} onClick={doRename}>Rename</button>
          </div>
        )}
      </div>

      <div className="grid2">
        <div className="panel">
          <h3>Next up</h3>
          {upcoming.length === 0 && <p className="muted">Nothing scheduled.</p>}
          {upcoming.map((f) => <FixtureLine key={f.id} f={f} names={names} />)}
        </div>
        <div className="panel">
          <h3>Recent results</h3>
          {played.length === 0 && <p className="muted">No matches played yet this season.</p>}
          {played.map((f) => <FixtureLine key={f.id} f={f} names={names} />)}
        </div>
      </div>

      <div className="panel">
        <h3>Squad</h3>
        <table>
          <thead><tr><th>Player</th><th>Pos</th><th className="num">Age</th><th>Form</th><th>Keeper</th><th>Defending</th><th>Playmaking</th><th>Winger</th><th>Passing</th><th>Scoring</th><th>Pace</th><th className="num">Wage</th></tr></thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id}>
                <td>{fullName(p)}</td>
                <td><span className="tag">{bestRole(p)}</span></td>
                <td className="num">{p.age}</td>
                <td>{p.form >= 1.03 ? 'hot' : p.form <= 0.95 ? 'cold' : 'ok'}</td>
                <td><Skill v={p.skills.keeper} /></td>
                <td><Skill v={p.skills.defending} /></td>
                <td><Skill v={p.skills.playmaking} /></td>
                <td><Skill v={p.skills.winger} /></td>
                <td><Skill v={p.skills.passing} /></td>
                <td><Skill v={p.skills.scoring} /></td>
                <td><Skill v={p.skills.pace} /></td>
                <td className="num">{money(p.wage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function FixtureLine({ f, names }: { f: import('../data').Fixture; names: Map<number, import('../data').Club> }) {
  const h = names.get(f.home_id)?.name ?? f.home_id;
  const a = names.get(f.away_id)?.name ?? f.away_id;
  const label = f.competition === 'league' ? `R${f.round}` : f.competition === 'cup' ? `Cup ${f.round}` : 'Friendly';
  return (
    <div className="row" style={{ justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
      <span className="tag">{label}</span>
      <span style={{ flex: 1 }}><Link to={`/club/${f.home_id}`}>{h}</Link> – <Link to={`/club/${f.away_id}`}>{a}</Link></span>
      <Link to={`/match/${f.id}`}>
        {f.state === 'final' ? <b>{f.home_goals}–{f.away_goals}</b> : f.state === 'live' ? <b style={{ color: 'var(--amber)' }}>LIVE</b> : <span className="muted">{when(f.kickoff)}</span>}
      </Link>
    </div>
  );
}
