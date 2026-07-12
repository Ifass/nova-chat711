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
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCamError(null);

    const start = async () => {
      // Preflight checks
      if (typeof window !== "undefined" && !window.isSecureContext) {
        setCamError("Camera needs a secure (https://) connection. Open the site directly in your browser.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamError("This browser doesn't support camera access. Try Chrome or Safari.");
        return;
      }

      // Request permission first with a plain getUserMedia call so the browser
      // shows a prompt. We immediately stop the tracks — html5-qrcode will
      // open its own stream once permission is granted.
      let permStream: MediaStream | null = null;
      try {
        permStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (err) {
        const e = err as DOMException;
        if (cancelled) return;
        if (e?.name === "NotAllowedError" || e?.name === "SecurityError") {
          setCamError("Camera permission was blocked. Allow camera access in your browser settings and try again.");
        } else if (e?.name === "NotFoundError" || e?.name === "OverconstrainedError") {
          setCamError("No camera found on this device.");
        } else if (e?.name === "NotReadableError") {
          setCamError("Camera is being used by another app. Close it and try again.");
        } else {
          setCamError(e?.message || "Couldn't open camera. You can paste a friend code below.");
        }
        return;
      } finally {
        permStream?.getTracks().forEach((t) => t.stop());
      }

      if (cancelled) return;

      try {
        const inst = new Html5Qrcode("nc-qr-reader", { verbose: false });
        scannerRef.current = inst;
        const config = { fps: 10, qrbox: { width: 220, height: 220 } };

        const tryStart = async () => {
          try {
            await inst.start({ facingMode: { ideal: "environment" } }, config, onDecoded, () => {});
            return true;
          } catch {
            // Fallback: pick any available camera (rear preferred by label)
            const cams = await Html5Qrcode.getCameras();
            if (!cams?.length) throw new Error("No cameras available");
            const rear = cams.find((c) => /back|rear|environment/i.test(c.label)) ?? cams[cams.length - 1];
            await inst.start(rear.id, config, onDecoded, () => {});
            return true;
          }
        };

        const onDecoded = async (decoded: string) => {
          if (cancelled) return;
          await handleDecoded(decoded);
        };

        await tryStart();
        if (!cancelled) setScanning(true);
      } catch (err) {
        const msg = (err as Error)?.message || "Couldn't start the camera.";
        if (!cancelled) setCamError(msg);
      }
    };

    start();
    return () => {
      cancelled = true;
      const inst = scannerRef.current;
      scannerRef.current = null;
      if (inst) { inst.stop().then(() => { try { inst.clear(); } catch { /* noop */ } }).catch(() => {}); }
      setScanning(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleDecoded = async (raw: string) => {
    let code = raw.trim();
    try { const u = new URL(raw); code = u.searchParams.get("add") ?? code; } catch { /* not a url */ }
    code = code.toUpperCase();
    if (!/^[A-Z]{3}-[A-Z0-9]{4}$/.test(code)) { toast.error("Not a valid NovaChat code"); return; }
    await addByCode(code);
  };

  const addByCode = async (code: string) => {
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
  };

  const onManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manual.trim()) return;
    await handleDecoded(manual);
    setManual("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Camera className="size-4 mr-1.5" /> Scan QR</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Scan a friend's QR
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
          </DialogTitle>
        </DialogHeader>
        <div id="nc-qr-reader" className="w-full aspect-square rounded-xl overflow-hidden bg-black/80" />
        {camError ? (
          <p className="text-xs text-center text-destructive px-2">{camError}</p>
        ) : !scanning ? (
          <p className="text-xs text-center text-muted-foreground">Opening camera… allow access when prompted.</p>
        ) : (
          <p className="text-xs text-center text-muted-foreground">Point your camera at the QR code…</p>
        )}
        <form onSubmit={onManual} className="flex gap-2 pt-2">
          <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="…or paste code (ABC-1234)" />
          <Button type="submit">Add</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
