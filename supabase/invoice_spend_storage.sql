insert into storage.buckets (id, name, public, allowed_mime_types)
values ('invoice-spend-pdfs', 'invoice-spend-pdfs', true, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    allowed_mime_types = excluded.allowed_mime_types;

-- Uploads are performed by the backend service role. Public reads let every
-- portal user view the same shared invoice without uploader-specific policies.
