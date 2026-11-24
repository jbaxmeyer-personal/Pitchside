-- Explicit API grants. Newer Supabase projects don't expose new tables to the API roles by default.
grant usage on schema public to anon, authenticated;
grant select on public.worlds, public.series, public.clubs, public.players, public.match_results, public.cup_entrants
  to anon, authenticated;
grant select on public.club_orders, public.profiles to authenticated;
grant select on public.fixtures_public, public.standings to anon, authenticated;
grant select (id, world_id, season, competition, round, series_id, home_id, away_id, kickoff, status)
  on public.fixtures to anon, authenticated;
grant execute on function public.world_now(int) to anon, authenticated;
