import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessageCircle, Users, Sparkles, User, LogOut, Menu, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { usePresence } from "@/lib/use-presence";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials, type ProfileLite } from "@/lib/novachat-types";
import { ChatsTab } from "@/components/novachat/ChatsTab";
import { FriendsTab } from "@/components/novachat/FriendsTab";
import { AITab } from "@/components/novachat/AITab";
import { ProfileTab } from "@/components/novachat/ProfileTab";
import { ChatView } from "@/components/novachat/ChatView";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "NovaChat — Modern Messaging" },
      { name: "description", content: "NovaChat: real-time 1:1 chat, friend codes, and an AI assistant in one beautiful app." },
    ],
  }),
  component: AppShell,
});

type TabId = "chats" | "friends" | "ai" | "profile";

function AppShell() {
  const navigate = useNavigate();
  const { user, profile, loading, refreshProfile } = useAuth();
  const [tab, setTab] = useState<TabId>("chats");
  const [activePeer, setActivePeer] = useState<ProfileLite | null>(null);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const online = usePresence(user?.id);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const openChat = (peer: ProfileLite) => {
    setActivePeer(peer);
    setMobileChatOpen(true);
  };

  if (loading || !user || !profile) {
    return (
      <div className="h-screen grid place-items-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: typeof MessageCircle }[] = [
    { id: "chats", label: "Chats", icon: MessageCircle },
    { id: "friends", label: "Friends", icon: Users },
    { id: "ai", label: "AI", icon: Sparkles },
    { id: "profile", label: "Profile", icon: User },
  ];

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Rail (desktop) */}
      <nav className="hidden md:flex w-16 lg:w-20 flex-col items-center py-4 bg-sidebar border-r border-sidebar-border">
        <div className="size-10 rounded-xl bg-primary text-primary-foreground grid place-items-center mb-6 shadow-md shadow-primary/30">
          <MessageCircle className="size-5" />
        </div>
        <div className="flex flex-col gap-2 flex-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setActivePeer(null); setMobileChatOpen(false); }}
              className={cn(
                "size-12 rounded-xl grid place-items-center transition-colors",
                tab === t.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
              aria-label={t.label}
              title={t.label}
            >
              <t.icon className="size-5" />
            </button>
          ))}
        </div>
        <button onClick={handleSignOut} className="size-12 rounded-xl grid place-items-center text-muted-foreground hover:text-destructive hover:bg-sidebar-accent" title="Sign out">
          <LogOut className="size-5" />
        </button>
      </nav>

      {/* List column */}
      <aside className={cn(
        "w-full md:w-80 lg:w-96 flex-col border-r border-border bg-card",
        mobileChatOpen && activePeer ? "hidden md:flex" : "flex"
      )}>
        <header className="h-16 px-4 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="size-9">
              <AvatarImage src={profile.avatar_url ?? undefined} />
              <AvatarFallback className="bg-primary/15 text-primary text-sm font-medium">
                {initials(profile.display_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{tabLabel(tab)}</div>
              <div className="text-xs text-muted-foreground truncate">@{profile.username}</div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={handleSignOut} title="Sign out">
            <LogOut className="size-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-hidden">
          {tab === "chats" && (
            <ChatsTab me={profile} online={online} activePeerId={activePeer?.id} onOpen={openChat} />
          )}
          {tab === "friends" && (
            <FriendsTab me={profile} online={online} onOpenChat={(p) => { setTab("chats"); openChat(p); }} />
          )}
          {tab === "ai" && (
            <AISidePanel onOpen={() => setMobileChatOpen(true)} />
          )}
          {tab === "profile" && (
            <ProfileTab profile={profile} onUpdated={refreshProfile} />
          )}
        </div>

        {/* Mobile bottom tab bar */}
        <nav className="md:hidden h-16 border-t border-border bg-sidebar grid grid-cols-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setActivePeer(null); setMobileChatOpen(false); }}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-xs",
                tab === t.id ? "text-primary" : "text-muted-foreground"
              )}
            >
              <t.icon className="size-5" />
              {t.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main detail */}
      <main className={cn(
        "flex-1 flex-col bg-chat-bg min-w-0",
        mobileChatOpen ? "flex" : "hidden md:flex"
      )}>
        {tab === "ai" ? (
          <AITab onBack={() => setMobileChatOpen(false)} />
        ) : activePeer ? (
          <ChatView
            me={profile}
            peer={activePeer}
            online={online.has(activePeer.id)}
            onBack={() => setMobileChatOpen(false)}
          />
        ) : (
          <EmptyChatState />
        )}
      </main>
    </div>
  );
}

function tabLabel(t: TabId) {
  return t === "chats" ? "Chats" : t === "friends" ? "Friends" : t === "ai" ? "AI Assistant" : "Profile";
}

function EmptyChatState() {
  return (
    <div className="flex-1 chat-pattern grid place-items-center p-8 text-center">
      <div className="max-w-sm">
        <div className="size-20 rounded-2xl bg-primary/15 text-primary grid place-items-center mx-auto mb-4">
          <MessageCircle className="size-10" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Pick a conversation</h2>
        <p className="text-sm text-muted-foreground">
          Choose a friend on the left to start chatting, or head to the Friends tab to add new people with their username or friend code.
        </p>
      </div>
    </div>
  );
}

function AISidePanel({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="p-4">
      <button
        onClick={onOpen}
        className="w-full text-left p-4 rounded-xl bg-gradient-to-br from-primary/15 to-accent hover:from-primary/20 transition-colors border border-primary/20"
      >
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-xl bg-primary text-primary-foreground grid place-items-center">
            <Sparkles className="size-6" />
          </div>
          <div>
            <div className="font-semibold">NovaChat AI</div>
            <div className="text-xs text-muted-foreground">Ask anything — powered by Gemini</div>
          </div>
        </div>
      </button>
      <p className="text-xs text-muted-foreground mt-4 px-1">
        Your personal AI assistant. Chats are private to your account.
      </p>
    </div>
  );
}

// avoid unused import warnings
void Menu; void X;
