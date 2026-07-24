import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessageCircle, Users, Sparkles, User, LogOut, Menu, X, Phone, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { usePresence } from "@/lib/use-presence";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials, type ProfileLite } from "@/lib/novachat-types";
import { ChatsTab } from "@/components/novachat/ChatsTab";
import { FriendsTab } from "@/components/novachat/FriendsTab";
import { CallsTab } from "@/components/novachat/CallsTab";
import { AITab } from "@/components/novachat/AITab";
import { OpenChatTab } from "@/components/novachat/OpenChatTab";
import { ProfileTab } from "@/components/novachat/ProfileTab";
import { ChatView } from "@/components/novachat/ChatView";
import { IncomingCallListener } from "@/components/novachat/IncomingCallListener";
import { NovaLogo } from "@/components/NovaLogo";
import { SupportNovaChat } from "@/components/novachat/SupportNovaChat";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "NovaChat — Modern Messaging" },
      { name: "description", content: "NovaChat: real-time 1:1 chat, friend codes, and an AI assistant in one beautiful app." },
      { property: "og:title", content: "NovaChat — Modern Messaging" },
      { property: "og:description", content: "NovaChat: real-time 1:1 chat, friend codes, and an AI assistant in one beautiful app." },
      { property: "og:url", content: "https://push-hug-it.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://push-hug-it.lovable.app/" }],
  }),
  component: AppShell,
});

type TabId = "chats" | "calls" | "friends" | "ai" | "profile";
type AiMode = "nova" | "openchat" | "support";


function AppShell() {
  const navigate = useNavigate();
  const { user, profile, loading, refreshProfile } = useAuth();
  const [tab, setTab] = useState<TabId>("chats");
  const [aiMode, setAiMode] = useState<AiMode>("nova");
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
    { id: "calls", label: "Calls", icon: Phone },
    { id: "friends", label: "Friends", icon: Users },
    { id: "ai", label: "AI", icon: Sparkles },
    { id: "profile", label: "Profile", icon: User },
  ];

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <h1 className="sr-only">NovaChat — your messaging dashboard</h1>
      {/* Rail (desktop) */}
      <nav className="hidden md:flex w-16 lg:w-20 flex-col items-center py-4 bg-sidebar border-r border-sidebar-border" aria-label="Primary">
        <div className="flex flex-col gap-2 flex-1 justify-start">
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
        <button onClick={handleSignOut} className="size-12 rounded-xl grid place-items-center text-muted-foreground hover:text-destructive hover:bg-sidebar-accent" title="Sign out" aria-label="Sign out">
          <LogOut className="size-5" />
        </button>
      </nav>

      {/* List column */}
      <aside className={cn(
        "w-full md:w-80 lg:w-96 flex-col border-r border-border bg-card",
        mobileChatOpen && (activePeer || tab === "ai") ? "hidden md:flex" : "flex"
      )}>
        <header className="h-16 px-4 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <NovaLogo className="size-[46px] rounded-full" />
              <span className="text-[8px] font-semibold leading-none tracking-[1.5px] text-muted-foreground uppercase">
                NOVA CHAT
              </span>
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{tabLabel(tab)}</div>
              <div className="text-xs text-muted-foreground truncate">@{profile.username}</div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={handleSignOut} title="Sign out" aria-label="Sign out">
            <LogOut className="size-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto pb-24 md:pb-0">
          {tab === "chats" && (
            <ChatsTab me={profile} online={online} activePeerId={activePeer?.id} onOpen={openChat} />
          )}
          {tab === "calls" && (
            <CallsTab me={profile} onOpenChat={(p) => { setTab("chats"); openChat(p); }} />
          )}
          {tab === "friends" && (
            <FriendsTab me={profile} online={online} onOpenChat={(p) => { setTab("chats"); openChat(p); }} />
          )}
          {tab === "ai" && (
            <AISidePanel
              activeMode={aiMode}
              onSelect={(m) => { setAiMode(m); setMobileChatOpen(true); }}
            />
          )}
          {tab === "profile" && (
            <ProfileTab profile={profile} onUpdated={refreshProfile} />
          )}
        </div>
      </aside>

      {/* Floating mobile bottom tab bar (taskbar-style, always visible) */}
      {!(mobileChatOpen && (activePeer || tab === "ai")) && (
        <nav
          className="md:hidden fixed bottom-3 left-3 right-3 z-50 h-16 rounded-2xl border border-border/60 bg-sidebar/80 backdrop-blur-xl shadow-[0_10px_30px_-10px_rgba(0,0,0,0.45)] grid grid-cols-5 px-1"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          aria-label="Primary mobile"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setActivePeer(null); setMobileChatOpen(false); }}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-xs rounded-xl mx-0.5 my-1 transition-colors",
                tab === t.id
                  ? "text-primary bg-primary/15"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="size-5" />
              {t.label}
            </button>
          ))}
        </nav>
      )}

      {/* Main detail */}
      <main className={cn(
        "flex-1 flex-col bg-chat-bg min-w-0",
        mobileChatOpen ? "flex" : "hidden md:flex"
      )}>
        {tab === "ai" ? (
          aiMode === "openchat" ? (
            <OpenChatTab onBack={() => setMobileChatOpen(false)} />
          ) : aiMode === "support" ? (
            <SupportNovaChat onBack={() => setMobileChatOpen(false)} />
          ) : (
            <AITab onBack={() => setMobileChatOpen(false)} />
          )

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
      <IncomingCallListener meId={profile.id} />
    </div>
  );
}

