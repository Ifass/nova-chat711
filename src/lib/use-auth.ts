import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  unique_code: string;
  avatar_url: string | null;
  email: string | null;
  bio: string | null;
  email_verified: boolean;
  email_verified_at: string | null;
};

const SELECT = "id, username, display_name, unique_code, avatar_url, email, bio, email_verified, email_verified_at";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    let cancel = false;
    const load = async () => {
      const { data } = await supabase
        .from("profiles")
        .select(SELECT)
        .eq("id", user.id)
        .maybeSingle();
      if (!cancel && data) setProfile(data as Profile);
    };
    load();
    return () => {
      cancel = true;
    };
  }, [user]);

  return {
    user,
    profile,
    loading,
    refreshProfile: async () => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select(SELECT)
        .eq("id", user.id)
        .maybeSingle();
      if (data) setProfile(data as Profile);
    },
  };
}
