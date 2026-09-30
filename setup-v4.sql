-- 현황 v4: 직접 올리는 썸네일 사진 (한 번만 Run)
alter table public.clips add column if not exists thumb_url text;
alter table public.clips drop constraint if exists clips_thumb_check;
alter table public.clips add constraint clips_thumb_check check (
  thumb_url is null or
  thumb_url like 'https://uymatqpxhphwcacqawod.supabase.co/storage/v1/object/public/videos/%'
);

update storage.buckets
set allowed_mime_types = array['video/mp4','video/webm','video/quicktime','image/jpeg','image/png','image/webp']
where id = 'videos';

drop function if exists public.add_clip(text, text, int, text, text, text, int, text);
create or replace function public.add_clip(
  p_video_id text, p_video_url text, p_start int, p_title text, p_game text,
  p_uploader text, p_duration int, p_token text, p_thumb text default null
) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare new_id bigint;
begin
  if p_token is null or length(p_token) < 20 then raise exception 'invalid token'; end if;
  insert into clips (video_id, video_url, start_sec, title, game, uploader, duration_sec, thumb_url)
  values (p_video_id, p_video_url, coalesce(p_start, 0), p_title, p_game,
          nullif(left(trim(coalesce(p_uploader, '')), 30), ''), p_duration, p_thumb)
  returning id into new_id;
  insert into clip_secrets (clip_id, token_hash) values (new_id, _h(p_token));
  return new_id;
end $$;

drop function if exists public.delete_clip(bigint, text, text);
create or replace function public.delete_clip(p_id bigint, p_token text default null, p_admin text default null)
returns text[] language plpgsql security definer set search_path = public, extensions as $$
declare v text; t text; f text; files text[] := '{}';
begin
  if not _can_edit(p_id, p_token, p_admin) then raise exception 'not allowed' using errcode = '42501'; end if;
  select video_url, thumb_url into v, t from clips where id = p_id;
  foreach f in array array[v, t] loop
    f := substring(f from '/object/public/videos/(.*)$');
    if f is not null then
      insert into deleted_files (name) values (f) on conflict do nothing;
      files := files || f;
    end if;
  end loop;
  delete from clips where id = p_id;
  return files;
end $$;

grant execute on function public.add_clip(text, text, int, text, text, text, int, text, text) to anon, authenticated;
grant execute on function public.delete_clip(bigint, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
