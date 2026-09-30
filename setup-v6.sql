-- 현황 v6: 익명 댓글 (한 번만 Run)
create table if not exists public.comments (
  id bigint generated always as identity primary key,
  clip_id bigint not null references public.clips(id) on delete cascade,
  nick text not null check (char_length(nick) between 1 and 20),
  body text not null check (char_length(body) between 1 and 500),
  ip_prefix text,
  ip_hash text,
  pw_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists comments_clip_idx on public.comments (clip_id, id);
alter table public.comments enable row level security;
revoke all on public.comments from anon, authenticated;
-- 비밀번호와 IP 전체값은 사이트에서 못 읽게, 보여줄 칸만 공개
grant select (id, clip_id, nick, body, ip_prefix, created_at) on public.comments to anon, authenticated;
drop policy if exists "댓글 보기" on public.comments;
create policy "댓글 보기" on public.comments for select to anon, authenticated using (true);

create or replace function public._client_ip() returns text
language plpgsql stable as $$
declare h json; ip text;
begin
  begin h := current_setting('request.headers', true)::json; exception when others then return null; end;
  if h is null then return null; end if;
  ip := coalesce(h->>'cf-connecting-ip', split_part(h->>'x-forwarded-for', ',', 1), h->>'x-real-ip');
  return nullif(trim(ip), '');
end $$;

create or replace function public.add_comment(p_clip bigint, p_nick text, p_body text, p_pw text)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare ip text := _client_ip(); iph text; pre text; new_id bigint;
begin
  if p_pw is null or char_length(p_pw) < 2 then raise exception '비밀번호를 2자 이상 적어주세요' using errcode = '22023'; end if;
  iph := case when ip is null then null else _h(ip) end;
  -- 도배 방지: 같은 IP는 10초에 한 번
  if iph is not null and exists (select 1 from comments where ip_hash = iph and created_at > now() - interval '10 seconds') then
    raise exception '너무 빨라요. 잠시 후 다시 달아주세요' using errcode = '22023';
  end if;
  pre := case
    when ip ~ '^\d+\.\d+\.\d+\.\d+$' then split_part(ip, '.', 1) || '.' || split_part(ip, '.', 2)
    when ip like '%:%' then split_part(ip, ':', 1) || ':' || split_part(ip, ':', 2)
    else null end;
  insert into comments (clip_id, nick, body, ip_prefix, ip_hash, pw_hash)
  values (p_clip, left(trim(p_nick), 20), left(trim(p_body), 500), pre, iph, crypt(p_pw, gen_salt('bf')))
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.delete_comment(p_id bigint, p_pw text default null, p_admin text default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not (
    exists (select 1 from comments where id = p_id and p_pw is not null and pw_hash = crypt(p_pw, pw_hash))
    or exists (select 1 from app_admin where code_hash = _h(p_admin))
  ) then raise exception '비밀번호가 맞지 않아요' using errcode = '42501'; end if;
  delete from comments where id = p_id;
end $$;

revoke execute on function public._client_ip() from public, anon, authenticated;
grant execute on function public.add_comment(bigint, text, text, text) to anon, authenticated;
grant execute on function public.delete_comment(bigint, text, text) to anon, authenticated;
notify pgrst, 'reload schema';
