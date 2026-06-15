
REVOKE EXECUTE ON FUNCTION public.search_users(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_friend_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
