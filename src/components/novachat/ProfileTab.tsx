import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { initials } from "@/lib/novachat-types";
import type { Profile } from "@/lib/use-auth";

export function ProfileTab({ profile, onUpdated }: { profile: Profile; onUpdated: () => Promise<void> }) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || profile.username,
        avatar_url: avatarUrl.trim() || null,
      })
      .eq("id", profile.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Profile updated"); await onUpdated(); }
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(profile.unique_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="overflow-y-auto h-full p-4 space-y-6">
      <div className="flex flex-col items-center text-center pt-2">
        <Avatar className="size-24 mb-3">
          <AvatarImage src={avatarUrl || undefined} />
          <AvatarFallback className="bg-primary/15 text-primary text-2xl">
            {initials(displayName || profile.username)}
          </AvatarFallback>
        </Avatar>
        <div className="font-semibold text-lg">{displayName || profile.username}</div>
        <div className="text-sm text-muted-foreground">@{profile.username}</div>
      </div>

      <div className="bg-accent/40 rounded-xl p-4 border border-border">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Your friend code</div>
        <div className="flex items-center justify-between gap-2">
          <div className="font-mono text-2xl font-bold tracking-wider">{profile.unique_code}</div>
          <Button size="sm" variant="ghost" onClick={copyCode}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Share this so others can find you.</p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="display">Display name</Label>
          <Input id="display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={48} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="avatar">Avatar URL</Label>
          <Input id="avatar" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div className="space-y-1.5">
          <Label>Username</Label>
          <Input value={profile.username} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={profile.email ?? ""} disabled />
        </div>
        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