function tabLabel(t: TabId) {
  return t === "chats" ? "Chats" : t === "calls" ? "Call History" : t === "friends" ? "Friends" : t === "ai" ? "AI Assistant" : "Profile";
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

function AISidePanel({
  activeMode,
  onSelect,
}: {
  activeMode: AiMode;
  onSelect: (m: AiMode) => void;
}) {
  return (
    <div className="p-4 space-y-3">
      <button
        onClick={() => onSelect("nova")}
        className={cn(
          "w-full text-left p-4 rounded-xl bg-gradient-to-br from-primary/15 to-accent hover:from-primary/20 transition-colors border",
          activeMode === "nova" ? "border-primary/40 ring-1 ring-primary/30" : "border-primary/20",
        )}
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

      <button
        onClick={() => onSelect("openchat")}
        className={cn(
          "w-full text-left p-4 rounded-xl bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 hover:from-emerald-500/20 transition-colors border",
          activeMode === "openchat" ? "border-emerald-500/50 ring-1 ring-emerald-500/30" : "border-emerald-500/20",
        )}
      >
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-xl bg-emerald-600 text-white grid place-items-center">
            <Bot className="size-6" />
          </div>
          <div>
            <div className="font-semibold">OpenChat AI</div>
            <div className="text-xs text-muted-foreground">Ask anything — powered by OpenAI</div>
          </div>
        </div>
      </button>

      <p className="text-xs text-muted-foreground mt-2 px-1">
        Your personal AI assistants. Chats are private to your account.
      </p>

      {/* Elegant divider separating AI assistants from Support section */}
      <div className="pt-3">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-blue-400/15 to-transparent dark:via-blue-300/15" />
      </div>

      <button
        onClick={() => onSelect("support")}
        className={cn(
          "group relative w-full text-left p-4 rounded-xl overflow-hidden",
          "bg-[linear-gradient(135deg,rgba(37,99,235,0.10),rgba(30,64,175,0.06))]",
          "dark:bg-[linear-gradient(135deg,rgba(37,99,235,0.14),rgba(15,23,42,0.55))]",
          "border transition-all duration-300 ease-out",
          "hover:-translate-y-0.5 hover:scale-[1.02] active:scale-[0.98]",
          activeMode === "support"
            ? "border-blue-500/60 shadow-[0_0_0_1px_rgba(59,130,246,0.35),0_10px_30px_-10px_rgba(59,130,246,0.55)]"
            : "border-blue-500/25 shadow-[0_6px_20px_-12px_rgba(59,130,246,0.55)] hover:border-blue-400/60 hover:shadow-[0_0_0_1px_rgba(59,130,246,0.30),0_14px_36px_-12px_rgba(59,130,246,0.55)]",
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -left-6 -top-6 size-28 rounded-full bg-blue-500/25 blur-2xl opacity-70 group-hover:opacity-100 transition-opacity duration-300"
        />
        <div className="relative flex items-center gap-3">
          <div className="relative shrink-0">
            <span
              aria-hidden
              className="absolute inset-0 rounded-xl bg-blue-500/40 blur-md opacity-60 group-hover:opacity-90 transition-opacity"
            />
            <div className="relative size-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white grid place-items-center shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-transform duration-300 group-hover:rotate-[4deg] animate-[nova-heart-pulse_2.6s_ease-in-out_infinite]">
              <span className="text-xl" aria-hidden>❤️</span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="font-semibold flex items-center gap-1.5">
              <span aria-hidden>❤️</span> Support Us
            </div>
            <div className="text-xs text-muted-foreground truncate">
              Support the future of Nova Chat
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}


// avoid unused import warnings
void Menu; void X;
