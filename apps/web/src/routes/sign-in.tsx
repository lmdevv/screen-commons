import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";

import { authClient } from "../lib/auth-client";
import { queries } from "../lib/queries";

export const Route = createFileRoute("/sign-in")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: ({ context, search }) => {
    if (context.user) throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: SignIn,
});

/** Only allow same-site relative redirects. */
export function safeRedirect(target: string | undefined): string {
  return target && target.startsWith("/") && !target.startsWith("//") ? target : "/browse/web";
}

function SignIn() {
  const search = Route.useSearch();
  const router = useRouter();
  const queryClient = useQueryClient();
  const authOptions = useQuery(queries.authOptions());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const { error: failure } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (failure) return setError(failure.message ?? "Sign in failed");
    await queryClient.invalidateQueries({ queryKey: ["session"] });
    await router.invalidate();
    await router.navigate({ href: safeRedirect(search.redirect) });
  }

  return (
    <main>
      <h1>Sign in</h1>
      <form onSubmit={onSubmit}>
        <label>
          Email <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password{" "}
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit" disabled={pending}>
          Sign in
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </form>
      {authOptions.data?.github ? (
        <button
          type="button"
          onClick={() =>
            authClient.signIn.social({
              provider: "github",
              callbackURL: safeRedirect(search.redirect),
            })
          }
        >
          Continue with GitHub
        </button>
      ) : null}
      <p>
        No account?{" "}
        <Link to="/sign-up" search={{ redirect: search.redirect }}>
          Sign up
        </Link>
      </p>
    </main>
  );
}
