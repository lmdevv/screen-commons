import type { CliLoginView } from "@screen-commons/core";
import { Button, Callout } from "@screen-commons/ui";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { CircleAlert, CircleCheck, CircleX, Clock, SquareTerminal } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { AuthLayout } from "../components/auth/auth-layout";
import { Panel } from "../components/settings/extension-connect";
import { errorMessage } from "../lib/toast";
import { decideCliLogin, getCliLogin } from "../server/functions";

export const Route = createFileRoute("/cli-login")({
  validateSearch: z.object({ code: z.string().catch("") }),
  beforeLoad: ({ context, location }) => {
    if (!context.user) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
  },
  loaderDeps: ({ search }) => ({ code: search.code }),
  loader: ({ deps }) => getCliLogin({ data: { code: deps.code } }).catch(() => null),
  head: () => ({ meta: [{ title: "Approve a CLI login · Screen Commons" }] }),
  component: () => (
    <AuthLayout size="md">
      <CliLogin />
    </AuthLayout>
  ),
});

function CliLogin() {
  const { user } = Route.useRouteContext();
  const [login, setLogin] = useState<CliLoginView | null>(Route.useLoaderData());
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!login) {
    return (
      <Panel
        tone="danger"
        icon={<CircleAlert />}
        title="This link has no login code"
        description="Run screen-commons login in your terminal and open the link it prints."
      />
    );
  }

  async function decide(code: string, decision: "approve" | "deny") {
    setBusy(decision);
    setError(null);
    try {
      setLogin(await decideCliLogin({ data: { code, decision } }));
    } catch (failure) {
      setError(errorMessage(failure));
      setLogin(await getCliLogin({ data: { code } }).catch(() => null));
    } finally {
      setBusy(null);
    }
  }

  const failed = error ? (
    <Callout tone="danger" icon={<CircleAlert />} className="mt-6">
      {error}
    </Callout>
  ) : null;

  switch (login.status) {
    case "approved":
      return (
        <Panel
          tone="success"
          icon={<CircleCheck />}
          title="CLI login approved"
          description={`Go back to your terminal on ${login.device}. It saves its key, and you can close this tab.`}
        >
          <div className="mt-8">
            <Button variant="outline" render={<Link to="/settings" search={{ tab: "keys" }} />}>
              Manage keys
            </Button>
          </div>
        </Panel>
      );
    case "denied":
      return (
        <Panel
          tone="danger"
          icon={<CircleX />}
          title="CLI login denied"
          description={`The terminal on ${login.device} gets no key. You can close this tab.`}
        >
          {failed}
        </Panel>
      );
    case "expired":
      return (
        <Panel
          icon={<Clock />}
          title="This login code has expired"
          description="Codes last 10 minutes. Run screen-commons login again for a new one."
        >
          {failed}
        </Panel>
      );
    case "pending":
      return (
        <Panel
          icon={<SquareTerminal />}
          title="Approve a CLI login?"
          description={`A terminal on ${login.device} wants an API key for ${user?.email ?? "your account"}. Approve only if you started it and this code matches the one in your terminal.`}
        >
          <p
            data-testid="cli-login-code"
            className="mt-6 rounded-card bg-muted px-4 py-3 text-center font-mono text-2xl font-semibold tracking-[0.2em] text-fg"
          >
            {login.code}
          </p>
          {failed}
          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={() => decide(login.code, "approve")} disabled={busy !== null}>
              {busy === "approve" ? "Approving…" : "Approve"}
            </Button>
            <Button
              variant="outline"
              onClick={() => decide(login.code, "deny")}
              disabled={busy !== null}
            >
              {busy === "deny" ? "Denying…" : "Deny"}
            </Button>
          </div>
        </Panel>
      );
  }
}
