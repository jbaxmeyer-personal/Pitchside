import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from './supabase';

export interface World { id: number; name: string; season: number; season_start: string; clock_offset_s: number }
export interface Me { display_name: string | null; is_admin: boolean; club_id: number | null }

interface Ctx {
  session: Session | null;
  ready: boolean;
  world: World | null;
  me: Me | null;
  /** World clock in ms: real time plus the admin time-warp. */
  now: number;
  refresh: () => void;
}

const AppCtx = createContext<Ctx>({ session: null, ready: false, world: null, me: null, now: Date.now(), refresh: () => {} });

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [world, setWorld] = useState<World | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [tickMs, setTick] = useState(Date.now());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    supabase.from('worlds').select('id, name, season, season_start, clock_offset_s').eq('is_live', true).order('id').limit(1).maybeSingle()
      .then(({ data }) => setWorld(data as World | null));
  }, [version]);

  useEffect(() => {
    if (!session) { setMe(null); return; }
    supabase.rpc('my_profile').then(({ data }) => setMe(((data as Me[] | null) ?? [])[0] ?? null));
  }, [session, version]);

  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const now = tickMs + Number(world?.clock_offset_s ?? 0) * 1000;
  return <AppCtx.Provider value={{ session, ready, world, me, now, refresh }}>{children}</AppCtx.Provider>;
}

export const useApp = () => useContext(AppCtx);

/** Runs a query when deps change; returns data, error, and a reload function. */
export function useLoad<T>(fn: () => PromiseLike<T>, deps: unknown[]): { data: T | undefined; error: string | null; reload: () => void } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    Promise.resolve(fn()).then((d) => live && setData(d), (e: unknown) => live && setError(String(e)));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { data, error, reload: () => setN((x) => x + 1) };
}

export const CT = 'America/Chicago';
export function when(iso: string | number): string {
  return new Date(iso).toLocaleString('en-US', { timeZone: CT, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
