import { useEffect, useState } from "react";
import { Search, UserPlus, Check, X, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { initials, type ProfileLite, type FriendRow } from "@/lib/novachat-types";

type FriendWithProfile = { friend: FriendRow; profile: ProfileLite };

export function FriendsTab({
  me,
  online,
  onOpenChat,
}: {
  me: ProfileLite;
  online: Set<string>;
  onOpenChat: (peer: ProfileLite) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [incoming, setIncoming] = useState<FriendWithProfile[]>([]);
  const [outgoing, setOutgoing] = useState<FriendWithProfile[]>([]);

  const load = async () => {
    const { data: rows } = await supabase
      .from("friends")
      .select("id, sender_id, receiver_id, status, created_at");
    if (!rows) return;
    const otherIds = Array.from(
      new Set(rows.map((r) => (r.sender_id === me.id ? r.receiver_id : r.sender_id)))
    );
    if (otherIds.length === 0) {
      setFriends([]); setIncoming([]); setOutgoing([]);
      return;
    }
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, username, display_name, unique_code, avatar_url")
      .in("id", otherIds);
    const byId = new Map((profs ?? []).map((p) => [p.id, p as ProfileLite]));
    const wrap = (r: typeof rows[number]): FriendWithProfile | null => {
      const otherId = r.sender_id === me.id ? r.receiver_id : r.sender_id;
      const profile = byId.get(otherId);
      if (!profile) return null;
      return { friend: r as FriendRow, profile };
    };
    setFriends(rows.filter((r) => r.status === "accepted").map(wrap).filter(Boolean) as FriendWithProfile[]);
    setIncoming(rows.filter((r) => r.status === "pending" && r.receiver_id === me.id).map(wrap).filter(Boolean) as FriendWithProfile[]);
    setOutgoing(rows.filter((r) => r.status === "pending" && r.sender_id === me.id).map(wrap).filter(Boolean) as FriendWithProfile[]);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("friends-tab")
      .on("postgres_changes", { event: "*", schema: "public", table: "friends" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id]);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const { data, error } = await supabase.rpc("search_users", { q: q.trim() });
      setSearching(false);
      if (error) { toast.error(error.message); return; }
      setResults((data ?? []) as ProfileLite[]);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const sendRequest = async (peer: ProfileLite) => {
    const { error } = await supabase.from("friends").insert({
      sender_id: me.id,
      receiver_id: peer.id,
      status: "pending",
    });
    if (error) toast.error(error.message);
    else { toast.success(`Friend request sent to @${peer.username}`); setQ(""); setResults([]); load(); }
  };

  const respond = async (row: FriendRow, accept: boolean) => {
    if (accept) {
      const { error } = await supabase.from("friends").update({ status: "accepted" }).eq("id", row.id);
      if (error) toast.error(error.message); else { toast.success("Friend added!"); load(); }
    } else {
      const { error } = await supabase.from("friends").delete().eq("id", row.id);
      if (error) toast.error(error.message); else load();
    }
  };

  return (
    <div className="overflow-y-auto h-full">
      <div className="p-4 sticky top-0 bg-card border-b border-border z-10">
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search username or friend code (e.g. ABD-7X2K)"
            className="pl-9"
          />
        </div>
      </div>

      {q.trim() && (
        <Section title={searching ? "Searching…" : `Results (${results.length})`}>
          {results.map((r) => {
            const existing = [...friends, ...outgoing, ...incoming].find((f) => f.profile.id === r.id);
            return (
              <Row key={r.id} profile={r}>
                {existing ? (
                  <span className="text-xs text-muted-foreground">
                    {existing.friend.status === "accepted" ? "Friend" : "Pending"}
                  </span>
                ) : (
                  <Button size="sm" onClick={() => sendRequest(r)}>
                    <UserPlus className="size-4 mr-1" /> Add
                  </Button>
                )}
              </Row>
            );
          })}
          {!searching && results.length === 0 && (
            <div className="px-4 py-6 text-sm text-muted-foreground text-center">No users found.</div>
          )}
        </Section>
      )}

      {incoming.length > 0 && (
        <Section title={`Incoming requests (${incoming.length})`}>
          {incoming.map((f) => (
            <Row key={f.friend.id} profile={f.profile}>
              <div className="flex gap-1">
                <Button size="icon" variant="default" onClick={() => respond(f.friend, true)} title="Accept" aria-label="Accept friend request">
                  <Check className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => respond(f.friend, false)} title="Decline" aria-label="Decline friend request">
                  <X className="size-4" />
                </Button>
              </div>
            </Row>
          ))}
        </Section>
      )}

      {outgoing.length > 0 && (
        <Section title={`Sent (${outgoing.length})`}>
          {outgoing.map((f) => (
            <Row key={f.friend.id} profile={f.profile}>
              <Button size="sm" variant="ghost" onClick={() => respond(f.friend, false)}>Cancel</Button>
            </Row>
          ))}
        </Section>
      )}

      <Section title={`Friends (${friends.length})`}>
        {friends.length === 0 && !q && (
          <div className="px-4 py-6 text-sm text-muted-foreground text-center">
            No friends yet. Share your code <span className="font-mono font-semibold text-foreground">{me.unique_code}</span> or search above.
          </div>
        )}
        {friends.map((f) => (
          <Row key={f.friend.id} profile={f.profile} dotOnline={online.has(f.profile.id)}>
            <Button size="icon" variant="ghost" onClick={() => onOpenChat(f.profile)} title="Message" aria-label={`Message ${f.profile.display_name}`}>
              <MessageCircle className="size-4" />
            </Button>
          </Row>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Row({ profile, dotOnline, children }: { profile: ProfileLite; dotOnline?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
      <div className="relative">
        <Avatar className="size-10">
          <AvatarImage src={profile.avatar_url ?? undefined} alt={profile.display_name} />
          <AvatarFallback className="bg-primary/15 text-primary text-xs">{initials(profile.display_name)}</AvatarFallback>
        </Avatar>
        {dotOnline && <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-online border-2 border-card" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{profile.display_name}</div>
        <div className="text-xs text-muted-foreground truncate">@{profile.username} · <span className="font-mono">{profile.unique_code}</span></div>
      </div>
      {children}
    </div>
  );
}
