-- One column per skill, so the transfer market can filter, sort and index them, and the database enforces 0-20.
alter table public.players
  add column keeper real, add column defending real, add column playmaking real, add column winger real,
  add column passing real, add column scoring real, add column set_pieces real, add column stamina real,
  add column pace real, add column strength real;

update public.players set
  keeper = (skills->>'keeper')::real, defending = (skills->>'defending')::real, playmaking = (skills->>'playmaking')::real,
  winger = (skills->>'winger')::real, passing = (skills->>'passing')::real, scoring = (skills->>'scoring')::real,
  set_pieces = (skills->>'setPieces')::real, stamina = (skills->>'stamina')::real, pace = (skills->>'pace')::real,
  strength = (skills->>'strength')::real;

alter table public.players
  alter column keeper set not null, alter column defending set not null, alter column playmaking set not null,
  alter column winger set not null, alter column passing set not null, alter column scoring set not null,
  alter column set_pieces set not null, alter column stamina set not null, alter column pace set not null,
  alter column strength set not null,
  add constraint skills_in_range check (
    keeper between 0 and 20 and defending between 0 and 20 and playmaking between 0 and 20 and winger between 0 and 20
    and passing between 0 and 20 and scoring between 0 and 20 and set_pieces between 0 and 20 and stamina between 0 and 20
    and pace between 0 and 20 and strength between 0 and 20),
  drop column skills;

-- The transfer market will mostly search on main skills and age.
create index players_scoring_idx on public.players (world_id, scoring desc);
create index players_defending_idx on public.players (world_id, defending desc);
create index players_playmaking_idx on public.players (world_id, playmaking desc);
