-- Lesezugriff über Funktionen statt über die offenen Tabellen.
--
-- Heute erlaubt die SELECT-Policy auf rooms und players jedem alles: ein
-- "select * from rooms" liefert sämtliche Raumcodes, ohne dass man einen davon
-- kennen müsste. Diese Funktionen verlangen den Raumcode und geben nur den
-- passenden Raum zurück.
--
-- Diese Migration ist rein additiv. Sie ändert keine Policy und keine Tabelle,
-- die Produktion läuft unverändert weiter. Erst wenn Moderator- und
-- Spieleransicht überall über diese Funktionen lesen, wird die offene
-- SELECT-Policy eingeschränkt — das ist ein eigener, späterer Schritt.
--
-- security definer: die Funktionen laufen mit den Rechten ihres Besitzers und
-- umgehen damit die RLS des Aufrufers. Genau das ist der Zweck — der Zugriff
-- wird stattdessen durch den geforderten Raumcode begrenzt.
-- set search_path: verhindert, dass über einen manipulierten Suchpfad andere
-- Objekte untergeschoben werden.

create or replace function public.room_by_code(p_code text)
returns setof public.rooms
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.rooms
  where code = upper(trim(p_code))
  limit 1;
$$;

comment on function public.room_by_code(text) is
  'Liefert genau den Raum zum angegebenen Code, ohne die Tabelle offenzulegen.';

create or replace function public.players_in_room(p_code text)
returns setof public.players
language sql
security definer
set search_path = public
stable
as $$
  select player.*
  from public.players as player
  join public.rooms as room on room.id = player.room_id
  where room.code = upper(trim(p_code))
  order by player.created_at;
$$;

comment on function public.players_in_room(text) is
  'Liefert die Spieler eines Raums, adressiert über den Raumcode.';

-- Der Moderator braucht die angelegte Zeile zurück. Ginge das weiterhin über
-- insert ... returning, bräuchte er dafür eine SELECT-Policy — und genau die
-- soll später wegfallen.
create or replace function public.create_room(p_code text)
returns setof public.rooms
language sql
security definer
set search_path = public
as $$
  insert into public.rooms (code, status, blue_score, red_score, current_game, game_status)
  values (upper(trim(p_code)), 'waiting', 0, 0, 'estimation-game', 'not-started')
  returning *;
$$;

comment on function public.create_room(text) is
  'Legt einen Raum an und gibt ihn zurück, ohne Leserecht auf die Tabelle zu verlangen.';

revoke all on function public.room_by_code(text) from public;
revoke all on function public.players_in_room(text) from public;
revoke all on function public.create_room(text) from public;

grant execute on function public.room_by_code(text) to anon, authenticated;
grant execute on function public.players_in_room(text) to anon, authenticated;
grant execute on function public.create_room(text) to anon, authenticated;
