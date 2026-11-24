import { supabase } from './supabase';

export interface Club { id: number; name: string; city: string; colors: { primary: string; secondary: string }; badge_seed: number; owner: string | null; cash: number; fans: number; series_id: number }
export interface PlayerRow { id: number; club_id: number; first_name: string; last_name: string; age: number; skills: import('@pitchside/engine').Skills; form: number; wage: number; portrait_seed: number }
export interface Fixture { id: number; season: number; competition: 'league' | 'cup' | 'friendly'; round: number; series_id: number | null; home_id: number; away_id: number; kickoff: string; state: 'scheduled' | 'live' | 'final'; home_goals: number | null; away_goals: number | null; winner_id: number | null }
export interface Series { id: number; level: number; number: number; name: string }
export interface Standing { club_id: number; name: string; played: number; won: number; drawn: number; lost: number; goals_for: number; goals_against: number; points: number }

const CLUB_COLS = 'id, name, city, colors, badge_seed, owner, cash, fans, series_id';

export async function clubsById(ids: number[]): Promise<Map<number, Club>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data, error } = await supabase.from('clubs').select(CLUB_COLS).in('id', unique);
  if (error) throw error.message;
  return new Map((data as Club[]).map((c) => [c.id, c]));
}

export async function club(id: number): Promise<Club | null> {
  const { data, error } = await supabase.from('clubs').select(CLUB_COLS).eq('id', id).maybeSingle();
  if (error) throw error.message;
  return data as Club | null;
}

export async function squad(clubId: number): Promise<PlayerRow[]> {
  const { data, error } = await supabase.from('players').select('id, club_id, first_name, last_name, age, skills, form, wage, portrait_seed').eq('club_id', clubId);
  if (error) throw error.message;
  return data as PlayerRow[];
}

export async function seriesById(id: number): Promise<Series | null> {
  const { data } = await supabase.from('series').select('id, level, number, name').eq('id', id).maybeSingle();
  return data as Series | null;
}

export async function fixturesFor(filter: { clubId?: number; seriesId?: number; competition?: string; season: number }): Promise<Fixture[]> {
  let q = supabase.from('fixtures_public').select('*').eq('season', filter.season).order('kickoff').order('id');
  if (filter.clubId) q = q.or(`home_id.eq.${filter.clubId},away_id.eq.${filter.clubId}`);
  if (filter.seriesId) q = q.eq('series_id', filter.seriesId);
  if (filter.competition) q = q.eq('competition', filter.competition);
  const { data, error } = await q.limit(1000);
  if (error) throw error.message;
  return data as Fixture[];
}

export const fullName = (p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}`;
