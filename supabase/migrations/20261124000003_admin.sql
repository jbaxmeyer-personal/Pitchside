-- The first person to claim a club becomes the admin, so the owner can run time-warps from the web app.
create or replace function public.claim_club(p_world int, p_display_name text) returns int
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
  insert into profiles (user_id, display_name, is_admin)
  values (auth.uid(), p_display_name, not exists (select 1 from profiles where is_admin))
  on conflict (user_id) do update set display_name = excluded.display_name;
  return v_club;
end $$;

create function public.my_profile() returns table (display_name text, is_admin boolean, club_id int)
language sql stable security definer set search_path = public as $$
  select p.display_name, p.is_admin, c.id from profiles p left join clubs c on c.owner = p.user_id where p.user_id = auth.uid()
$$;
grant execute on function public.my_profile() to authenticated;
