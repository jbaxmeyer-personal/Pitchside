-- Pitchside core schema. Every game row belongs to a world so dev worlds and new countries are just more rows.

create table public.worlds (
  id serial primary key,
  name text not null,
  country text not null default 'USA',
  is_live boolean not null default false,
  clock_offset_s bigint not null default 0,
  season int not null default 1,
  season_start timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.series (
  id serial primary key,
  world_id int not null references public.worlds(id) on delete cascade,
  level int not null,
  number int not null,
  name text not null,
  unique (world_id, level, number)
);

create table public.clubs (
  id serial primary key,
  world_id int not null references public.worlds(id) on delete cascade,
  series_id int not null references public.series(id),
  name text not null,
  city text not null,
  colors jsonb not null,
  badge_seed int not null,
  owner uuid unique references auth.users(id) on delete set null,
  cash bigint not null default 250000,
  fans int not null default 100,
  last_active timestamptz
);
create index on public.clubs (series_id);
create index on public.clubs (world_id) where owner is null;

create table public.players (
  id serial primary key,
  world_id int not null references public.worlds(id) on delete cascade,
  club_id int references public.clubs(id) on delete set null,
  first_name text not null,
  last_name text not null,
  age int not null,
  skills jsonb not null,
  form real not null default 1,
  portrait_seed int not null,
  wage int not null
);
create index on public.players (club_id);

-- Standing orders per club. Hidden from opponents.
create table public.club_orders (
  club_id int primary key references public.clubs(id) on delete cascade,
  slots jsonb not null,
  tactics jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.fixtures (
  id serial primary key,
  world_id int not null references public.worlds(id) on delete cascade,
  season int not null,
  competition text not null check (competition in ('league', 'cup', 'friendly')),
  round int not null,
  series_id int references public.series(id),
  home_id int not null references public.clubs(id),
  away_id int not null references public.clubs(id),
  kickoff timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'played')),
  home_goals int,
  away_goals int,
  -- Cup ties that end level are settled on penalties.
  winner_id int references public.clubs(id),
  seed int not null
);
create index on public.fixtures (world_id, status, kickoff);
create index on public.fixtures (series_id, season);
create index on public.fixtures (home_id);
create index on public.fixtures (away_id);

create table public.match_results (
  fixture_id int primary key references public.fixtures(id) on delete cascade,
  result jsonb not null,
  lineups jsonb not null
);

