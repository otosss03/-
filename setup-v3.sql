-- Clip Locker v3: 조회수 / 제목 수정 / 삭제 (한 번만 Run)
-- 관리자 비밀번호: 아래 'clip-144404' 를 원하는 걸로 바꿔도 돼요.

create extension if not exists pgcrypto with schema extensions;

alter table public.clips add column if not exists views int not null default 0;
alter table public.clips add column if not exists duration_sec int;
alter table public.clips add column if not exists uploader text;

-- 올린 사람만 아는 수정 열쇠 (사이트에서 읽을 수 없는 표)
create table if not exists public.clip_secrets (
  clip_id bigint primary key references public.clips(id) on delete cascade,
  token_hash text not null
);
alter table public.clip_secrets enable row level security;
revoke all on public.clip_secrets from anon, authenticated;

-- 관리자 비밀번호
create table if not exists public.app_admin (
  id int primary key default 1 check (id = 1),
  code_hash text not null
);
alter table public.app_admin enable row level security;
revoke all on public.app_admin from anon, authenticated;
insert into public.app_admin (id, code_hash)
values (1, encode(extensions.digest('clip-144404', 'sha256'), 'hex'))
on conflict (id) do update set code_hash = excluded.code_hash;

-- 삭제된 클립의 영상 파일 목록 (이 목록에 있는 파일만 지울 수 있음)
create table if not exists public.deleted_files (name text primary key);
alter table public.deleted_files enable row level security;
revoke all on public.deleted_files from anon, authenticated;

-- 이제 추가/수정/삭제는 아래 함수로만 가능
drop policy if exists "누구나 추가" on public.clips;
revoke insert, update, delete on public.clips from anon, authenticated;

create or replace function public._h(t text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(coalesce(t, ''), 'sha256'), 'hex')
$$;

create or replace function public._can_edit(p_id bigint, p_token text, p_admin text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from clip_secrets where clip_id = p_id and token_hash = _h(p_token))
      or exists (select 1 from app_admin where code_hash = _h(p_admin))
$$;

create or replace function public.check_admin(p_admin text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from app_admin where code_hash = _h(p_admin))
$$;

create or replace function public.add_clip(
  p_video_id text, p_video_url text, p_start int, p_title text, p_game text,
  p_uploader text, p_duration int, p_token text
) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare new_id bigint;
begin
  if p_token is null or length(p_token) < 20 then raise exception 'invalid token'; end if;
  insert into clips (video_id, video_url, start_sec, title, game, uploader, duration_sec)
  values (p_video_id, p_video_url, coalesce(p_start, 0), p_title, p_game,
          nullif(left(trim(coalesce(p_uploader, '')), 30), ''), p_duration)
  returning id into new_id;
  insert into clip_secrets (clip_id, token_hash) values (new_id, _h(p_token));
  return new_id;
end $$;

create or replace function public.rename_clip(p_id bigint, p_title text, p_token text default null, p_admin text default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not _can_edit(p_id, p_token, p_admin) then raise exception 'not allowed' using errcode = '42501'; end if;
  update clips set title = p_title where id = p_id;
end $$;

create or replace function public.delete_clip(p_id bigint, p_token text default null, p_admin text default null)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v text; f text;
begin
  if not _can_edit(p_id, p_token, p_admin) then raise exception 'not allowed' using errcode = '42501'; end if;
  select video_url into v from clips where id = p_id;
  if v is not null then
    f := substring(v from '/object/public/videos/(.*)$');
    if f is not null then insert into deleted_files (name) values (f) on conflict do nothing; end if;
  end if;
  delete from clips where id = p_id;
  return f;
end $$;

create or replace function public.add_view(p_id bigint) returns int
language sql security definer set search_path = public as $$
  update clips set views = views + 1 where id = p_id returning views
$$;

create or replace function public.is_deleted_file(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from deleted_files where name = p_name)
$$;

revoke execute on function public._h(text) from public, anon, authenticated;
revoke execute on function public._can_edit(bigint, text, text) from public, anon, authenticated;
grant execute on function public.check_admin(text) to anon, authenticated;
grant execute on function public.add_clip(text, text, int, text, text, text, int, text) to anon, authenticated;
grant execute on function public.rename_clip(bigint, text, text, text) to anon, authenticated;
grant execute on function public.delete_clip(bigint, text, text) to anon, authenticated;
grant execute on function public.add_view(bigint) to anon, authenticated;
grant execute on function public.is_deleted_file(text) to anon, authenticated;

-- 영상 파일: 삭제된 클립의 파일만 지울 수 있게
drop policy if exists "영상 보기" on storage.objects;
create policy "영상 보기" on storage.objects
  for select to anon, authenticated using (bucket_id = 'videos');
drop policy if exists "삭제된 클립 파일 지우기" on storage.objects;
create policy "삭제된 클립 파일 지우기" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'videos' and public.is_deleted_file(name));

notify pgrst, 'reload schema';
