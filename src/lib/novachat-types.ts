export type ProfileLite = {
  id: string;
  username: string;
  display_name: string;
  unique_code: string;
  avatar_url: string | null;
};

export type MessageRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
};

export type FriendRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: "pending" | "accepted" | "blocked";
  created_at: string;
};

export type ReactionRow = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
};

export const REACTION_EMOJIS = ["❤️", "👍", "😂", "😢", "🔥"] as const;

// 6 built-in cartoon avatars (DiceBear public CDN — no API key, deterministic).
export const BUILTIN_AVATARS: { id: string; url: string; label: string }[] = [
  { id: "fox",    label: "Fox",    url: "https://api.dicebear.com/9.x/fun-emoji/svg?seed=Fox&backgroundColor=ffadad" },
  { id: "panda",  label: "Panda",  url: "https://api.dicebear.com/9.x/fun-emoji/svg?seed=Panda&backgroundColor=a0c4ff" },
  { id: "robot",  label: "Robot",  url: "https://api.dicebear.com/9.x/bottts/svg?seed=Nova&backgroundColor=caffbf" },
  { id: "cat",    label: "Cat",    url: "https://api.dicebear.com/9.x/fun-emoji/svg?seed=Cat&backgroundColor=ffd6a5" },
  { id: "alien",  label: "Alien",  url: "https://api.dicebear.com/9.x/bottts/svg?seed=Comet&backgroundColor=bdb2ff" },
  { id: "bear",   label: "Bear",   url: "https://api.dicebear.com/9.x/fun-emoji/svg?seed=Bear&backgroundColor=fdffb6" },
];

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const diff = (now.getTime() - d.getTime()) / 86400000;
  if (diff < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString();
}
