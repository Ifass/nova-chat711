
-- Email verification status on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- OTP table
CREATE TABLE IF NOT EXISTS public.email_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'verify_email',
  attempts INT NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_otps_user ON public.email_otps(user_id, purpose);

GRANT SELECT ON public.email_otps TO authenticated;
GRANT ALL ON public.email_otps TO service_role;
ALTER TABLE public.email_otps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own otps read" ON public.email_otps FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Calls table
CREATE TABLE IF NOT EXISTS public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  callee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ringing',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  ended_reason TEXT,
  duration_seconds INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calls_caller ON public.calls(caller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_callee ON public.calls(callee_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.calls TO authenticated;
GRANT ALL ON public.calls TO service_role;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants read calls" ON public.calls FOR SELECT TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);
CREATE POLICY "caller creates call" ON public.calls FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = caller_id);
CREATE POLICY "participants update call" ON public.calls FOR UPDATE TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id)
  WITH CHECK (auth.uid() = caller_id OR auth.uid() = callee_id);

-- Call ratings
CREATE TABLE IF NOT EXISTS public.call_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stars INT NOT NULL,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(call_id, user_id)
);
GRANT SELECT, INSERT ON public.call_ratings TO authenticated;
GRANT ALL ON public.call_ratings TO service_role;
ALTER TABLE public.call_ratings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.validate_call_rating()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.stars < 1 OR NEW.stars > 5 THEN
    RAISE EXCEPTION 'stars must be 1..5';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.calls c
    WHERE c.id = NEW.call_id AND (c.caller_id = NEW.user_id OR c.callee_id = NEW.user_id)
  ) THEN
    RAISE EXCEPTION 'not a call participant';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_call_rating ON public.call_ratings;
CREATE TRIGGER trg_validate_call_rating BEFORE INSERT ON public.call_ratings
  FOR EACH ROW EXECUTE FUNCTION public.validate_call_rating();

CREATE POLICY "user rates own call" ON public.call_ratings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user reads own rating" ON public.call_ratings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
