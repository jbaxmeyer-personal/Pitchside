import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { clubsById, fixturesFor, seriesById } from '../data';
import type { Series, Standing } from '../data';
import { useApp, useLoad } from '../hooks';
import { supabase, WORLD_ID } from '../supabase';
import { FixtureLine } from './Club';

export function SeriesPage() {
  const id = Number(useParams().id);
  const { world, me } = useApp();
  const { data } = useLoad(async () => {
    if (!world) return null;
    const [s, table, fixtures] = await Promise.all([
      seriesById(id),
      supabase.from('standings').select('*').eq('series_id', id).eq('season', world.season).then((r) => (r.data ?? []) as Standing[]),
      fixturesFor({ seriesId: id, season: world.season, competition: 'league' }),
    ]);
    const names = await clubsById(fixtures.flatMap((f) => [f.home_id, f.away_id]));
    return { s, table, fixtures, names };
  }, [id, world?.season]);
  const firstOpen = data?.fixtures.find((f) => f.state !== 'final')?.round ?? 14;
  const [round, setRound] = useState<number | null>(null);
  if (!data?.s) return <p className="muted">Loading…</p>;
  const r = round ?? firstOpen;
  const table = [...data.table].sort((a, b) => b.points - a.points || (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against) || b.goals_for - a.goals_for);

  return (
    <>
      <h1>{data.s.name} <span className="muted" style={{ fontSize: 16 }}>level {data.s.level} · season {world?.season}</span></h1>
      <div className="panel">
        <table>
          <thead><tr><th>#</th><th>Club</th><th className="num">P</th><th className="num">W</th><th className="num">D</th><th className="num">L</th><th className="num">GF</th><th className="num">GA</th><th className="num">GD</th><th className="num">Pts</th></tr></thead>
          <tbody>
            {table.map((t, i) => (
              <tr key={t.club_id} className={me?.club_id === t.club_id ? 'me' : ''}>
                <td>{i + 1}</td>
                <td><Link to={`/club/${t.club_id}`}>{t.name}</Link> {data.names.get(t.club_id)?.owner && <span className="tag">human</span>}</td>
                <td className="num">{t.played}</td><td className="num">{t.won}</td><td className="num">{t.drawn}</td><td className="num">{t.lost}</td>
                <td className="num">{t.goals_for}</td><td className="num">{t.goals_against}</td><td className="num">{t.goals_for - t.goals_against}</td>
                <td className="num"><b>{t.points}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12 }}>Series winners can go up; the bottom two go down.</p>
      </div>
      <div className="panel">
        <div className="row" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Round</h3>
          {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => (
            <button key={n} className={n === r ? 'primary' : ''} onClick={() => setRound(n)}>{n}</button>
          ))}
        </div>
        {data.fixtures.filter((f) => f.round === r).map((f) => <FixtureLine key={f.id} f={f} names={data.names} />)}
      </div>
    </>
  );
}

export function LeaguePage() {
  const { data } = useLoad(async () => {
    const { data: s } = await supabase.from('series').select('id, level, number, name').eq('world_id', WORLD_ID).order('level').order('number');
    return (s ?? []) as Series[];
  }, []);
  if (!data) return <p className="muted">Loading…</p>;
  const levels = [...new Set(data.map((s) => s.level))];
  return (
    <>
      <h1>USA league pyramid</h1>
      {levels.map((l) => (
        <div className="panel" key={l}>
          <h3>Level {l}</h3>
          <div className="row" style={{ gap: 8 }}>
            {data.filter((s) => s.level === l).map((s) => <Link key={s.id} to={`/series/${s.id}`}><span className="tag">{s.name}</span></Link>)}
          </div>
        </div>
      ))}
    </>
  );
}
