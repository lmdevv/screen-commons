import {
  Button,
  Callout,
  Field,
  FieldError,
  Input,
  Label,
  Separator,
  cn,
  textLinkClassName,
} from "@screen-commons/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { CircleAlert, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { authClient } from "../../lib/auth-client";
import { GitHubIcon } from "./github-icon";
import { safeRedirect } from "./redirect";

export type AuthMode = "sign-in" | "sign-up";

const COPY = {
  "sign-in": {
    title: "Sign in to Screen Commons",
    description: "Welcome back. Pick up where you left off.",
    submit: "Sign in",
    switchPrompt: "New to Screen Commons?",
    switchLabel: "Create an account",
  },
  "sign-up": {
    title: "Create your account",
    description: "Browse, save and contribute real product screens.",
    submit: "Create account",
    switchPrompt: "Already have an account?",
    switchLabel: "Sign in",
  },
} as const;

/** Friendlier wording for Better Auth's error codes. */
function describeError(error: { code?: string; message?: string; status?: number }): string {
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password don’t match.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "An account with this email already exists. Sign in instead.";
    case "PASSWORD_TOO_SHORT":
      return "Use at least 8 characters for your password.";
    case "INVALID_EMAIL":
      return "Enter a valid email address.";
    default:
      if (error.status === 429) return "Too many attempts. Wait a moment and try again.";
      return error.message || "Something went wrong. Try again.";
  }
}

type FieldErrors = Partial<Record<"name" | "email" | "password", string>>;

function validate(
  mode: AuthMode,
  values: { name: string; email: string; password: string },
): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === "sign-up" && !values.name) errors.name = "Enter your name.";
  if (!values.email) errors.email = "Enter your email.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(values.email))
    errors.email = "Enter a valid email address.";
  if (!values.password) errors.password = "Enter your password.";
  else if (mode === "sign-up" && values.password.length < 8)
    errors.password = "Use at least 8 characters.";
  return errors;
}

export function AuthForm({
  mode,
  redirectTo,
  github,
  firstAccount = false,
}: {
  mode: AuthMode;
  redirectTo: string | undefined;
  github: boolean;
  /** Sign-up only: nobody has an account yet, so this one becomes the admin. */
  firstAccount?: boolean;
}) {
  const copy = COPY[mode];
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Until hydration a click would submit the form natively; keep it inert instead.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const target = safeRedirect(redirectTo);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const errors = validate(mode, { name, email, password });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError(null);
      const first = Object.keys(errors)[0]!;
      event.currentTarget.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setPending(true);
    setError(null);
    const { error: failure } =
      mode === "sign-in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({
            name,
            email,
            password,
          });
    if (failure) {
      setPending(false);
      setError(describeError(failure));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["session"] });
    await router.invalidate();
    await router.navigate({ href: target, replace: true });
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-fg">{copy.title}</h1>
      <p className="mt-2 text-base text-fg-muted">{copy.description}</p>

      {mode === "sign-up" && firstAccount ? (
        <Callout tone="accent" icon={<ShieldCheck />} className="mt-6">
          You’re the first one here. This account becomes the instance <strong>admin</strong>.
        </Callout>
      ) : null}

      {github ? (
        <>
          <Button
            variant="outline"
            size="lg"
            className="mt-8 w-full"
            onClick={() =>
              void authClient.signIn.social({ provider: "github", callbackURL: target })
            }
          >
            <GitHubIcon />
            Continue with GitHub
          </Button>
          <div className="my-6 flex items-center gap-3" role="presentation">
            <Separator className="flex-1" />
            <span className="text-sm text-fg-subtle">or</span>
            <Separator className="flex-1" />
          </div>
        </>
      ) : null}

      <form
        onSubmit={onSubmit}
        className={cn("flex flex-col gap-4", github ? "" : "mt-8")}
        method="post"
        noValidate
      >
        {mode === "sign-up" ? (
          <Field name="name" invalid={Boolean(fieldErrors.name)}>
            <Label>Name</Label>
            <Input
              name="name"
              size="lg"
              autoComplete="name"
              placeholder="Ada Lovelace"
              maxLength={80}
              required
            />
            <FieldError match={Boolean(fieldErrors.name)}>{fieldErrors.name}</FieldError>
          </Field>
        ) : null}
        <Field name="email" invalid={Boolean(fieldErrors.email)}>
          <Label>Email</Label>
          <Input
            name="email"
            type="email"
            size="lg"
            autoComplete="email"
            placeholder="you@example.com"
            required
            autoFocus={mode === "sign-in"}
          />
          <FieldError match={Boolean(fieldErrors.email)}>{fieldErrors.email}</FieldError>
        </Field>
        <Field name="password" invalid={Boolean(fieldErrors.password)}>
          <Label>Password</Label>
          <Input
            name="password"
            type={showPassword ? "text" : "password"}
            size="lg"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            placeholder={mode === "sign-up" ? "At least 8 characters" : undefined}
            minLength={mode === "sign-up" ? 8 : undefined}
            required
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((shown) => !shown)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="ou-focus-ring flex size-8 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-muted-strong hover:text-fg [&_svg]:size-4"
              >
                {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </button>
            }
          />
          <FieldError match={Boolean(fieldErrors.password)}>{fieldErrors.password}</FieldError>
        </Field>

        {error ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <CircleAlert aria-hidden className="mt-px size-4 shrink-0" />
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          className="mt-2 w-full"
          loading={pending}
          disabled={!hydrated}
        >
          {copy.submit}
        </Button>
      </form>

      <p className="mt-8 text-base text-fg-muted">
        {copy.switchPrompt}{" "}
        <Link
          to={mode === "sign-in" ? "/sign-up" : "/sign-in"}
          search={{ redirect: redirectTo }}
          className={textLinkClassName}
        >
          {copy.switchLabel}
        </Link>
      </p>
    </div>
  );
}
