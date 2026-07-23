import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import confetti from "canvas-confetti";
import { Heart, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/use-auth";
import {
  createDonationOrder,
  verifyDonationPayment,
} from "@/lib/donations.functions";

type SupportItemId =
  | "coffee"
  | "fries"
  | "burger"
  | "pizza"
  | "noodles"
  | "cake"
  | "surprise";

type SupportItem = {
  id: SupportItemId;
  emoji: string;
  name: string;
  amount: number | null; // null = custom
};

const ITEMS: SupportItem[] = [
  { id: "coffee", emoji: "☕", name: "Coffee", amount: 100 },
  { id: "fries", emoji: "🍟", name: "Fries", amount: 150 },
  { id: "burger", emoji: "🍔", name: "Burger", amount: 250 },
  { id: "pizza", emoji: "🍕", name: "Pizza", amount: 300 },
  { id: "noodles", emoji: "🍜", name: "Noodles", amount: 350 },
  { id: "cake", emoji: "🍰", name: "Cake", amount: 500 },
  { id: "surprise", emoji: "🎁", name: "Surprise Gift", amount: null },
];

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    // @ts-expect-error injected global
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${RAZORPAY_SCRIPT}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const s = document.createElement("script");
    s.src = RAZORPAY_SCRIPT;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

type RazorpaySuccess = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export function SupportNovaChat() {
  const { profile, user } = useAuth();
  const createOrder = useServerFn(createDonationOrder);
  const verifyPayment = useServerFn(verifyDonationPayment);

  const [selected, setSelected] = useState<SupportItemId | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [failOpen, setFailOpen] = useState(false);

  const selectedItem = useMemo(
    () => ITEMS.find((i) => i.id === selected) ?? null,
    [selected],
  );

  const effectiveAmount = useMemo(() => {
    if (!selectedItem) return 0;
    if (selectedItem.amount != null) return selectedItem.amount;
    const n = Number(customAmount);
    return Number.isFinite(n) ? Math.floor(n) : 0;
  }, [selectedItem, customAmount]);

  const amountValid = effectiveAmount >= 10 && effectiveAmount <= 50000;
  const canSubmit = !!selectedItem && amountValid && !loading;

  const fireConfetti = () => {
    const end = Date.now() + 2500;
    const colors = ["#f43f5e", "#ec4899", "#a855f7", "#f59e0b", "#22c55e"];
    (function frame() {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors,
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  };

  const attempt = async () => {
    if (!canSubmit || !selectedItem) return;
    setLoading(true);
    try {
      const ok = await loadRazorpay();
      if (!ok) throw new Error("Could not load payment gateway. Please try again.");

      const order = await createOrder({
        data: {
          amount: effectiveAmount,
          supportItem: selectedItem.id,
          message: message.trim() ? message.trim() : null,
          anonymous,
        },
      });

      // @ts-expect-error injected global
      const Razorpay = window.Razorpay;
      const rz = new Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: "Nova Chat",
        description: `Support: ${selectedItem.emoji} ${selectedItem.name}`,
        prefill: anonymous
          ? {}
          : {
              name: profile?.display_name ?? profile?.username ?? "",
              email: user?.email ?? "",
            },
        theme: { color: "#8b5cf6" },
        modal: {
          ondismiss: () => {
            // User closed — silent, no toast.
          },
        },
        handler: async (resp: RazorpaySuccess) => {
          try {
            await verifyPayment({
              data: {
                orderId: resp.razorpay_order_id,
                paymentId: resp.razorpay_payment_id,
                signature: resp.razorpay_signature,
              },
            });
            setSuccessOpen(true);
            fireConfetti();
            setSelected(null);
            setCustomAmount("");
            setMessage("");
            setAnonymous(false);
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Verification failed";
            toast.error(msg);
            setFailOpen(true);
          }
        },
      });

      rz.on("payment.failed", () => setFailOpen(true));
      rz.open();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      aria-labelledby="support-nova-heading"
      className="mt-8 md:mt-10 animate-fade-in"
    >
      <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl p-5 md:p-6 shadow-sm">
        <header className="mb-5">
          <h2
            id="support-nova-heading"
            className="text-lg md:text-xl font-semibold flex items-center gap-2"
          >
            <span aria-hidden>❤️</span> Support us
          </h2>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Love Nova Chat? Every contribution helps cover AI costs, servers,
            development, and future updates. Thank you for helping Nova Chat
            grow.
          </p>
        </header>

        <div
          role="radiogroup"
          aria-label="Choose a support option"
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
        >
          {ITEMS.map((item) => {
            const active = selected === item.id;
            return (
              <button
                key={item.id}
                role="radio"
                aria-checked={active}
                aria-label={`${item.name}${item.amount ? ` for ₹${item.amount}` : " — custom amount"}`}
                onClick={() => setSelected(item.id)}
                className={cn(
                  "group relative flex flex-col items-center justify-center gap-1 rounded-2xl border p-4 min-h-[104px]",
                  "bg-background/60 backdrop-blur-sm transition-all duration-200",
                  "hover:scale-[1.03] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60",
                  "hover:shadow-[0_0_0_1px_theme(colors.blue.500/15),0_6px_20px_-6px_theme(colors.blue.500/15)]",
                  active
                    ? "border-blue-500/60 shadow-[0_0_0_2px_theme(colors.blue.500/20),0_8px_24px_-8px_theme(colors.blue.500/20)]"
                    : "border-border/60 hover:border-blue-400/40 shadow-sm",
                )}
              >
                <span className="text-3xl leading-none" aria-hidden>
                  {item.emoji}
                </span>
                <span className="text-sm font-medium mt-1">{item.name}</span>
                <span className="text-xs text-muted-foreground">
                  {item.amount != null ? `₹${item.amount}` : "Custom Amount"}
                </span>
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-2 right-2 size-5 rounded-full bg-primary text-primary-foreground grid place-items-center text-[10px] font-bold"
                  >
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {selectedItem?.id === "surprise" && (
          <div className="mt-4 animate-fade-in">
            <Label htmlFor="custom-amount" className="text-sm">
              Custom Amount (₹10 – ₹50,000)
            </Label>
            <div className="mt-1.5 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                ₹
              </span>
              <Input
                id="custom-amount"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Enter amount"
                value={customAmount}
                onChange={(e) =>
                  setCustomAmount(e.target.value.replace(/[^\d]/g, ""))
                }
                className="pl-7"
                aria-invalid={
                  customAmount.length > 0 && !amountValid ? true : undefined
                }
              />
            </div>
            {customAmount && !amountValid && (
              <p className="text-xs text-destructive mt-1">
                Amount must be between ₹10 and ₹50,000.
              </p>
            )}
          </div>
        )}

        <div className="mt-4 grid gap-3">
          <div>
            <Label htmlFor="support-message" className="text-sm">
              Leave a message (optional)
            </Label>
            <Textarea
              id="support-message"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 120))}
              maxLength={120}
              placeholder="A few kind words…"
              className="mt-1.5 min-h-[64px] resize-none"
            />
            <div className="text-[11px] text-muted-foreground text-right mt-1">
              {message.length}/120
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="anon-support"
              checked={anonymous}
              onCheckedChange={(v) => setAnonymous(v === true)}
            />
            <Label htmlFor="anon-support" className="text-sm font-normal cursor-pointer">
              Support anonymously
            </Label>
          </div>
        </div>

        <Button
          onClick={attempt}
          disabled={!canSubmit}
          size="lg"
          className="mt-5 w-full h-12 text-base font-semibold gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Preparing Secure Payment…
            </>
          ) : (
            <>
              <Heart className="size-4 fill-current" />
              Support Nova Chat
              {selectedItem && amountValid ? ` · ₹${effectiveAmount}` : ""}
            </>
          )}
        </Button>

        <p className="text-[11px] text-muted-foreground text-center mt-3">
          Secure payments via Razorpay · UPI, Cards, Net Banking & Wallets
        </p>
      </div>

      {/* Success */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto size-14 rounded-2xl bg-primary/15 text-primary grid place-items-center mb-2">
              <Sparkles className="size-7" />
            </div>
            <DialogTitle className="text-center text-2xl">🎉 Thank You!</DialogTitle>
            <DialogDescription className="text-center leading-relaxed pt-1">
              Your support helps keep Nova Chat free, improve AI features, and
              fund future updates. We truly appreciate your generosity ❤️
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center gap-2">
            <Button variant="outline" onClick={() => setSuccessOpen(false)}>
              Continue
            </Button>
            <Button onClick={() => setSuccessOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Failure */}
      <Dialog open={failOpen} onOpenChange={setFailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment Failed</DialogTitle>
            <DialogDescription>
              Don't worry — no money has been deducted. Please try again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setFailOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setFailOpen(false);
                attempt();
              }}
            >
              Retry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
