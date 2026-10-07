import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";

import { authClient } from "../lib/auth-client";
import { safeRedirect } from "./sign-in";

export const Route = createFileRoute("/sign-up")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: ({ context, search }) => {
    if (context.user) throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: SignUp,
});

function SignUp() {
  const search = Route.useSearch();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const { error: failure } = await authClient.signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (failure) return setError(failure.message ?? "Sign up failed");
    await queryClient.invalidateQueries({ queryKey: ["session"] });
    await router.invalidate();
    await router.navigate({ href: safeRedirect(search.redirect) });
  }

  return (
    <main>
      <h1>Create an account</h1>
      <form onSubmit={onSubmit}>
        <label>
          Name <input name="name" autoComplete="name" required />
        </label>
        <label>
          Email <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password{" "}
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <button type="submit" disabled={pending}>
          Sign up
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </form>
      <p>
        Already have an account?{" "}
        <Link to="/sign-in" search={{ redirect: search.redirect }}>
          Sign in
        </Link>
      </p>
    </main>
  );
}
