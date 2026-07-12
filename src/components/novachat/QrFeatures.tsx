import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
import { QrCode, Share2, Copy, Check, Camera, X, RefreshCw, SwitchCamera, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ProfileLite } from "@/lib/novachat-types";

const APP_BASE = "https://nova-chat711.lovable.app";

export function buildShareUrl(code: string) {
  return `${APP_BASE}/?add=${encodeURIComponent(code)}`;
}

/** Personal QR + share for the current user. */
export function QrShareDialog({ code, displayName }: { code: string; displayName: string }) {
  const [dataUrl, setDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const link = buildShareUrl(code);

  useEffect(() => {
    QRCode.toDataURL(link, { width: 280, margin: 1, color: { dark: "#000000", light: "#ffffff" } })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [link]);

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Invite link copied");
  };
  const share = async () => {
    const data = { title: "Add me on NovaChat", text: `Add me on NovaChat — my code is ${code}`, url: link };
    if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share) {
      try { await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share(data); }
      catch { /* user cancelled */ }
    } else { copy(); }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><QrCode className="size-4 mr-1.5" /> My QR</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{displayName}'s QR code</DialogTitle></DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {dataUrl ? (
            <img src={dataUrl} alt="Your NovaChat QR code" className="rounded-xl border border-border bg-white p-2" width={280} height={280} />
          ) : (
            <div className="size-[280px] bg-muted rounded-xl animate-pulse" />
          )}
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Friend code</div>
            <div className="font-mono text-2xl font-bold tracking-wider">{code}</div>
          </div>
          <div className="flex gap-2 w-full">
            <Button variant="outline" className="flex-1" onClick={copy}>
              {copied ? <Check className="size-4 mr-1.5" /> : <Copy className="size-4 mr-1.5" />} Copy link
            </Button>
            <Button className="flex-1" onClick={share}><Share2 className="size-4 mr-1.5" /> Share</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Scan a friend's QR code to send them a friend request. */
