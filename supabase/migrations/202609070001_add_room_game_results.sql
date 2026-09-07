alter table public.rooms
  add column if not exists game_results jsonb not null default '[]'::jsonb;

comment on column public.rooms.game_results is
  'Reihenfolge und Gewinner der bereits abgeschlossenen Spiele.';
