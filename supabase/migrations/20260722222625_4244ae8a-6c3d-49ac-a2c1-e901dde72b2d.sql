
-- Extend messages for attachments & image-request flow
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS attachments jsonb,
  ADD COLUMN IF NOT EXISTS caption text,
  ADD COLUMN IF NOT EXISTS image_request_status text,
  ADD COLUMN IF NOT EXISTS requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS previewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD CONSTRAINT messages_type_check CHECK (message_type IN ('text','image_request')),
  ADD CONSTRAINT messages_img_status_check CHECK (image_request_status IS NULL OR image_request_status IN ('pending','accepted','previewed','declined','expired'));

-- Allow receiver to update ONLY the image_request_status fields (accept/decline/preview)
DROP POLICY IF EXISTS "Receiver can respond to image request" ON public.messages;
CREATE POLICY "Receiver can respond to image request"
  ON public.messages FOR UPDATE
  USING (auth.uid() = receiver_id AND message_type = 'image_request')
  WITH CHECK (auth.uid() = receiver_id AND message_type = 'image_request');

-- Storage RLS on chat-images (bucket created via tool)
DROP POLICY IF EXISTS "Users manage their own chat-images uploads" ON storage.objects;
CREATE POLICY "Users manage their own chat-images uploads"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'chat-images' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'chat-images' AND (storage.foldername(name))[1] = auth.uid()::text);
