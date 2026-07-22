import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NovaLogo } from "@/components/NovaLogo";

// Local typed wrapper for the beta supabase.auth.oauth namespace.
type OAuthResult = {
  data: {
    client?: { name?: string; client_uri?: string; redirect_uris?: string[] } | null;
    scope?: string | null;
    redirect_url?: string | null;
    redirect_to?: string | null;
  } | null;
  error: { message: string } | null;
};
type OAuthClient = {
  auth: {
    oauth: {
      getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
      approveAuthorization: (id: string) => Promise<OAuthResult>;
      denyAuthorization: (id: string) => Promise<OAuthResult>;
    };
  };
};
const oauth = () => (supabase as unknown as OAuthClient).auth.oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen grid place-items-center p-6">
      <Card className="p-6 max-w-md w-full">
        <h1 className="font-semibold mb-2">Couldn't load this authorization request</h1>
        <p className="text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
      </Card>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? "an app";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="min-h-screen grid place-items-center p-4 bg-gradient-to-br from-background via-accent/30 to-primary/10">
      <Card className="p-6 max-w-md w-full shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <NovaLogo className="size-10" />
          <div>
            <h1 className="font-semibold">Connect {clientName} to Nova Chat</h1>
            <p className="text-xs text-muted-foreground">You'll be signed in as your Nova Chat account.</p>
          </div>
        </div>
        <p className="text-sm mb-4">
          <span className="font-medium">{clientName}</span> will be able to use Nova Chat's tools as you: read your
          profile, list friends, read and send direct messages, and read call history.
        </p>
        <p className="text-xs text-muted-foreground mb-6">
          This does not bypass Nova Chat's permissions or backend policies. You can revoke access anytime.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive mb-3">
            {error}
          </p>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" disabled={busy} onClick={() => decide(false)}>
            Deny
          </Button>
          <Button disabled={busy} onClick={() => decide(true)}>
            {busy ? "Working…" : "Approve"}
          </Button>
        </div>
      </Card>
    </main>
  );
}
