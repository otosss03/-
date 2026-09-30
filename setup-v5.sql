-- 현황 v5: 올린 영상의 썸네일 바꾸기 (한 번만 Run)
create or replace function public.set_thumb(p_id bigint, p_thumb text default null, p_token text default null, p_admin text default null)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare old text; f text;
begin
  if not _can_edit(p_id, p_token, p_admin) then raise exception 'not allowed' using errcode = '42501'; end if;
  select thumb_url into old from clips where id = p_id;
  update clips set thumb_url = p_thumb where id = p_id;
  f := substring(old from '/object/public/videos/(.*)$');
  if f is not null and old is distinct from p_thumb then
    insert into deleted_files (name) values (f) on conflict do nothing;
    return f;
  end if;
  return null;
end $$;

grant execute on function public.set_thumb(bigint, text, text, text) to anon, authenticated;
notify pgrst, 'reload schema';
