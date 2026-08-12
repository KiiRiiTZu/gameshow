alter table public.rooms
  add column if not exists game_state jsonb;

comment on column public.rooms.game_state is
  'Persistierter Zustand des aktuell laufenden Minispiels.';
