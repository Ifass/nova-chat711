
CREATE OR REPLACE FUNCTION public.search_users(q TEXT)
RETURNS TABLE (id UUID, username TEXT, display_name TEXT, unique_code TEXT, avatar_url TEXT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT id, username, display_name, unique_code, avatar_url
  FROM public.profiles
  WHERE id <> auth.uid()
    AND (lower(username) LIKE lower(q) || '%'
      OR upper(unique_code) = upper(q))
  LIMIT 20
$$;
GRANT EXECUTE ON FUNCTION public.search_users(TEXT) TO authenticated;
