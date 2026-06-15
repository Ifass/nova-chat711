import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { initials, BUILTIN_AVATARS } from "@/lib/novachat-types";
import type { Profile } from "@/lib/use-auth";
import { QrShareDialog } from "@/components/novachat/QrFeatures";
import { cn } from "@/lib/utils";

export function ProfileTab({ profile, onUpdated }: { profile: Profile; onUpdated: () => Promise<void> }) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || profile.username,
        avatar_url: avatarUrl.trim() || null,
        bio: bio.trim() || null,
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
      {/* Profile preview */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/15 to-accent border border-border p-5 flex flex-col items-center text-center">
        <Avatar className="size-24 mb-3 ring-2 ring-background shadow-md">
          <AvatarImage src={avatarUrl || undefined} alt={displayName || profile.username} />
          <AvatarFallback className="bg-primary/20 text-primary text-2xl">
            {initials(displayName || profile.username)}
          </AvatarFallback>
        </Avatar>
        <div className="font-semibold text-lg">{displayName || profile.username}</div>
        <div className="text-sm text-muted-foreground">@{profile.username}</div>
        {bio.trim() && <p className="text-sm mt-2 max-w-xs text-foreground/80">{bio.trim()}</p>}
        <div className="mt-3"><QrShareDialog code={profile.unique_code} displayName={displayName || profile.username} /></div>
      </div>

      {/* Friend code */}
      <div className="bg-accent/40 rounded-xl p-4 border border-border">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Your friend code</div>
        <div className="flex items-center justify-between gap-2">
          <div className="font-mono text-2xl font-bold tracking-wider">{profile.unique_code}</div>
          <Button size="sm" variant="ghost" onClick={copyCode} aria-label="Copy friend code">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Share this so others can find you.</p>
      </div>

      {/* Avatar picker */}
      <div className="space-y-2">
        <Label>Choose an avatar</Label>
        <div className="grid grid-cols-6 gap-2">
          {BUILTIN_AVATARS.map((a) => {
            const selected = avatarUrl === a.url;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAvatarUrl(a.url)}
                title={a.label}
                aria-label={`Use ${a.label} avatar`}
                className={cn(
                  "aspect-square rounded-xl border-2 bg-card transition-all overflow-hidden",
                  selected ? "border-primary ring-2 ring-primary/30 scale-105" : "border-border hover:border-primary/50"
                )}
              >
                <img src={a.url} alt={a.label} className="w-full h-full object-cover" loading="lazy" />
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">Or paste a custom URL below.</p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="display">Display name</Label>
          <Input id="display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={48} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bio">About / Bio</Label>
          <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={200} rows={3} placeholder="Tell people a bit about yourself…" />
          <p className="text-xs text-muted-foreground text-right">{bio.length}/200</p>
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
