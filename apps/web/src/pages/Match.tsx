import type { MatchEvent, MatchResult } from '@pitchside/engine';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { clubsById } from '../data';
import type { Fixture } from '../data';
import { useApp, useLoad, when } from '../hooks';
import { supabase } from '../supabase';

interface Snapshot { tactics: Record<string, string>; slots: Record<string, { id: number; name: string }> }
interface Stored { result: MatchResult & { penalties: [number, number] | null }; lineups: { home: Snapshot; away: Snapshot } }

const KIND: Record<string, string> = { open: 'chance', counter: 'counter', setpiece: 'set piece', longball: 'long ball' };

export function MatchPage() {
  const id = Number(useParams().id);
  const { now } = useApp();
  const { data } = useLoad(async () => {
    const { data: f } = await supabase.from('fixtures_public').select('*').eq('id', id).maybeSingle();
    if (!f) return null;
    const fx = f as Fixture;
    const names = await clubsById([fx.home_id, fx.away_id]);
    const { data: r } = await supabase.from('match_results').select('result, lineups').eq('fixture_id', id).maybeSingle();
    return { f: fx, names, stored: r as Stored | null };
  }, [id, Math.floor(now / 60_000)]);

  if (!data) return <p className="muted">Loading…</p>;
  const { f, names, stored } = data;
  const home = names.get(f.home_id)!;
  const away = names.get(f.away_id)!;
  const elapsed = Math.floor((now - new Date(f.kickoff).getTime()) / 60_000);
  const started = elapsed >= 0 && stored;
  const over = elapsed >= 95;
  const shown: MatchEvent[] = stored ? stored.result.events.filter((e) => over || e.minute <= elapsed) : [];
  const goals = [0, 1].map((t) => shown.filter((e) => e.team === t && e.outcome === 'goal').length);
  const playerName = (team: 0 | 1, pid: string) => {
    const snap = stored?.lineups[team === 0 ? 'home' : 'away'];
    return Object.values(snap?.slots ?? {}).find((p) => String(p.id) === pid)?.name ?? 'someone';
  };

  return (
    <>
      <div className="panel">
        <div className="row" style={{ justifyContent: 'center', gap: 28 }}>
          <Link to={`/club/${home.id}`} className="row"><Badge name={home.name} colors={home.colors} seed={home.badge_seed} size={56} /><h2>{home.name}</h2></Link>
          <div className="score">{started ? `${goals[0]} – ${goals[1]}` : 'v'}</div>
          <Link to={`/club/${away.id}`} className="row"><h2>{away.name}</h2><Badge name={away.name} colors={away.colors} seed={away.badge_seed} size={56} /></Link>
        </div>
        <p className="muted" style={{ textAlign: 'center' }}>
          {f.competition === 'league' ? `League round ${f.round}` : f.competition === 'cup' ? `Cup round ${f.round}` : 'Friendly'} · {when(f.kickoff)}
          {' · '}{!started ? 'not started' : over ? 'full time' : `${Math.min(90, elapsed)}'`}
          {over && stored?.result.penalties && <> · penalties {stored.result.penalties[0]}–{stored.result.penalties[1]}</>}
        </p>
      </div>

      {started && (
        <div className="grid2">
          <div className="panel">
            <h3>Match feed</h3>
            {shown.length === 0 && <p className="muted">Quiet so far.</p>}
            {shown.map((e, i) => (
              <div key={i} className={`event ${e.outcome === 'goal' ? 'goal' : ''}`}>
                <b>{e.minute}'</b> <span className="tag">{KIND[e.kind]}</span> {e.team === 0 ? home.name : away.name}: {e.cause}. {playerName(e.team, e.shooterId)}{' '}
                {e.outcome === 'goal' ? 'scores!' : e.outcome === 'saved' ? 'is denied by the keeper.' : e.outcome === 'blocked' ? 'has it blocked.' : 'misses.'}
                <span className="muted"> xG {e.xg.toFixed(2)}</span>
              </div>
            ))}
          </div>
          {over && stored && (
            <div className="panel">
              <h3>Numbers</h3>
              <table>
                <thead><tr><th></th><th className="num">{home.name}</th><th className="num">{away.name}</th></tr></thead>
                <tbody>
                  <Row label="Possession" a={`${stored.result.stats[0].possession}%`} b={`${stored.result.stats[1].possession}%`} />
                  <Row label="Chances" a={stored.result.stats[0].chances} b={stored.result.stats[1].chances} />
                  <Row label="Expected goals" a={stored.result.stats[0].xg.toFixed(2)} b={stored.result.stats[1].xg.toFixed(2)} />
                  <Row label="Counters" a={stored.result.stats[0].counters} b={stored.result.stats[1].counters} />
                  <Row label="Midfield" a={stored.result.ratings[0].midfield.toFixed(1)} b={stored.result.ratings[1].midfield.toFixed(1)} />
                  {(['left', 'center', 'right'] as const).map((z) => (
                    <Row key={z} label={`Attack ${z} v their defense`} a={`${stored.result.ratings[0].attack[z].toFixed(1)} v ${stored.result.ratings[1].defense[z].toFixed(1)}`} b={`${stored.result.ratings[1].attack[z].toFixed(1)} v ${stored.result.ratings[0].defense[z].toFixed(1)}`} />
                  ))}
                  <Row label="Tactics" a={Object.values(stored.lineups.home.tactics).join(', ')} b={Object.values(stored.lineups.away.tactics).join(', ')} />
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Row({ label, a, b }: { label: string; a: string | number; b: string | number }) {
  return <tr><td className="muted">{label}</td><td className="num">{a}</td><td className="num">{b}</td></tr>;
}
