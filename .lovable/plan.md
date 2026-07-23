
## Support Nova Chat — Donation Feature

A friendly creator-support section rendered below the two AI assistant cards in the AI tab. Uses Razorpay Checkout for payments with a secure server-verified flow.

### 1. UI — `SupportNovaChat.tsx` (new)

Rendered in the AI tab (`src/routes/_authenticated/index.tsx` where the Nova AI / OpenChat cards live), 24–32px below them.

- Header: `❤️ Support Nova Chat` + warm subtitle.
- Grid of selectable preset cards (Coffee ₹100, Fries ₹150, Burger ₹250, Pizza ₹300, Noodles ₹350, Cake ₹500, Surprise Gift = custom).
  - Rounded 16–18px, glass surface using existing tokens (`bg-card/60 backdrop-blur`), shadow, hover `scale-[1.03]`, active `scale-[0.97]`, selected: primary ring + soft glow + `animate-in`.
- Custom amount input appears when Surprise Gift is picked (min ₹10, max ₹50,000, digits only).
- Optional message (maxLength 120) + "Support anonymously" checkbox.
- Primary button `❤️ Support Nova Chat` — disabled until valid amount; loading text `Preparing Secure Payment…`.
- Responsive grid: 4 cols desktop → 2 tablet/mobile → 1 on very small screens.
- Full a11y: keyboard nav, aria-pressed on cards, focus rings, aria-labels.
- Adapts to light/dark via existing theme tokens (no hardcoded colors).
- Section fades up on mount using existing `animate-fade-in`.

### 2. Success / Failure dialogs

- `<Dialog>` success: 🎉 Thank You copy + Continue/Done buttons. Confetti for ~2.5s via `canvas-confetti` (new dep).
- Failure dialog with Retry / Cancel.
- User-closed Razorpay modal → silent return, no toast/error.

### 3. Razorpay Checkout

- Load `https://checkout.razorpay.com/v1/checkout.js` on demand from the component (script tag injection, cached).
- Open checkout with `order_id` returned from backend, prefill name/email from `useAuth`.
- Handler posts response to verify endpoint.

### 4. Backend — server functions (client-safe modules)

`src/lib/donations.functions.ts` (auth-protected via `requireSupabaseAuth`):

- `createDonationOrder({ amount, supportItem, message?, anonymous })`
  - Validates with zod (amount 10–50000 int paise-safe, item enum, msg ≤120).
  - Calls Razorpay `POST /v1/orders` with Basic auth from `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` (read inside handler).
  - Inserts donation row with `payment_status='created'`, returns `{ orderId, amount, currency, keyId }`.
- `verifyDonationPayment({ orderId, paymentId, signature })`
  - HMAC-SHA256(`${orderId}|${paymentId}`, secret), timing-safe compare.
  - On match: update row to `paid`, store `payment_id`. Idempotent (no-op if already paid).
  - On mismatch: mark `failed`, throw.

Uses `supabaseAdmin` loaded inside handler for the DB writes (row is user-scoped by user_id but we don't need RLS bypass except for status updates keyed by order_id — will still use admin for atomic update).

### 5. Database migration

New table `public.donations`:

```
id uuid pk, user_id uuid references auth.users on delete set null,
amount_inr integer not null, currency text not null default 'INR',
support_item text not null, payment_id text, order_id text unique not null,
payment_status text not null default 'created'
  check (payment_status in ('created','paid','failed')),
anonymous boolean not null default false,
message text,
created_at timestamptz default now(), updated_at timestamptz default now()
```

- GRANTs to authenticated + service_role (no anon).
- RLS: users can SELECT their own rows; INSERT/UPDATE handled server-side via service role only (no client policy needed).
- `updated_at` trigger.

### 6. Secrets

Two new secrets required from the user (Razorpay Dashboard → Settings → API Keys):

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

Requested via `add_secret` after plan approval. Key ID is also returned by the create-order function so the client can pass it to Checkout (avoids embedding in bundle).

### 7. Dependencies

- Add `canvas-confetti` + `@types/canvas-confetti`.
- No Razorpay npm SDK — direct `fetch` to Razorpay REST API from server function (avoids Node-only SDK on Cloudflare Worker runtime).

### Files touched

- New: `src/components/novachat/SupportNovaChat.tsx`, `src/lib/donations.functions.ts`, migration.
- Edited: AI tab container in `src/routes/_authenticated/index.tsx` (mount the section under the assistant cards).

### Out of scope

- Public donor wall / leaderboard.
- Recurring subscriptions.
- Refund UI.
