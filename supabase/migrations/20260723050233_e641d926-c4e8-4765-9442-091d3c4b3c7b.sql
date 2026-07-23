
CREATE TABLE public.donations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount_inr INTEGER NOT NULL CHECK (amount_inr >= 10 AND amount_inr <= 50000),
  currency TEXT NOT NULL DEFAULT 'INR',
  support_item TEXT NOT NULL,
  order_id TEXT NOT NULL UNIQUE,
  payment_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'created' CHECK (payment_status IN ('created','paid','failed')),
  anonymous BOOLEAN NOT NULL DEFAULT false,
  message TEXT CHECK (message IS NULL OR char_length(message) <= 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.donations TO authenticated;
GRANT ALL ON public.donations TO service_role;

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own donations"
  ON public.donations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_donations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_donations_updated_at
BEFORE UPDATE ON public.donations
FOR EACH ROW EXECUTE FUNCTION public.update_donations_updated_at();

CREATE INDEX donations_user_id_created_at_idx ON public.donations(user_id, created_at DESC);
