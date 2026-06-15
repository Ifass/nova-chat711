
-- Bio on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;

-- Pinned chats
CREATE TABLE IF NOT EXISTS public.pinned_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  peer_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, peer_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinned_chats TO authenticated;
GRANT ALL ON public.pinned_chats TO service_role;
ALTER TABLE public.pinned_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own pins" ON public.pinned_chats
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Message reactions
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Participants of the underlying message can see / add / remove their own reactions
CREATE POLICY "Participants can read reactions" ON public.message_reactions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reactions.message_id
        AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
    )
  );
CREATE POLICY "Users add their own reactions" ON public.message_reactions
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reactions.message_id
        AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
    )
  );
CREATE POLICY "Users remove their own reactions" ON public.message_reactions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Allow conversation participants to delete messages (for "delete chat history")
DROP POLICY IF EXISTS "Conversation participants can delete messages" ON public.messages;
CREATE POLICY "Conversation participants can delete messages" ON public.messages
  FOR DELETE TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pinned_chats;
