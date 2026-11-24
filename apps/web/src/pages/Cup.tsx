import { useState } from 'react';
import { clubsById, fixturesFor } from '../data';
import { useApp, useLoad } from '../hooks';
import { FixtureLine } from './Club';

export function CupPage() {
  const { world, me } = useApp();
  const { data } = useLoad(async () => {
    if (!world) return null;
    const fixtures = await fixturesFor({ season: world.season, competition: 'cup' });
    return { fixtures, names: await clubsById(fixtures.flatMap((f) => [f.home_id, f.away_id])) };
  }, [world?.season]);
  const [round, setRound] = useState<number | null>(null);
  if (!data) return <p className="muted">Loading…</p>;
  const rounds = [...new Set(data.fixtures.map((f) => f.round))];
  const r = round ?? rounds.at(-1) ?? 1;
  const list = data.fixtures.filter((f) => f.round === r);
  const mine = list.filter((f) => f.home_id === me?.club_id || f.away_id === me?.club_id);
  return (
    <>
      <h1>National Cup</h1>
      <p className="muted">Every club in the country, single elimination, Wednesday nights. Level ties go to penalties.</p>
      <div className="panel row">
        {rounds.map((n) => <button key={n} className={n === r ? 'primary' : ''} onClick={() => setRound(n)}>Round {n}</button>)}
      </div>
      {mine.length > 0 && <div className="panel"><h3>Your tie</h3>{mine.map((f) => <FixtureLine key={f.id} f={f} names={data.names} />)}</div>}
      <div className="panel">
        <h3>Round {r} · {list.length} ties</h3>
        {list.slice(0, 300).map((f) => <FixtureLine key={f.id} f={f} names={data.names} />)}
      </div>
    </>
  );
}
