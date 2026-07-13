import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { NovaLogo } from "@/components/NovaLogo";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset your NovaChat password" },
      { name: "description", content: "Set a new password for your NovaChat account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [show2, setShow2] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery hash automatically; check we have a session.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (password !== confirm) { toast.error("Passwords don't match"); return; }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated. You're signed in.");
    navigate({ to: "/" });
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-accent/30 to-primary/10">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <NovaLogo className="size-12 drop-shadow-lg" />
          <span className="text-3xl font-bold tracking-tight">NovaChat</span>
        </div>
        <Card className="p-6 shadow-xl">
          <h1 className="text-xl font-semibold mb-1">Set a new password</h1>
          <p className="text-sm text-muted-foreground mb-6">
            {ready ? "Enter your new password below." : "Verifying your reset link…"}
          </p>
          {ready && (
            <form onSubmit={submit} className="space-y-4">
              <Field id="new" label="New password" value={password} onChange={setPassword} show={show} onToggle={() => setShow((v) => !v)} />
              <Field id="confirm" label="Confirm new password" value={confirm} onChange={setConfirm} show={show2} onToggle={() => setShow2((v) => !v)}
                error={confirm.length > 0 && confirm !== password ? "Passwords don't match" : undefined} />
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}

function Field({ id, label, value, onChange, show, onToggle, error }: {
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
