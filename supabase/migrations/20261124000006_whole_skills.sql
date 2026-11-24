-- Players see whole skill levels only. The decimals stay server-side, where the engine and training use them.
revoke select on public.players from anon, authenticated;
grant select (id, world_id, club_id, first_name, last_name, age, form, portrait_seed, wage) on public.players to anon, authenticated;

create view public.players_public as
select id, world_id, club_id, first_name, last_name, age, form, portrait_seed, wage,
       floor(keeper)::int as keeper, floor(defending)::int as defending, floor(playmaking)::int as playmaking,
       floor(winger)::int as winger, floor(passing)::int as passing, floor(scoring)::int as scoring,
       floor(set_pieces)::int as set_pieces, floor(stamina)::int as stamina, floor(pace)::int as pace,
       floor(strength)::int as strength
from public.players;

grant select on public.players_public to anon, authenticated;
