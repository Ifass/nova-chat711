import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import confetti from "canvas-confetti";
import { ArrowLeft, Heart, Loader2, Sparkles } from "lucide-react";
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
  listMyDonations,
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
  amount: number | null;
};

const ITEMS: SupportItem[] = [
  { id: "coffee", emoji: "☕", name: "Buy Me a Coffee", amount: 100 },
  { id: "fries", emoji: "🍟", name: "Buy Me Fries", amount: 150 },
  { id: "burger", emoji: "🍔", name: "Buy Me a Burger", amount: 250 },
  { id: "pizza", emoji: "🍕", name: "Buy Me a Pizza", amount: 300 },
  { id: "noodles", emoji: "🍜", name: "Buy Me Noodles", amount: 350 },
  { id: "cake", emoji: "🍰", name: "Buy Me Cake", amount: 500 },
  { id: "surprise", emoji: "🎁", name: "Surprise Gift", amount: null },
];

const ITEM_MAP: Record<SupportItemId, SupportItem> = ITEMS.reduce(
  (acc, i) => ({ ...acc, [i.id]: i }),
  {} as Record<SupportItemId, SupportItem>,
);

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

type Donation = {
  id: string;
  amount_inr: number;
  currency: string;
  support_item: string;
  order_id: string;
  payment_id: string | null;
  payment_status: string;
  payment_method: string | null;
  anonymous: boolean;
  message: string | null;
  created_at: string;
};

export function SupportNovaChat({ onBack }: { onBack?: () => void } = {}) {
  const { profile, user } = useAuth();
  const createOrder = useServerFn(createDonationOrder);
  const verifyPayment = useServerFn(verifyDonationPayment);
  const fetchHistory = useServerFn(listMyDonations);

  const [selected, setSelected] = useState<SupportItemId | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [failOpen, setFailOpen] = useState(false);
  const [history, setHistory] = useState<Donation[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

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

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const rows = (await fetchHistory()) as Donation[];
      setHistory(rows);
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fireConfetti = () => {
    const end = Date.now() + 2500;
    const colors = ["#3b82f6", "#60a5fa", "#a855f7", "#f59e0b", "#22c55e"];
    (function frame() {
      confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 }, colors });
      confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors });
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
        description: `Support - ${selectedItem.name}`.replace(/[^\x20-\x7E]/g, "").trim(),
        prefill: anonymous
          ? {}
          : {
              name: profile?.display_name ?? profile?.username ?? "",
              email: user?.email ?? "",
            },
        theme: { color: "#3b82f6" },
        modal: { ondismiss: () => {} },
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
            loadHistory();
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
    <div className="flex flex-col h-full">
      <header className="h-16 px-4 flex items-center gap-3 border-b border-border bg-card shrink-0">
        {onBack && (
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack} aria-label="Back">
            <ArrowLeft className="size-5" />
          </Button>
        )}
        <div className="size-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-400 text-white grid place-items-center">
          <Heart className="size-5 fill-current" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold flex items-center gap-1.5">
            <span aria-hidden>❤️</span> Support Nova Chat
          </div>
          <div className="text-xs text-muted-foreground truncate">
            Help keep Nova Chat growing.
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6 pb-24 md:pb-6">
          <section aria-labelledby="support-nova-heading" className="animate-fade-in">
            <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl p-5 md:p-6 shadow-sm">
              <p id="support-nova-heading" className="text-sm text-muted-foreground leading-relaxed mb-5">
                Your support helps pay for AI costs, servers, infrastructure and future updates.
              </p>

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
                      <span className="text-3xl leading-none" aria-hidden>{item.emoji}</span>
                      <span className="text-sm font-medium mt-1">{item.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.amount != null ? `₹${item.amount}` : "Custom Amount"}
                      </span>
                      {active && (
                        <span
                          aria-hidden
                          className="absolute top-2 right-2 size-5 rounded-full bg-blue-600 text-white grid place-items-center text-[10px] font-bold dark:bg-blue-500"
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
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                    <Input
                      id="custom-amount"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="Enter amount"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value.replace(/[^\d]/g, ""))}
                      className="pl-7"
                      aria-invalid={customAmount.length > 0 && !amountValid ? true : undefined}
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
                    placeholder="Leave a few kind words..."
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
                className="mt-5 w-full h-12 text-base font-semibold gap-2 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 shadow-[0_4px_14px_-4px_theme(colors.blue.600/40)] hover:shadow-[0_6px_20px_-6px_theme(colors.blue.600/50)]"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Preparing Secure Payment…
                  </>
                ) : (
                  <>
                    <span aria-hidden>💙</span>
                    Support Nova Chat
                    {selectedItem && amountValid ? ` · ₹${effectiveAmount}` : ""}
                  </>
                )}
              </Button>

              <p className="text-[11px] text-muted-foreground text-center mt-3">
                Secure payments via Razorpay · UPI, Cards, Net Banking & Wallets
              </p>
            </div>
          </section>

          <section aria-labelledby="tx-history-heading">
            <div className="flex items-center justify-between mb-3">
              <h3 id="tx-history-heading" className="text-base font-semibold">
                Transaction History
              </h3>
              {history && history.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {history.length} {history.length === 1 ? "payment" : "payments"}
                </span>
              )}
            </div>

            {historyLoading && !history ? (
              <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Loading history…
              </div>
            ) : !history || history.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-8 text-center text-sm text-muted-foreground">
                No support history yet.
              </div>
            ) : (
              <ul className="space-y-3">
                {history.map((d) => {
                  const item = ITEM_MAP[d.support_item as SupportItemId];
                  const dt = new Date(d.created_at);
                  return (
                    <li
                      key={d.id}
                      className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl p-4 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <div className="size-11 rounded-xl bg-blue-500/10 text-2xl grid place-items-center shrink-0">
                          <span aria-hidden>{item?.emoji ?? "💙"}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium truncate">
                              {item?.name ?? d.support_item}
                            </div>
                            <div className="font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                              ₹{d.amount_inr}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {dt.toLocaleDateString()} · {dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold px-2 py-0.5 uppercase tracking-wide">
                              {d.payment_status}
                            </span>
                            {d.payment_method && (
                              <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground text-[10px] font-medium px-2 py-0.5 uppercase tracking-wide">
                                {d.payment_method}
                              </span>
                            )}
                            {d.anonymous && (
                              <span className="inline-flex items-center rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-medium px-2 py-0.5 uppercase tracking-wide">
                                Anonymous
                              </span>
                            )}
                          </div>
                          {d.message && (
                            <p className="mt-2 text-sm text-foreground/80 italic">
                              “{d.message}”
                            </p>
                          )}
                          {d.payment_id && (
                            <div className="mt-2 text-[11px] text-muted-foreground font-mono break-all">
                              {d.payment_id}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

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
            <Button variant="outline" onClick={() => setSuccessOpen(false)}>Continue</Button>
            <Button onClick={() => setSuccessOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={failOpen} onOpenChange={setFailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment Failed</DialogTitle>
            <DialogDescription>
              Don't worry — no money has been deducted. Please try again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setFailOpen(false)}>Cancel</Button>
            <Button onClick={() => { setFailOpen(false); attempt(); }}>Retry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
