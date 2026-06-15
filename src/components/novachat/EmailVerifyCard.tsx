import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { requestEmailOtp, verifyEmailOtp } from "@/lib/email-otp.functions";
import type { Profile } from "@/lib/use-auth";

export function EmailVerifyCard({ profile, onVerified }: { profile: Profile; onVerified: () => void | Promise<void> }) {
  const reqOtp = useServerFn(requestEmailOtp);
  const verify = useServerFn(verifyEmailOtp);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");

  if ((profile as Profile & { email_verified?: boolean }).email_verified) {
    return (
      <div className="rounded-xl border border-border bg-accent/30 p-4 flex items-center gap-3">
        <ShieldCheck className="size-5 text-emerald-500" />
        <div>
          <div className="font-medium text-sm">Email verified</div>
          <div className="text-xs text-muted-foreground">{profile.email}</div>
        </div>
      </div>
    );
  }

  const sendCode = async () => {
    setSending(true);
    try {
      const r = await reqOtp();
      if (r.alreadyVerified) { toast.success("Already verified"); await onVerified(); return; }
      setSent(true);
      toast.success("Code sent to your email");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send code");
    } finally { setSending(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    try {
      await verify({ data: { code } });
      toast.success("Email verified!");
      setCode(""); setSent(false);
      await onVerified();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally { setVerifying(false); }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-lg bg-primary/15 text-primary grid place-items-center shrink-0">
          <Mail className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm">Verify your email</div>
          <div className="text-xs text-muted-foreground">Add a layer of trust to your account. We'll email a 6-digit code to <span className="font-medium">{profile.email}</span>.</div>
        </div>
      </div>
      {!sent ? (
        <Button onClick={sendCode} disabled={sending} className="w-full">
          {sending && <Loader2 className="size-4 mr-2 animate-spin" />}
          Send verification code
        </Button>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          <Input
            inputMode="numeric" pattern="\d{6}" maxLength={6} placeholder="123456"
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="text-center text-lg tracking-[0.5em] font-mono"
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={sendCode} disabled={sending}>
              Resend
            </Button>
            <Button type="submit" disabled={verifying || code.length !== 6} className="flex-1">
              {verifying ? "Verifying…" : "Verify"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
