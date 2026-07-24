import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Star, Video, VideoOff,
  Monitor, MonitorOff, Settings2, PictureInPicture2, Signal, SignalHigh, SignalLow, SignalMedium,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  Room, RoomEvent, ConnectionState, Track, ConnectionQuality,
  type RemoteTrack, type RemoteParticipant, type LocalTrackPublication, type RemoteTrackPublication,
} from "livekit-client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { initials, type ProfileLite } from "@/lib/novachat-types";
import { cn } from "@/lib/utils";
import { getCallToken, updateCallStatus, rateCall, setCallType } from "@/lib/call.functions";

type Props = {
  callId: string;
  token: string;
  url: string;
  peer: ProfileLite;
  role: "caller" | "callee";
  initialStatus: "ringing" | "accepted";
  callType?: "voice" | "video";
  onClose: () => void;
};

export function VoiceCall({ callId, token, url, peer, role, initialStatus, callType = "voice", onClose }: Props) {
  const updateStatus = useServerFn(updateCallStatus);
  const fetchToken = useServerFn(getCallToken);
  const rate = useServerFn(rateCall);
  const changeType = useServerFn(setCallType);

  const [status, setStatus] = useState<"ringing" | "connecting" | "connected" | "ended">(
    initialStatus === "accepted" ? "connecting" : "ringing"
  );
  const [mode, setMode] = useState<"voice" | "video">(callType);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [camOn, setCamOn] = useState(callType === "video");
  const [screenOn, setScreenOn] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showRating, setShowRating] = useState(false);
  const [stars, setStars] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [quality, setQuality] = useState<ConnectionQuality>(ConnectionQuality.Unknown);
  const [pipOn, setPipOn] = useState(false);
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);

  const [devices, setDevices] = useState<{ cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[]; spks: MediaDeviceInfo[] }>({ cams: [], mics: [], spks: [] });
  const [selectedCam, setSelectedCam] = useState<string>("");
  const [selectedMic, setSelectedMic] = useState<string>("");
  const [selectedSpk, setSelectedSpk] = useState<string>("");

  const roomRef = useRef<Room | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Draggable local preview
  const pipRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef({ dragging: false, dx: 0, dy: 0 });
  const [pipPos, setPipPos] = useState<{ x: number; y: number } | null>(null);

  // timer
  useEffect(() => {
    if (status !== "connected") return;
    const start = Date.now();
    const i = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(i);
  }, [status]);

  // Watch call row for termination + type changes (upgrade to video)
  useEffect(() => {
    const ch = supabase
      .channel(`call-watch-${callId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${callId}` },
        (payload) => {
          const row = payload.new as { status?: string; call_type?: string };
          if (row.status === "ended" || row.status === "declined" || row.status === "missed") {
            setStatus("ended");
            try { roomRef.current?.disconnect(); } catch { /* ignore */ }
            roomRef.current = null;
            setShowRating(false);
            onClose();
            return;
          }
          if (row.call_type === "video" && mode !== "video") {
            setMode("video");
            toast.message(`${peer.display_name} switched to video`);
          } else if (row.call_type === "voice" && mode !== "voice") {
            setMode("voice");
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [callId, onClose, mode, peer.display_name]);

  // Ringtone / ringback
  useEffect(() => {
    if (status !== "ringing" && status !== "connecting") return;
    if (status === "connecting" && role === "callee") return;
    type AudioCtor = typeof AudioContext;
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const AC = w.AudioContext ?? w.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = role === "callee" ? 0.18 : 0.08;
    master.connect(ctx.destination);

    let stopped = false;
    const oscs: OscillatorNode[] = [];
    const playTone = (freqs: number[], durationMs: number) => {
      if (stopped) return;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.02);
      g.gain.setValueAtTime(1, ctx.currentTime + durationMs / 1000 - 0.03);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + durationMs / 1000);
      g.connect(master);
      for (const f of freqs) {
        const o = ctx.createOscillator();
        o.type = "sine"; o.frequency.value = f; o.connect(g);
        o.start(); o.stop(ctx.currentTime + durationMs / 1000 + 0.05);
        oscs.push(o);
      }
    };
    const ringOnce = () => {
      if (role === "callee") { playTone([440, 480], 400); setTimeout(() => playTone([440, 480], 400), 600); }
      else { playTone([440, 480], 1500); }
    };
    ringOnce();
    const interval = setInterval(ringOnce, role === "callee" ? 2400 : 4000);
    ctx.resume().catch(() => {});
    let vibrateInterval: ReturnType<typeof setInterval> | null = null;
    if (role === "callee" && "vibrate" in navigator) {
      try { navigator.vibrate([400, 200, 400, 1400]); } catch { /* ignore */ }
      vibrateInterval = setInterval(() => { try { navigator.vibrate?.([400, 200, 400, 1400]); } catch { /* ignore */ } }, 2400);
    }
    return () => {
      stopped = true;
      clearInterval(interval);
      if (vibrateInterval) clearInterval(vibrateInterval);
      if (role === "callee" && "vibrate" in navigator) { try { navigator.vibrate(0); } catch { /* ignore */ } }
      oscs.forEach((o) => { try { o.stop(); } catch { /* ignore */ } });
      ctx.close().catch(() => {});
    };
  }, [status, role]);

  const attachRemoteVideo = useCallback((reason = "manual") => {
    const room = roomRef.current;
    const el = remoteVideoRef.current;
    console.log("[Call] attachRemoteVideo()", {
      reason,
      roomReady: !!room,
      elementReady: !!el,
      remoteParticipants: room ? Array.from(room.remoteParticipants.values()).map((p) => ({
        identity: p.identity,
        tracks: Array.from(p.trackPublications.values()).map((pub) => ({
          sid: pub.trackSid,
          source: pub.source,
          kind: pub.kind,
          muted: pub.isMuted,
          subscribed: pub.isSubscribed,
          hasTrack: !!pub.track,
        })),
      })) : [],
    });
    if (!room || !el) return;
    for (const p of room.remoteParticipants.values()) {
      const cam = p.getTrackPublication(Track.Source.Camera) ?? p.getTrackPublication(Track.Source.ScreenShare);
      if (cam?.track && cam.track.kind === Track.Kind.Video && !cam.isMuted) {
        setRemoteHasVideo(true);
        console.log("[Call] Video element attached", {
          target: "remote",
          participant: p.identity,
          source: cam.source,
          sid: cam.trackSid,
          mediaStreamTrackState: cam.track.mediaStreamTrack.readyState,
          enabled: cam.track.mediaStreamTrack.enabled,
        });
        cam.track.attach(el);
        void el.play().catch((e) => console.warn("[Call] remote video play() blocked", e));
        setRemoteHasVideo(true);
        return;
      }
    }
    el.srcObject = null;
    setRemoteHasVideo(false);
  }, []);

  const attachLocalVideo = useCallback((reason = "manual") => {
    const room = roomRef.current;
    const el = localVideoRef.current;
    const pub = room?.localParticipant.getTrackPublication(Track.Source.Camera);
    const hasLiveCamera = !!pub?.track && !pub.isMuted && pub.track.mediaStreamTrack.readyState === "live";
    console.log("[Call] attachLocalVideo()", {
      reason,
      roomReady: !!room,
      elementReady: !!el,
      publication: pub ? {
        sid: pub.trackSid,
        source: pub.source,
        kind: pub.kind,
        muted: pub.isMuted,
        hasTrack: !!pub.track,
        mediaStreamTrackState: pub.track?.mediaStreamTrack.readyState,
        enabled: pub.track?.mediaStreamTrack.enabled,
      } : null,
      hasLiveCamera,
    });
    setCamOn(hasLiveCamera);
    if (!room || !el) return;
    const track = pub?.track;
    if (track && !pub.isMuted) {
      console.log("[Call] Video element attached", {
        target: "local",
        source: pub.source,
        sid: pub.trackSid,
        mediaStreamTrackState: track.mediaStreamTrack.readyState,
        enabled: track.mediaStreamTrack.enabled,
      });
      track.attach(el);
      void el.play().catch((e) => console.warn("[Call] local video play() blocked", e));
    } else {
      el.srcObject = null;
    }
  }, []);

  const cancelledRef = useRef(false);

  const connect = async (tk: string, initialVideo: boolean) => {
    console.log("[Call] connect() start", { callId, role, mode, initialVideo, url: url?.slice(0, 40), tokenLen: tk?.length });
    if (cancelledRef.current) { console.warn("[Call] connect aborted: cancelled"); return; }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      console.error("[Call] not a secure context — getUserMedia will be blocked");
      toast.error("Calls require HTTPS");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      console.error("[Call] navigator.mediaDevices.getUserMedia unavailable");
      toast.error("This browser can't access mic/camera");
      return;
    }
    // Pre-flight: request permission BEFORE joining the room so the prompt is
    // never gated by the LiveKit handshake, and we get a clear error if denied.
    try {
      console.log("[Call] getUserMedia pre-flight", { video: initialVideo, audio: true });
      const pre = await navigator.mediaDevices.getUserMedia({ audio: true, video: initialVideo });
      console.log("[Call] Camera permission granted", { tracks: pre.getTracks().map((t) => `${t.kind}:${t.label}:${t.readyState}`) });
      pre.getTracks().forEach((t) => t.stop());
    } catch (e) {
      console.error("[Call] getUserMedia FAILED", e);
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      toast.error(`Mic/Camera permission needed — ${msg}`);
      onClose();
      return;
    }

    if (roomRef.current) { try { await roomRef.current.disconnect(); } catch { /* ignore */ } roomRef.current = null; }
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    const markConnectedIfPeerPresent = () => {
      if (cancelledRef.current) return;
      if (room.remoteParticipants.size > 0) setStatus("connected");
    };

    room.on(RoomEvent.TrackPublished, (pub: RemoteTrackPublication, participant: RemoteParticipant) => {
      console.log("[Call] Remote video track received", {
        participant: participant.identity,
        source: pub.source,
        kind: pub.kind,
        sid: pub.trackSid,
        muted: pub.isMuted,
        subscribed: pub.isSubscribed,
        hasTrack: !!pub.track,
      });
    });
    room.on(RoomEvent.TrackSubscriptionFailed, (trackSid, participant) => {
      console.error("[Call] Remote track subscription failed", { trackSid, participant: participant.identity });
    });
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub, participant) => {
      console.log("[Call] Remote video track subscribed", {
        participant: participant.identity,
        kind: track.kind,
        source: track.source,
        sid: pub.trackSid,
        mediaStreamTrackState: track.mediaStreamTrack.readyState,
        enabled: track.mediaStreamTrack.enabled,
      });
      if (track.kind === Track.Kind.Audio && audioElRef.current) track.attach(audioElRef.current);
      if (track.kind === Track.Kind.Video) attachRemoteVideo("track-subscribed");
    });
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      try { track.detach(); } catch { /* ignore */ }
      if (track.kind === Track.Kind.Video) attachRemoteVideo("track-unsubscribed");
    });
    room.on(RoomEvent.TrackMuted, (pub, participant) => {
      console.log("[Call] TrackMuted", { participant: participant.identity, source: pub.source, kind: pub.kind, local: participant.isLocal });
      if (participant.isLocal && pub.source === Track.Source.Camera) attachLocalVideo("local-track-muted");
      if (!participant.isLocal && pub.kind === Track.Kind.Video) attachRemoteVideo("remote-track-muted");
    });
    room.on(RoomEvent.TrackUnmuted, (pub, participant) => {
      console.log("[Call] TrackUnmuted", { participant: participant.identity, source: pub.source, kind: pub.kind, local: participant.isLocal });
      if (participant.isLocal && pub.source === Track.Source.Camera) attachLocalVideo("local-track-unmuted");
      if (!participant.isLocal && pub.kind === Track.Kind.Video) attachRemoteVideo("remote-track-unmuted");
    });
    room.on(RoomEvent.ParticipantConnected, (p) => { console.log("[Call] Remote participant connected", { identity: p.identity }); markConnectedIfPeerPresent(); attachRemoteVideo("participant-connected"); });
    room.on(RoomEvent.ParticipantDisconnected, (p) => { console.log("[Call] ParticipantDisconnected", p.identity); endCall("remote_left"); });
    room.on(RoomEvent.ConnectionStateChanged, (s) => {
      console.log("[Call] ConnectionStateChanged", s);
      if (s === ConnectionState.Connected) markConnectedIfPeerPresent();
      if (s === ConnectionState.Disconnected) setStatus((cur) => cur === "ended" ? cur : "ended");
    });
    room.on(RoomEvent.ConnectionQualityChanged, (q, p) => {
      if (p?.identity === room.localParticipant.identity) setQuality(q);
    });
    room.on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
      console.log("[Call] Video track published", {
        source: pub.source,
        kind: pub.kind,
        sid: pub.trackSid,
        muted: pub.isMuted,
        hasTrack: !!pub.track,
        mediaStreamTrackState: pub.track?.mediaStreamTrack.readyState,
        enabled: pub.track?.mediaStreamTrack.enabled,
      });
      if (pub.source === Track.Source.Camera) attachLocalVideo("local-track-published");
    });
    room.on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
      console.log("[Call] LocalTrackUnpublished", { source: pub.source, kind: pub.kind, sid: pub.trackSid });
      if (pub.source === Track.Source.Camera) attachLocalVideo("local-track-unpublished");
    });
    room.on(RoomEvent.MediaDevicesError, (e) => { console.error("[Call] MediaDevicesError", e); });

    try {
      console.log("[Call] room.connect →", url);
      await room.connect(url, tk);
      console.log("[Call] room.connect OK; enabling mic…");
      if (cancelledRef.current) { await room.disconnect(); return; }
      await room.localParticipant.setMicrophoneEnabled(true);
      console.log("[Call] mic enabled", {
        isMicrophoneEnabled: room.localParticipant.isMicrophoneEnabled,
        micPublication: !!room.localParticipant.getTrackPublication(Track.Source.Microphone),
      });
      if (initialVideo) {
        try {
          console.log("[Call] enabling camera…");
          const pub = await room.localParticipant.setCameraEnabled(true);
          console.log("[Call] Local video track created", {
            returnedPublication: !!pub,
            sid: pub?.trackSid,
            source: pub?.source,
            kind: pub?.kind,
            muted: pub?.isMuted,
            hasTrack: !!pub?.track,
            mediaStreamTrackState: pub?.track?.mediaStreamTrack.readyState,
            enabled: pub?.track?.mediaStreamTrack.enabled,
            isCameraEnabled: room.localParticipant.isCameraEnabled,
          });
          attachLocalVideo("camera-enabled");
          console.log("[Call] camera enabled", { isCameraEnabled: room.localParticipant.isCameraEnabled });
        } catch (camErr) {
          console.error("[Call] camera enable failed", camErr);
          setCamOn(false);
          toast.error(camErr instanceof Error ? `Camera: ${camErr.message}` : "Camera unavailable");
        }
      }
      attachLocalVideo("post-connect");
      attachRemoteVideo("post-connect");
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices({
          cams: list.filter((d) => d.kind === "videoinput"),
          mics: list.filter((d) => d.kind === "audioinput"),
          spks: list.filter((d) => d.kind === "audiooutput"),
        });
      } catch { /* ignore */ }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[Call] room.connect failed", e);
      if (cancelledRef.current || /client initiated disconnect/i.test(msg)) return;
      throw e;
    }
  };

  // Caller connects immediately; callee connects after accepting
  useEffect(() => {
    cancelledRef.current = false;
    console.log("[Call] mount", { callId, role, initialStatus, callType, mode });
    if (role === "caller") {
      setStatus("connecting");
      connect(token, mode === "video").catch((e) => { console.error("[Call] caller connect error", e); toast.error(e.message); onClose(); });
    } else if (initialStatus === "accepted") {
      connect(token, mode === "video").catch((e) => { console.error("[Call] callee connect error", e); toast.error(e.message); onClose(); });
    }
    return () => {
      cancelledRef.current = true;
      const r = roomRef.current;
      roomRef.current = null;
      if (r) r.disconnect().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-attach remote video when its element (re)mounts due to mode switch
  useEffect(() => { if (mode === "video") { attachRemoteVideo("mode-effect"); attachLocalVideo("mode-effect"); } }, [mode, camOn, remoteHasVideo, attachRemoteVideo, attachLocalVideo]);

  const accept = async () => {
    try {
      await updateStatus({ data: { callId, status: "accepted" } });
      const t = await fetchToken({ data: { callId } });
      setStatus("connecting");
      await connect(t.token, mode === "video");
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
    if (audioElRef.current) audioElRef.current.muted = speaker;
    setSpeaker((s) => !s);
  };

  const toggleCamera = async () => {
    const r = roomRef.current; if (!r) return;
    const next = !camOn;
    try {
      console.log("[Call] toggleCamera", { next, currentLiveKitState: r.localParticipant.isCameraEnabled });
      const pub = await r.localParticipant.setCameraEnabled(next);
      console.log("[Call] toggleCamera result", {
        next,
        returnedPublication: !!pub,
        sid: pub?.trackSid,
        muted: pub?.isMuted,
        hasTrack: !!pub?.track,
        mediaStreamTrackState: pub?.track?.mediaStreamTrack.readyState,
        isCameraEnabled: r.localParticipant.isCameraEnabled,
      });
      attachLocalVideo("toggle-camera");
      if (next && mode !== "video") {
        setMode("video");
        try { await changeType({ data: { callId, callType: "video" } }); } catch { /* ignore */ }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Camera error");
    }
  };

  const switchToVideo = async () => {
    if (mode === "video") return;
    setMode("video");
    try { await changeType({ data: { callId, callType: "video" } }); } catch { /* ignore */ }
    const r = roomRef.current;
    if (r && !r.localParticipant.isCameraEnabled) {
      try {
        console.log("[Call] switchToVideo enabling camera");
        const pub = await r.localParticipant.setCameraEnabled(true);
        console.log("[Call] switchToVideo camera result", {
          returnedPublication: !!pub,
          sid: pub?.trackSid,
          muted: pub?.isMuted,
          hasTrack: !!pub?.track,
          mediaStreamTrackState: pub?.track?.mediaStreamTrack.readyState,
          isCameraEnabled: r.localParticipant.isCameraEnabled,
        });
        attachLocalVideo("switch-to-video");
      } catch (e) { console.error("[Call] switchToVideo camera failed", e); }
    }
  };

  const switchToVoice = async () => {
    if (mode === "voice") return;
    const r = roomRef.current;
    if (r) { try { await r.localParticipant.setCameraEnabled(false); attachLocalVideo("switch-to-voice"); } catch { /* ignore */ } }
    setMode("voice");
    try { await changeType({ data: { callId, callType: "voice" } }); } catch { /* ignore */ }
  };

  const toggleScreenShare = async () => {
    const r = roomRef.current; if (!r) return;
    try {
      await r.localParticipant.setScreenShareEnabled(!screenOn);
      setScreenOn(!screenOn);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Screen share unavailable");
    }
  };

  const togglePip = async () => {
    const v = remoteVideoRef.current; if (!v) return;
    type PipDoc = Document & { pictureInPictureElement?: Element | null; exitPictureInPicture?: () => Promise<void> };
    type PipVideo = HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> };
    const doc = document as PipDoc;
    try {
      if (doc.pictureInPictureElement) { await doc.exitPictureInPicture?.(); setPipOn(false); }
      else { await (v as PipVideo).requestPictureInPicture?.(); setPipOn(true); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PiP not supported");
    }
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current; if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch { /* ignore */ }
  };

  const chooseCam = async (id: string) => {
    setSelectedCam(id);
    try { await roomRef.current?.switchActiveDevice("videoinput", id); attachLocalVideo("choose-camera"); } catch { /* ignore */ }
  };
  const chooseMic = async (id: string) => {
    setSelectedMic(id);
    try { await roomRef.current?.switchActiveDevice("audioinput", id); } catch { /* ignore */ }
  };
  const chooseSpk = async (id: string) => {
    setSelectedSpk(id);
    try {
      await roomRef.current?.switchActiveDevice("audiooutput", id);
      const a = audioElRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
      await a?.setSinkId?.(id);
    } catch { /* ignore */ }
  };

  const submitRating = async () => {
    if (stars > 0) { try { await rate({ data: { callId, stars, feedback: feedback.trim() || undefined } }); } catch { /* ignore */ } }
    setShowRating(false); onClose();
  };

  // Draggable local video PiP
  const onPipPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = pipRef.current; if (!el) return;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    dragState.current = { dragging: true, dx: e.clientX - rect.left, dy: e.clientY - rect.top };
  };
  const onPipPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.dragging) return;
    const el = pipRef.current; if (!el) return;
    const parent = containerRef.current?.getBoundingClientRect();
    if (!parent) return;
    const x = Math.max(8, Math.min(parent.width - el.offsetWidth - 8, e.clientX - parent.left - dragState.current.dx));
    const y = Math.max(8, Math.min(parent.height - el.offsetHeight - 8, e.clientY - parent.top - dragState.current.dy));
    setPipPos({ x, y });
  };
  const onPipPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = pipRef.current;
    try { el?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    dragState.current.dragging = false;
  };

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const qualityIcon = useMemo(() => {
    if (quality === ConnectionQuality.Excellent) return { Icon: SignalHigh, tone: "text-emerald-400", label: "Excellent" };
    if (quality === ConnectionQuality.Good) return { Icon: SignalMedium, tone: "text-emerald-300", label: "Good" };
    if (quality === ConnectionQuality.Poor) return { Icon: SignalLow, tone: "text-amber-400", label: "Poor" };
    return { Icon: Signal, tone: "text-white/60", label: "—" };
  }, [quality]);

  const isVideo = mode === "video" && status === "connected";

  return (
    <div
      ref={containerRef}
      className={cn(
        "fixed inset-0 z-[100] flex flex-col text-foreground",
        isVideo ? "bg-black text-white" : "bg-gradient-to-b from-primary/95 to-background"
      )}
    >
      <audio ref={audioElRef} autoPlay playsInline />

      {isVideo ? (
        <>
          {/* Remote full-screen video */}
          <div className="absolute inset-0">
            {remoteHasVideo ? (
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover bg-black" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-zinc-900 to-black">
                <Avatar className="size-28 ring-4 ring-white/10">
                  <AvatarImage src={peer.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-3xl">{initials(peer.display_name)}</AvatarFallback>
                </Avatar>
                <div className="text-white/80 text-sm">{peer.display_name}'s camera is off</div>
              </div>
            )}
          </div>

          {/* Top bar */}
          <div className="relative z-10 flex items-center gap-3 p-4 bg-gradient-to-b from-black/60 to-transparent">
            <Avatar className="size-9 ring-2 ring-white/20">
              <AvatarImage src={peer.avatar_url ?? undefined} />
              <AvatarFallback>{initials(peer.display_name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{peer.display_name}</div>
              <div className="text-xs text-white/70 font-mono">{fmt(elapsed)}</div>
            </div>
            <div className="flex items-center gap-1 text-xs bg-white/10 rounded-full px-2 py-1">
              <qualityIcon.Icon className={cn("size-4", qualityIcon.tone)} />
              <span className="hidden sm:inline">{qualityIcon.label}</span>
            </div>
          </div>

          {/* Draggable local preview */}
          <div
            ref={pipRef}
            onPointerDown={onPipPointerDown}
            onPointerMove={onPipPointerMove}
            onPointerUp={onPipPointerUp}
            style={pipPos ? { left: pipPos.x, top: pipPos.y, right: "auto", bottom: "auto" } : undefined}
            className="absolute right-4 bottom-32 sm:bottom-28 w-28 h-40 sm:w-36 sm:h-52 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/20 bg-black/60 cursor-grab active:cursor-grabbing touch-none select-none"
          >
            {camOn ? (
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            ) : (
              <div className="w-full h-full grid place-items-center bg-zinc-900 text-white/60 text-xs">
                <VideoOff className="size-6" />
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <div className="text-xs uppercase tracking-widest text-primary-foreground/80 mb-3">
            {status === "ringing" && role === "caller" && `Calling…${callType === "video" ? " (video)" : ""}`}
            {status === "ringing" && role === "callee" && `Incoming ${callType} call`}
            {status === "connecting" && "Connecting…"}
            {status === "connected" && "On call"}
            {status === "ended" && "Call ended"}
          </div>
          <Avatar className="size-32 mb-5 ring-4 ring-primary-foreground/30 shadow-2xl">
            <AvatarImage src={peer.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary text-primary-foreground text-4xl">{initials(peer.display_name)}</AvatarFallback>
          </Avatar>
          <div className="text-2xl font-semibold text-primary-foreground">{peer.display_name}</div>
          <div className="text-sm text-primary-foreground/70 mb-6">@{peer.username}</div>
          {status === "connected" && <div className="font-mono text-lg text-primary-foreground/90">{fmt(elapsed)}</div>}
          {status === "connected" && (
            <div className="mt-3 flex items-center gap-1 text-xs text-primary-foreground/70">
              <qualityIcon.Icon className={cn("size-4", qualityIcon.tone)} />
              <span>{qualityIcon.label}</span>
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className={cn("relative z-10 pb-8 sm:pb-10 px-4 sm:px-6 flex justify-center", isVideo && "pt-6 bg-gradient-to-t from-black/70 to-transparent")}>
        {status === "ringing" && role === "callee" ? (
          <div className="flex gap-5">
            <button onClick={decline} className="size-16 rounded-full bg-destructive text-destructive-foreground grid place-items-center shadow-lg hover:scale-105 transition" aria-label="Decline">
              <PhoneOff className="size-7" />
            </button>
            <button onClick={accept} className="size-16 rounded-full bg-emerald-500 text-white grid place-items-center shadow-lg hover:scale-105 transition" aria-label="Accept">
              {callType === "video" ? <Video className="size-7" /> : <Phone className="size-7" />}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center items-center gap-3 sm:gap-4 max-w-full">
            <button onClick={toggleMute} className={cn("size-12 sm:size-14 rounded-full grid place-items-center backdrop-blur transition", muted ? "bg-destructive text-destructive-foreground" : isVideo ? "bg-white/15 text-white hover:bg-white/25" : "bg-white/15 text-primary-foreground hover:bg-white/25")} aria-label={muted ? "Unmute" : "Mute"}>
              {muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
            </button>

            <button onClick={toggleCamera} disabled={status !== "connected"} className={cn("size-12 sm:size-14 rounded-full grid place-items-center backdrop-blur transition disabled:opacity-40", !camOn ? "bg-white/15 text-white/90 hover:bg-white/25" : "bg-white text-black hover:bg-white/90")} aria-label={camOn ? "Turn camera off" : "Turn camera on"}>
              {camOn ? <Video className="size-6" /> : <VideoOff className="size-6" />}
            </button>

            {mode === "video" ? (
              <button onClick={switchToVoice} className="size-12 sm:size-14 rounded-full grid place-items-center bg-white/15 text-white hover:bg-white/25 transition" aria-label="Switch to voice">
                <Phone className="size-6" />
              </button>
            ) : (
              <button onClick={switchToVideo} disabled={status !== "connected"} className="size-12 sm:size-14 rounded-full grid place-items-center bg-white/15 text-primary-foreground hover:bg-white/25 transition disabled:opacity-40" aria-label="Switch to video">
                <Video className="size-6" />
              </button>
            )}

            <button onClick={() => endCall("hangup")} className="size-16 rounded-full bg-destructive text-destructive-foreground grid place-items-center shadow-lg hover:scale-105 transition" aria-label="End call">
              <PhoneOff className="size-7" />
            </button>

            <button onClick={toggleSpeaker} className={cn("size-12 sm:size-14 rounded-full grid place-items-center backdrop-blur transition", !speaker ? "bg-white/35 text-primary-foreground" : isVideo ? "bg-white/15 text-white hover:bg-white/25" : "bg-white/15 text-primary-foreground hover:bg-white/25")} aria-label="Toggle speaker">
              {speaker ? <Volume2 className="size-6" /> : <VolumeX className="size-6" />}
            </button>

            {isVideo && (
              <button onClick={toggleScreenShare} className={cn("size-12 sm:size-14 rounded-full grid place-items-center transition", screenOn ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25")} aria-label="Share screen">
                {screenOn ? <MonitorOff className="size-6" /> : <Monitor className="size-6" />}
              </button>
            )}
            {isVideo && "pictureInPictureEnabled" in document && (
              <button onClick={togglePip} className={cn("size-12 sm:size-14 rounded-full grid place-items-center transition", pipOn ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25")} aria-label="Picture in picture">
                <PictureInPicture2 className="size-6" />
              </button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={cn("size-12 sm:size-14 rounded-full grid place-items-center backdrop-blur transition", isVideo ? "bg-white/15 text-white hover:bg-white/25" : "bg-white/15 text-primary-foreground hover:bg-white/25")} aria-label="Devices">
                  <Settings2 className="size-6" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 overflow-auto w-64">
                <DropdownMenuLabel>Microphone</DropdownMenuLabel>
                {devices.mics.length === 0 && <DropdownMenuItem disabled>None</DropdownMenuItem>}
                {devices.mics.map((d) => (
                  <DropdownMenuItem key={d.deviceId} onClick={() => chooseMic(d.deviceId)}>
                    {selectedMic === d.deviceId ? "✓ " : ""}{d.label || "Microphone"}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Camera</DropdownMenuLabel>
                {devices.cams.length === 0 && <DropdownMenuItem disabled>None</DropdownMenuItem>}
                {devices.cams.map((d) => (
                  <DropdownMenuItem key={d.deviceId} onClick={() => chooseCam(d.deviceId)}>
                    {selectedCam === d.deviceId ? "✓ " : ""}{d.label || "Camera"}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Speaker</DropdownMenuLabel>
                {devices.spks.length === 0 && <DropdownMenuItem disabled>Default</DropdownMenuItem>}
                {devices.spks.map((d) => (
                  <DropdownMenuItem key={d.deviceId} onClick={() => chooseSpk(d.deviceId)}>
                    {selectedSpk === d.deviceId ? "✓ " : ""}{d.label || "Speaker"}
                  </DropdownMenuItem>
                ))}
                {isVideo && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={toggleFullscreen}>Toggle fullscreen</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <Dialog open={showRating} onOpenChange={(o) => { if (!o) { setShowRating(false); onClose(); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>How was your call?</DialogTitle></DialogHeader>
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
