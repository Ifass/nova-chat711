import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Star } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  Room, RoomEvent, ConnectionState, Track,
  type RemoteTrack, type RemoteParticipant,
} from "livekit-client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { initials, type ProfileLite } from "@/lib/novachat-types";
import { cn } from "@/lib/utils";
import { getCallToken, updateCallStatus, rateCall } from "@/lib/call.functions";

type Props = {
  callId: string;
  token: string;
  url: string;
  peer: ProfileLite;
  role: "caller" | "callee";
  initialStatus: "ringing" | "accepted";
  onClose: () => void;
};

export function VoiceCall({ callId, token, url, peer, role, initialStatus, onClose }: Props) {
  const updateStatus = useServerFn(updateCallStatus);
  const fetchToken = useServerFn(getCallToken);
  const rate = useServerFn(rateCall);

  const [status, setStatus] = useState<"ringing" | "connecting" | "connected" | "ended">(
    initialStatus === "accepted" ? "connecting" : "ringing"
  );
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [showRating, setShowRating] = useState(false);
  const [stars, setStars] = useState(0);
  const [feedback, setFeedback] = useState("");

  const roomRef = useRef<Room | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // timer
  useEffect(() => {
    if (status !== "connected") return;
    const start = Date.now();
    const i = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(i);
  }, [status]);

  const connect = async (tk: string) => {
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, _p: RemoteParticipant) => {
      if (track.kind === Track.Kind.Audio && audioElRef.current) {
        track.attach(audioElRef.current);
      }
    });
    room.on(RoomEvent.ParticipantDisconnected, () => endCall("remote_left"));
    room.on(RoomEvent.ConnectionStateChanged, (s) => {
      if (s === ConnectionState.Connected) setStatus("connected");
      if (s === ConnectionState.Disconnected) setStatus((cur) => cur === "ended" ? cur : "ended");
    });
    await room.connect(url, tk);
    await room.localParticipant.setMicrophoneEnabled(true);
  };

  // Caller: connect immediately. Callee: connects after accepting.
  useEffect(() => {
    if (role === "caller") {
      setStatus("connecting");
      connect(token).catch((e) => { toast.error(e.message); onClose(); });
    } else if (initialStatus === "accepted") {
      connect(token).catch((e) => { toast.error(e.message); onClose(); });
    }
    return () => { roomRef.current?.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accept = async () => {
    try {
      await updateStatus({ data: { callId, status: "accepted" } });
      const t = await fetchToken({ data: { callId } });
      setStatus("connecting");
      await connect(t.token);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to join");
      onClose();
    }
  };

  const decline = async () => {
    try { await updateStatus({ data: { callId, status: "declined" } }); } catch { /* ignore */ }
    onClose();
  };

  const endCall = async (reason = "hangup") => {
    if (status === "ended") return;
    setStatus("ended");
    try { await updateStatus({ data: { callId, status: "ended", reason } }); } catch { /* ignore */ }
    roomRef.current?.disconnect();
    if (elapsed > 0) setShowRating(true); else onClose();
  };

  const toggleMute = async () => {
    const r = roomRef.current; if (!r) return;
    const next = !muted;
    await r.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  };

  const toggleSpeaker = () => {
    if (audioElRef.current) audioElRef.current.muted = speaker; // currently on → mute output
    setSpeaker((s) => !s);
  };

  const submitRating = async () => {
    if (stars > 0) {
      try { await rate({ data: { callId, stars, feedback: feedback.trim() || undefined } }); } catch { /* ignore */ }
    }
    setShowRating(false); onClose();
  };

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-primary/95 to-background text-foreground flex flex-col">
      <audio ref={audioElRef} autoPlay playsInline />
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <div className="text-xs uppercase tracking-widest text-primary-foreground/80 mb-3">
          {status === "ringing" && role === "caller" && "Calling…"}
          {status === "ringing" && role === "callee" && "Incoming voice call"}
          {status === "connecting" && "Connecting…"}
          {status === "connected" && "On call"}
          {status === "ended" && "Call ended"}
        </div>
        <Avatar className="size-32 mb-5 ring-4 ring-primary-foreground/30 shadow-2xl">
          <AvatarImage src={peer.avatar_url ?? undefined} />
          <AvatarFallback className="bg-primary text-primary-foreground text-4xl">
            {initials(peer.display_name)}
          </AvatarFallback>
        </Avatar>
        <div className="text-2xl font-semibold text-primary-foreground">{peer.display_name}</div>
        <div className="text-sm text-primary-foreground/70 mb-6">@{peer.username}</div>
        {status === "connected" && (
          <div className="font-mono text-lg text-primary-foreground/90">{fmt(elapsed)}</div>
        )}
      </div>

      <div className="pb-10 px-6 flex justify-center gap-5">
        {status === "ringing" && role === "callee" ? (
          <>
            <button onClick={decline} className="size-16 rounded-full bg-destructive text-destructive-foreground grid place-items-center shadow-lg hover:scale-105 transition" aria-label="Decline">
              <PhoneOff className="size-7" />
            </button>
            <button onClick={accept} className="size-16 rounded-full bg-emerald-500 text-white grid place-items-center shadow-lg hover:scale-105 transition" aria-label="Accept">
              <Phone className="size-7" />
            </button>
          </>
        ) : (
          <>
            <button onClick={toggleMute} className={cn("size-14 rounded-full grid place-items-center backdrop-blur transition", muted ? "bg-destructive text-destructive-foreground" : "bg-white/15 text-primary-foreground hover:bg-white/25")} aria-label={muted ? "Unmute" : "Mute"}>
              {muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
            </button>
            <button onClick={() => endCall("hangup")} className="size-16 rounded-full bg-destructive text-destructive-foreground grid place-items-center shadow-lg hover:scale-105 transition" aria-label="End call">
              <PhoneOff className="size-7" />
            </button>
            <button onClick={toggleSpeaker} className={cn("size-14 rounded-full grid place-items-center backdrop-blur transition", !speaker ? "bg-white/35 text-primary-foreground" : "bg-white/15 text-primary-foreground hover:bg-white/25")} aria-label="Toggle speaker">
              {speaker ? <Volume2 className="size-6" /> : <VolumeX className="size-6" />}
            </button>
          </>
        )}
      </div>

      <Dialog open={showRating} onOpenChange={(o) => { if (!o) { setShowRating(false); onClose(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How was your call?</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center gap-1 py-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setStars(n)} aria-label={`${n} stars`}>
                <Star className={cn("size-9 transition", n <= stars ? "fill-yellow-400 stroke-yellow-500" : "stroke-muted-foreground")} />
              </button>
            ))}
          </div>
          <Textarea placeholder="Optional feedback…" value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={500} rows={3} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowRating(false); onClose(); }}>Skip</Button>
            <Button onClick={submitRating}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
