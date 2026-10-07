import { createFileRoute, redirect } from "@tanstack/react-router";

import { AuthLayout } from "../components/auth/auth-layout";
import { ExtensionConnect } from "../components/settings/extension-connect";

/** Hands a fresh API key to the browser extension. Auth-page layout, signed-in only. */
export const Route = createFileRoute("/extension/connect")({
  beforeLoad: ({ context, location }) => {
    if (!context.user) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
  },
  head: () => ({ meta: [{ title: "Connect the extension · Open UI" }] }),
  component: () => (
    <AuthLayout size="md">
      <ExtensionConnect />
    </AuthLayout>
  ),
});
