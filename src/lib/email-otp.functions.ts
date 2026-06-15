import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const requestEmailOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: prof, error: pErr } = await supabase
      .from("profiles").select("email, display_name, email_verified").eq("id", userId).maybeSingle();
    if (pErr || !prof?.email) throw new Error("No email on file");
    if (prof.email_verified) return { ok: true, alreadyVerified: true };

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await sha256(code);
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // invalidate prior unconsumed codes
    await supabaseAdmin.from("email_otps").delete()
      .eq("user_id", userId).eq("purpose", "verify_email").is("consumed_at", null);
    const { error: insErr } = await supabaseAdmin.from("email_otps").insert({
      user_id: userId, email: prof.email, code_hash: codeHash, purpose: "verify_email", expires_at: expires,
    });
    if (insErr) throw new Error(insErr.message);

    // Enqueue via Lovable Emails (requires email infra + auth template scaffold)
    const { error: qErr } = await supabaseAdmin.rpc("enqueue_email" as never, {
      queue_name: "transactional_emails",
      payload: {
        template_name: "verify-email-otp",
        recipient_email: prof.email,
        template_data: { code, name: prof.display_name ?? "there" },
        idempotency_key: `otp-${userId}-${Date.now()}`,
      },
    } as never);
    if (qErr) {
      // Surface a clear message but keep the code in DB so resend can re-enqueue once email is ready.
      throw new Error("Email sending isn't fully configured yet. Try again in a minute.");
    }
    return { ok: true, alreadyVerified: false };
  });

export const verifyEmailOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => {
    if (!d || typeof d.code !== "string" || !/^\d{6}$/.test(d.code.trim())) {
      throw new Error("Enter the 6-digit code");
    }
    return { code: d.code.trim() };
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const codeHash = await sha256(data.code);
    const { data: row, error } = await supabaseAdmin
      .from("email_otps")
      .select("id, expires_at, consumed_at, attempts, code_hash")
      .eq("user_id", userId).eq("purpose", "verify_email")
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("No active code. Request a new one.");
    if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("Code expired. Request a new one.");
    if (row.attempts >= 5) throw new Error("Too many attempts. Request a new code.");
    if (row.code_hash !== codeHash) {
      await supabaseAdmin.from("email_otps").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      throw new Error("Incorrect code");
    }
    const now = new Date().toISOString();
    await supabaseAdmin.from("email_otps").update({ consumed_at: now }).eq("id", row.id);
    await supabaseAdmin.from("profiles").update({ email_verified: true, email_verified_at: now }).eq("id", userId);
    return { ok: true };
  });
