import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Mail } from "lucide-react";
import { NovaLogo } from "@/components/NovaLogo";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in to NovaChat" },
      { name: "description", content: "Sign in or create a NovaChat account to start messaging friends and chatting with AI." },
      { property: "og:title", content: "Sign in to NovaChat" },
      { property: "og:description", content: "Sign in or create a NovaChat account to start messaging friends and chatting with AI." },
      { property: "og:url", content: "https://push-hug-it.lovable.app/auth" },
    ],
    links: [{ rel: "canonical", href: "https://push-hug-it.lovable.app/auth" }],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const goNext = () => {
    if (next) window.location.href = next;
    else navigate({ to: "/" });
  };
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goNext();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resendConfirmation = async (target: string) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: target,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      toast.success("Confirmation email sent. Check your inbox.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resend email");
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (cleanUsername.length < 3) { toast.error("Username must be 3+ chars (letters, numbers, _)"); return; }
        if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
        if (password !== confirm) { toast.error("Passwords don't match"); return; }
        const emailRedirect = next
          ? `${window.location.origin}/auth?next=${encodeURIComponent(next)}`
          : window.location.origin;
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: emailRedirect,
            data: { username: cleanUsername, display_name: displayName.trim() || cleanUsername },
          },
        });
        if (error) throw error;
        if (!data.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
          if (signInError) throw signInError;
        }
        toast.success("Welcome to NovaChat!");
        goNext();
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        goNext();
      } else {
        // forgot
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Check your email for a reset link.");
        setMode("signin");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  const onGoogle = async () => {
    setSubmitting(true);
    try {
      const redirectUri = next
        ? `${window.location.origin}/auth?next=${encodeURIComponent(next)}`
        : window.location.origin;
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: redirectUri });
      if (result.error) { toast.error(result.error.message || "Google sign-in failed"); return; }
      if (result.redirected) return;
      goNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-accent/30 to-primary/10">
      <div className="w-full max-w-md">
        <Link to="/auth" className="flex items-center justify-center gap-2 mb-8">
          <NovaLogo className="size-12 drop-shadow-lg" />
          <span className="text-3xl font-bold tracking-tight">NovaChat</span>
        </Link>

        <Card className="p-6 shadow-xl border-border/60">
          <h1 className="text-xl font-semibold mb-1">
            {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === "signin"   ? "Sign in to continue to NovaChat" :
             mode === "signup"   ? "You'll get a unique friend code so people can find you" :
                                    "Enter your email and we'll send you a reset link"}
          </p>

          {pendingEmail && (
            <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="font-medium flex items-center gap-2"><Mail className="size-4" /> Confirm your email</p>
              <p className="text-muted-foreground mt-1">
                We sent a verification link to <span className="font-medium text-foreground">{pendingEmail}</span>. Click it to activate your account.
              </p>
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => resendConfirmation(pendingEmail)} disabled={submitting}>
                  Resend email
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setPendingEmail(null)}>
                  Dismiss
                </Button>
              </div>
            </div>
          )}

          {mode !== "forgot" && (
            <>
              <Button type="button" variant="outline" className="w-full" onClick={onGoogle} disabled={submitting}>
                <GoogleIcon className="size-4 mr-2" /> Continue with Google
              </Button>
              <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <Input id="username" placeholder="nova_user" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={24} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="display">Display name</Label>
                  <Input id="display" placeholder="Nova User" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={48} />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            {mode !== "forgot" && (
              <PasswordField id="password" label="Password" value={password} onChange={setPassword} show={showPw} onToggle={() => setShowPw((v) => !v)} />
            )}
            {mode === "signup" && (
              <PasswordField id="confirm" label="Confirm password" value={confirm} onChange={setConfirm} show={showConfirm} onToggle={() => setShowConfirm((v) => !v)}
                error={confirm.length > 0 && confirm !== password ? "Passwords don't match" : undefined} />
            )}

            {mode === "signin" && (
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setMode("forgot")}>
                Forgot password?
              </button>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Please wait…" :
                mode === "signin" ? "Sign in" :
                mode === "signup" ? "Create account" :
                <><Mail className="size-4 mr-2" />Send reset link</>}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "forgot" ? (
              <button type="button" className="text-primary font-medium hover:underline" onClick={() => setMode("signin")}>Back to sign in</button>
            ) : (
              <>
                {mode === "signin" ? "New to NovaChat?" : "Already have an account?"}{" "}
                <button type="button" className="text-primary font-medium hover:underline"
                  onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
                  {mode === "signin" ? "Create one" : "Sign in"}
                </button>
              </>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}

function PasswordField({ id, label, value, onChange, show, onToggle, error }: {
  id: string; label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void; error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} required minLength={6} className="pr-10" />
        <button type="button" onClick={onToggle} aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.6l6.2 5.2C41 35.6 44 30.3 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}
