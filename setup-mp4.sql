-- mp4 업로드용 설정 (한 번만 Run)
alter table public.clips alter column video_id drop not null;
alter table public.clips add column if not exists video_url text;
alter table public.clips drop constraint if exists clips_source_check;
alter table public.clips add constraint clips_source_check check (
  (video_id is not null) or
  (video_url like 'https://uymatqpxhphwcacqawod.supabase.co/storage/v1/object/public/videos/%')
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 52428800, array['video/mp4','video/webm','video/quicktime'])
on conflict (id) do nothing;

drop policy if exists "누구나 영상 올리기" on storage.objects;
create policy "누구나 영상 올리기" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'videos');
