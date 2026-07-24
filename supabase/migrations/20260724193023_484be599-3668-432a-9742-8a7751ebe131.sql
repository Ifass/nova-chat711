ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS call_type TEXT NOT NULL DEFAULT 'voice';

CREATE OR REPLACE FUNCTION public.validate_call_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.call_type NOT IN ('voice','video') THEN
    RAISE EXCEPTION 'call_type must be voice or video';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_call_type ON public.calls;
CREATE TRIGGER trg_validate_call_type
BEFORE INSERT OR UPDATE OF call_type ON public.calls
FOR EACH ROW EXECUTE FUNCTION public.validate_call_type();