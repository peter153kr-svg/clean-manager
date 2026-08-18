-- Run once in Supabase SQL Editor. This creates a private bucket only.
insert into storage.buckets (id, name, public) values ('job-media', 'job-media', false) on conflict (id) do nothing;
create policy "authenticated users read job media" on storage.objects for select to authenticated using (bucket_id = 'job-media');
create policy "authenticated users upload job media" on storage.objects for insert to authenticated with check (bucket_id = 'job-media');
create policy "authenticated users update job media" on storage.objects for update to authenticated using (bucket_id = 'job-media') with check (bucket_id = 'job-media');
create policy "authenticated users delete job media" on storage.objects for delete to authenticated using (bucket_id = 'job-media');
