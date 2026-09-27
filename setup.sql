create table if not exists public.clips (
  id bigint generated always as identity primary key,
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  start_sec int not null default 0 check (start_sec >= 0),
  title text not null check (char_length(title) between 1 and 100),
  game  text not null check (char_length(game) between 1 and 40),
  created_at timestamptz not null default now()
);
alter table public.clips enable row level security;
create policy "누구나 보기" on public.clips for select to anon, authenticated using (true);
create policy "누구나 추가" on public.clips for insert to anon, authenticated with check (true);
grant select, insert on public.clips to anon, authenticated;