export function QrScanDialog({ me, onAdded }: { me: ProfileLite; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startingRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [inIframe, setInIframe] = useState(false);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [currentCamId, setCurrentCamId] = useState<string | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [attempt, setAttempt] = useState(0);

  const handleDecoded = useCallback(async (raw: string) => {
    let code = raw.trim();
    try { const u = new URL(raw); code = u.searchParams.get("add") ?? code; } catch { /* not a url */ }
    code = code.toUpperCase();
    if (!/^[A-Z]{3}-[A-Z0-9]{4}$/.test(code)) { toast.error("Not a valid NovaChat code"); return; }
    const { data: profiles, error: searchErr } = await supabase.rpc("search_users", { q: code });
    if (searchErr) { toast.error(searchErr.message); return; }
    const found = (profiles ?? [])[0];
    if (!found) { toast.error("No user found with that code"); return; }
    if (found.id === me.id) { toast.error("That's your own code 🙂"); return; }
    const { error } = await supabase.from("friends").insert({ sender_id: me.id, receiver_id: found.id, status: "pending" });
    if (error) { toast.error(error.message); return; }
    toast.success(`Friend request sent to @${found.username}`);
    setOpen(false);
    onAdded();
  }, [me.id, onAdded]);

  const stopScanner = useCallback(async () => {
    const inst = scannerRef.current;
    scannerRef.current = null;
    setScanning(false);
    if (!inst) return;
    try {
      const state = inst.getState();
      // 2 = SCANNING, 3 = PAUSED
      if (state === 2 || state === 3) await inst.stop();
    } catch (e) { console.warn("[QR] stop error:", e); }
    try { inst.clear(); } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCamError(null);
    setErrorHint(null);

    // ---- Diagnostics ----
    const inFrame = typeof window !== "undefined" && window.self !== window.top;
    setInIframe(inFrame);
    console.groupCollapsed("[QR] Camera diagnostics");
    console.log("secureContext:", typeof window !== "undefined" ? window.isSecureContext : "n/a");
    console.log("protocol:", typeof location !== "undefined" ? location.protocol : "n/a");
    console.log("host:", typeof location !== "undefined" ? location.host : "n/a");
    console.log("userAgent:", typeof navigator !== "undefined" ? navigator.userAgent : "n/a");
    console.log("mediaDevices:", !!navigator.mediaDevices);
    console.log("getUserMedia:", !!navigator.mediaDevices?.getUserMedia);
    console.log("inIframe:", inFrame);
    console.groupEnd();

    const start = async () => {
      if (startingRef.current) return;
      startingRef.current = true;
      try {
        // Preflight
        if (typeof window !== "undefined" && !window.isSecureContext) {
          setCamError("Camera requires a secure connection (https://).");
          setErrorHint("Open the site over HTTPS or on localhost.");
          return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          setCamError("This browser doesn't support camera access.");
          setErrorHint("Try the latest Chrome, Safari, Edge, or Firefox.");
          return;
        }

        // Query permission state where supported (Chromium/Firefox on secure origins)
        try {
          const perm = await navigator.permissions?.query?.({ name: "camera" as PermissionName });
          if (perm) console.log("[QR] permission state:", perm.state);
          if (perm?.state === "denied") {
            setCamError("Camera permission is blocked for this site.");
            setErrorHint(
              "Click the lock icon in the address bar → Site settings → allow Camera, then reload."
            );
            return;
          }
        } catch { /* not supported — continue */ }

        // Prime permission with a plain getUserMedia call inside this async chain.
        // We stop these tracks immediately; html5-qrcode reopens its own stream.
        let permStream: MediaStream | null = null;
        try {
          permStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facing } },
            audio: false,
          });
        } catch (err) {
          const e = err as DOMException;
          console.error("[QR] getUserMedia failed:", e?.name, e?.message, e);
          if (cancelled) return;
          if (e?.name === "NotAllowedError" || e?.name === "SecurityError") {
            if (inFrame) {
              setCamError("Camera is blocked inside this embedded preview.");
              setErrorHint("Open the published site in a new tab to scan.");
            } else {
              setCamError("Camera permission was denied.");
              setErrorHint("Click the lock icon in the address bar → allow Camera → reload.");
            }
          } else if (e?.name === "NotFoundError" || e?.name === "OverconstrainedError" || e?.name === "DevicesNotFoundError") {
            setCamError("No camera detected on this device.");
            setErrorHint("Connect a webcam or use a device with a built-in camera.");
          } else if (e?.name === "NotReadableError" || e?.name === "TrackStartError") {
            setCamError("Your camera is already in use by another app.");
            setErrorHint("Close Zoom, Meet, or any other camera app and try again.");
          } else if (e?.name === "AbortError") {
            setCamError("Camera start was aborted. Please try again.");
          } else {
            setCamError(e?.message || "Couldn't access the camera.");
          }
          return;
        } finally {
          permStream?.getTracks().forEach((t) => t.stop());
        }
        if (cancelled) return;

        // Enumerate cameras (labels are only available after permission is granted)
        let camList: { id: string; label: string }[] = [];
        try {
          const cams = await Html5Qrcode.getCameras();
          camList = cams.map((c) => ({ id: c.id, label: c.label || "Camera" }));
          setCameras(camList);
          console.log("[QR] cameras:", camList);
        } catch (e) { console.warn("[QR] getCameras failed:", e); }

        // Pick camera: rear on mobile, front-fallback if only one exists
        const target = document.getElementById("nc-qr-reader");
        if (!target) { setCamError("Scanner element missing."); return; }

        const inst = new Html5Qrcode("nc-qr-reader", { verbose: false });
        scannerRef.current = inst;
        const config = { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1 };

        const onDecoded = async (decoded: string) => {
          if (cancelled) return;
          await handleDecoded(decoded);
        };

        const startWith = async (): Promise<string | null> => {
          // html5-qrcode expects facingMode as a plain string, NOT { ideal }
          // ({ideal} throws "'facingMode' should be string or object with exact as key.")
          try {
            await inst.start({ facingMode: facing }, config, onDecoded, () => {});
            console.log("[QR] started with facingMode:", facing);
            return null;
          } catch (e) {
            console.warn("[QR] facingMode start failed, falling back to deviceId:", e);
            // The failed start may have left the instance mid-transition. Reset it.
            try {
              const st = inst.getState();
              if (st === 2 || st === 3) await inst.stop();
            } catch { /* noop */ }
            try { inst.clear(); } catch { /* noop */ }
          }
          if (!camList.length) throw new Error("No cameras available");
          const rear = camList.find((c) => /back|rear|environment/i.test(c.label));
          const front = camList.find((c) => /front|user|face/i.test(c.label));
          const pick = facing === "environment"
            ? (rear ?? camList[camList.length - 1])
            : (front ?? camList[0]);
          // Rebuild instance to guarantee a clean state after the failed attempt.
          const fresh = new Html5Qrcode("nc-qr-reader", { verbose: false });
          scannerRef.current = fresh;
          await fresh.start(pick.id, config, onDecoded, () => {});
          console.log("[QR] started with deviceId:", pick.id, pick.label);
          return pick.id;
        };

        try {
          const usedId = await startWith();
          setCurrentCamId(usedId);
          if (!cancelled) setScanning(true);
        } catch (err) {
          const e = err as Error;
          console.error("[QR] Html5Qrcode.start failed:", e);
          if (!cancelled) {
            setCamError(e?.message || "Couldn't start the camera.");
            setErrorHint("Try switching camera or reloading the page.");
          }
        }
      } finally {
        startingRef.current = false;
      }
    };

    start();
    return () => {
      cancelled = true;
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing, attempt]);

  const onManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manual.trim()) return;
    await handleDecoded(manual);
    setManual("");
  };

  const retry = () => { setCamError(null); setErrorHint(null); setAttempt((n) => n + 1); };
  const switchCam = async () => {
    await stopScanner();
    setFacing((f) => (f === "environment" ? "user" : "environment"));
  };
  const openInNewTab = () => {
    window.open(APP_BASE, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) stopScanner(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Camera className="size-4 mr-1.5" /> Scan QR</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Scan a friend's QR
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
              <X className="size-4" />
            </button>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Point your camera at a NovaChat QR code, or paste a friend code below.
          </DialogDescription>
        </DialogHeader>
        <div id="nc-qr-reader" className="w-full aspect-square rounded-xl overflow-hidden bg-black/80" />

        {camError ? (
          <div className="space-y-2">
            <p className="text-xs text-center text-destructive px-2 font-medium">{camError}</p>
            {errorHint && <p className="text-[11px] text-center text-muted-foreground px-2">{errorHint}</p>}
            <div className="flex gap-2 justify-center pt-1">
              <Button size="sm" variant="outline" onClick={retry}>
                <RefreshCw className="size-3.5 mr-1.5" /> Retry
              </Button>
              {inIframe && (
                <Button size="sm" onClick={openInNewTab}>
                  <ExternalLink className="size-3.5 mr-1.5" /> Open in new tab
                </Button>
              )}
            </div>
          </div>
        ) : !scanning ? (
          <p className="text-xs text-center text-muted-foreground">Opening camera… allow access when prompted.</p>
        ) : (
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-muted-foreground">Point your camera at the QR…</p>
            {cameras.length > 1 && (
              <Button size="sm" variant="ghost" onClick={switchCam} title="Switch camera">
                <SwitchCamera className="size-4 mr-1" /> Flip
              </Button>
            )}
          </div>
        )}

        <form onSubmit={onManual} className="flex gap-2 pt-2">
          <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="…or paste code (ABC-1234)" />
          <Button type="submit">Add</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

