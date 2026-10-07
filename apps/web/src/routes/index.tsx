import { Link, createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (context.user) throw redirect({ to: "/browse/$platform", params: { platform: "web" } });
  },
  component: Landing,
});

function Landing() {
  return (
    <main>
      <h1>Open UI</h1>
      <p>An open-source library of real product screens and flows.</p>
      <p>
        <Link to="/sign-in">Sign in</Link> · <Link to="/sign-up">Create an account</Link>
      </p>
    </main>
  );
}
