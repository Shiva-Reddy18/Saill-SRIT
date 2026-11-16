-- ==============================================================================
-- SAILL - SRIT AI Language Laboratory (R26 Curriculum)
-- Supabase Storage Buckets & Policies
-- ==============================================================================

-- 1. Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('audio-recordings', 'audio-recordings', true, 26214400, ARRAY['audio/webm', 'audio/wav', 'audio/mpeg', 'audio/ogg', 'audio/mp4']),
  ('portfolio-files', 'portfolio-files', true, 52428800, ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/webp', 'audio/webm', 'audio/wav', 'audio/mpeg']),
  ('avatars', 'avatars', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage RLS Policies
-- Allow anyone to read audio recordings and portfolio files
CREATE POLICY "Public read for audio recordings"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'audio-recordings');

CREATE POLICY "Public read for portfolio files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'portfolio-files');

CREATE POLICY "Public read for avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Allow authenticated users to upload recordings and portfolio files
CREATE POLICY "Allow authenticated upload to audio recordings"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'audio-recordings');

CREATE POLICY "Allow authenticated upload to portfolio files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'portfolio-files');

CREATE POLICY "Allow authenticated upload to avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars');

-- Allow owners or admins to delete
CREATE POLICY "Allow delete own files"
  ON storage.objects FOR DELETE
  USING (bucket_id IN ('audio-recordings', 'portfolio-files', 'avatars'));