create table public.cup_entrants (
  world_id int not null references public.worlds(id) on delete cascade,
  season int not null,
  club_id int not null references public.clubs(id) on delete cascade,
  out_round int,
  primary key (world_id, season, club_id)
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Private settings for scheduled jobs. No public access.
create table public.app_config (
  key text primary key,
  value text not null
);

-- The world's clock: real time plus the admin time-warp offset.
create function public.world_now(w int) returns timestamptz
language sql stable as $$
  select now() + make_interval(secs => clock_offset_s) from public.worlds where id = w
$$;

-- Scores stay hidden until the match is over on the world clock; events are revealed minute by minute in the app.
-- Runs with the owner's rights so it can read the hidden score columns.
create view public.fixtures_public as
select f.id, f.world_id, f.season, f.competition, f.round, f.series_id, f.home_id, f.away_id, f.kickoff,
       case when f.status = 'played' and public.world_now(f.world_id) >= f.kickoff + interval '95 minutes' then 'final'
            when f.status = 'played' then 'live'
            else 'scheduled' end as state,
       case when public.world_now(f.world_id) >= f.kickoff + interval '95 minutes' then f.home_goals end as home_goals,
       case when public.world_now(f.world_id) >= f.kickoff + interval '95 minutes' then f.away_goals end as away_goals,
       case when public.world_now(f.world_id) >= f.kickoff + interval '95 minutes' then f.winner_id end as winner_id
from public.fixtures f;

create view public.standings as
with rows as (
  select f.series_id, f.season, f.home_id as club_id, f.home_goals as gf, f.away_goals as ga
  from public.fixtures f
  where f.competition = 'league' and f.status = 'played'
    and public.world_now(f.world_id) >= f.kickoff + interval '95 minutes'
  union all
  select f.series_id, f.season, f.away_id, f.away_goals, f.home_goals
  from public.fixtures f
  where f.competition = 'league' and f.status = 'played'
    and public.world_now(f.world_id) >= f.kickoff + interval '95 minutes'
)
select c.series_id, w.season, c.id as club_id, c.name,
       count(r.club_id)::int as played,
       count(*) filter (where r.gf > r.ga)::int as won,
       count(*) filter (where r.gf = r.ga)::int as drawn,
       count(*) filter (where r.gf < r.ga)::int as lost,
       coalesce(sum(r.gf), 0)::int as goals_for,
       coalesce(sum(r.ga), 0)::int as goals_against,
       (count(*) filter (where r.gf > r.ga) * 3 + count(*) filter (where r.gf = r.ga))::int as points
from public.clubs c
join public.worlds w on w.id = c.world_id
left join rows r on r.club_id = c.id and r.season = w.season and r.series_id = c.series_id
group by c.series_id, w.season, c.id, c.name;

-- Row level security: the world is public to read; changes go through functions below.
alter table public.worlds enable row level security;
alter table public.series enable row level security;
alter table public.clubs enable row level security;
alter table public.players enable row level security;
alter table public.club_orders enable row level security;
alter table public.fixtures enable row level security;
alter table public.match_results enable row level security;
alter table public.cup_entrants enable row level security;
alter table public.profiles enable row level security;
alter table public.app_config enable row level security;

create policy "read worlds" on public.worlds for select using (true);
create policy "read series" on public.series for select using (true);
create policy "read clubs" on public.clubs for select using (true);
create policy "read players" on public.players for select using (true);
create policy "read fixtures" on public.fixtures for select using (true);
create policy "read cup" on public.cup_entrants for select using (true);
-- Results only once the match has kicked off on the world clock.
create policy "read results" on public.match_results for select using (
  exists (select 1 from public.fixtures f where f.id = fixture_id and public.world_now(f.world_id) >= f.kickoff)
);
create policy "own orders" on public.club_orders for select using (
  exists (select 1 from public.clubs c where c.id = club_id and c.owner = auth.uid())
);
create policy "own profile" on public.profiles for select using (user_id = auth.uid());

-- Raw scores must not leak before full time: API roles may read every column except the score and seed.
revoke select on public.fixtures from anon, authenticated;
grant select (id, world_id, season, competition, round, series_id, home_id, away_id, kickoff, status)
  on public.fixtures to anon, authenticated;
grant select on public.fixtures_public, public.standings to anon, authenticated;

-- Take over a bot club, preferring the lowest level. One club per user.
create function public.claim_club(p_world int, p_display_name text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_club int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into v_club from clubs where owner = auth.uid();
  if v_club is not null then return v_club; end if;

  select c.id into v_club
  from clubs c join series s on s.id = c.series_id
  where c.world_id = p_world and c.owner is null
  order by s.level desc, random()
  limit 1
  for update of c skip locked;
  if v_club is null then raise exception 'no free clubs'; end if;

  update clubs set owner = auth.uid(), last_active = now() where id = v_club;
  insert into profiles (user_id, display_name) values (auth.uid(), p_display_name)
  on conflict (user_id) do update set display_name = excluded.display_name;
  return v_club;
end $$;

create function public.rename_club(p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if length(trim(p_name)) < 3 or length(p_name) > 40 then raise exception 'name must be 3-40 characters'; end if;
  update clubs set name = trim(p_name), last_active = now() where owner = auth.uid();
end $$;

create function public.save_orders(p_slots jsonb, p_tactics jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_club int;
  v_count int;
  v_mine int;
begin
  select id into v_club from clubs where owner = auth.uid();
  if v_club is null then raise exception 'you have no club'; end if;
  select count(*) into v_count from jsonb_each_text(p_slots);
  if v_count <> 11 then raise exception 'pick exactly 11 players'; end if;
  if not (p_slots ? 'GK') then raise exception 'pick a goalkeeper'; end if;
  select count(distinct value::int) into v_mine
  from jsonb_each_text(p_slots) e join players p on p.id = e.value::int and p.club_id = v_club;
  if v_mine <> 11 then raise exception 'lineup has players who are not yours, or a player twice'; end if;
  insert into club_orders (club_id, slots, tactics) values (v_club, p_slots, p_tactics)
  on conflict (club_id) do update set slots = excluded.slots, tactics = excluded.tactics, updated_at = now();
  update clubs set last_active = now() where id = v_club;
end $$;

grant execute on function public.claim_club(int, text) to authenticated;
grant execute on function public.rename_club(text) to authenticated;
grant execute on function public.save_orders(jsonb, jsonb) to authenticated;
revoke execute on function public.claim_club(int, text) from anon;
revoke execute on function public.rename_club(text) from anon;
revoke execute on function public.save_orders(jsonb, jsonb) from anon;
