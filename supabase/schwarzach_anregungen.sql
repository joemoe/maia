-- Anregungen von Spielern aus Grand Schliefar Schwarzach.
-- Das Spiel (Rolle anon) darf nur text, name und stand einfügen und nichts lesen.
create table public.schwarzach_anregungen (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  text text not null check (char_length(text) between 5 and 600),
  name text check (name is null or char_length(name) <= 40),
  stand jsonb check (stand is null or pg_column_size(stand) < 400),
  status text not null default 'neu' check (status in ('neu','umsetzen','abaendern','verworfen','erledigt')),
  notiz text
);
alter table public.schwarzach_anregungen enable row level security;
revoke all on public.schwarzach_anregungen from anon, authenticated;
grant insert (text, name, stand) on public.schwarzach_anregungen to anon;
create policy "Spiel darf Anregungen einfuegen" on public.schwarzach_anregungen for insert to anon with check (true);
