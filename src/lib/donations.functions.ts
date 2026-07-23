import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SUPPORT_ITEMS = [
  "coffee",
  "fries",
  "burger",
  "pizza",
  "noodles",
  "cake",
  "surprise",
] as const;

const createOrderSchema = z.object({
  amount: z.number().int().min(10).max(50000),
  supportItem: z.enum(SUPPORT_ITEMS),
  message: z.string().max(120).optional().nullable(),
  anonymous: z.boolean().optional().default(false),
});

const verifySchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().min(1),
});

async function razorpayFetch(path: string, init: RequestInit) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay credentials not configured");
  const auth = btoa(`${keyId}:${keySecret}`);
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Razorpay error ${res.status}: ${text}`);
  }
  return res.json();
}

export const createDonationOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createOrderSchema.parse(data))
  .handler(async ({ data, context }) => {
    const keyId = process.env.RAZORPAY_KEY_ID!;
    const amountPaise = data.amount * 100;

    const order = (await razorpayFetch("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        notes: {
          user_id: context.userId,
          support_item: data.supportItem,
          anonymous: String(!!data.anonymous),
        },
      }),
    })) as { id: string; amount: number; currency: string };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("donations").insert({
      user_id: context.userId,
      amount_inr: data.amount,
      currency: "INR",
      support_item: data.supportItem,
      order_id: order.id,
      message: data.message ?? null,
      anonymous: !!data.anonymous,
      payment_status: "created",
    });
    if (error) throw new Error(error.message);

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
    };
  });

export const verifyDonationPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => verifySchema.parse(data))
  .handler(async ({ data, context }) => {
    const keySecret = process.env.RAZORPAY_KEY_SECRET!;
    const { createHmac, timingSafeEqual } = await import("node:crypto");

    const expected = createHmac("sha256", keySecret)
      .update(`${data.orderId}|${data.paymentId}`)
      .digest("hex");

    const a = Buffer.from(expected);
    const b = Buffer.from(data.signature);
    const valid = a.length === b.length && timingSafeEqual(a, b);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!valid) {
      await supabaseAdmin
        .from("donations")
        .update({ payment_status: "failed", payment_id: data.paymentId })
        .eq("order_id", data.orderId)
        .eq("user_id", context.userId);
      throw new Error("Invalid payment signature");
    }

    const { data: existing } = await supabaseAdmin
      .from("donations")
      .select("id, payment_status")
      .eq("order_id", data.orderId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!existing) throw new Error("Donation record not found");
    if (existing.payment_status === "paid") return { ok: true, alreadyVerified: true };

    const { error } = await supabaseAdmin
      .from("donations")
      .update({ payment_status: "paid", payment_id: data.paymentId })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);

    return { ok: true, alreadyVerified: false };
  });
