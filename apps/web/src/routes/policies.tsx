import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/policies")({ component: PoliciesPage });

function PoliciesPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-indigo-400">
        Open UI policy
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        Contribute thoughtfully. Remove quickly.
      </h1>
      <p className="mt-5 text-lg leading-8 text-muted-foreground">
        Open UI hosts interface captures for reference and critique. Repository code is Apache-2.0;
        that license does not automatically apply to production data or third-party screenshots.
      </p>
      <div className="mt-12 space-y-10 text-sm leading-7">
        <PolicySection title="What you may contribute">
          Submit screenshots you captured lawfully from a product you were permitted to use, a
          public demonstration, or material supplied with permission. Include the product, platform,
          source, capture date, version when known, and rights status.
        </PolicySection>
        <PolicySection title="What must stay out">
          Do not upload credentials, tokens, private workspaces, personal messages, financial or
          health information, unnecessary faces or identifiers, harmful content, animated images, or
          material obtained by bypassing access controls. Remove personal information first.
        </PolicySection>
        <PolicySection title="Review and deletion">
          New contributors receive automated checks followed by human review. Authors and
          administrators can hide content immediately. Approved deletion requests enter a 30-day
          recovery period before unreferenced media is physically removed.
        </PolicySection>
        <PolicySection title="Privacy">
          Clerk handles identity, Cloudflare hosts the application and data, PostHog receives only
          explicit product events, and an AI provider assists submission review. Autocapture and
          session replay are disabled. Search analytics record aggregate length and word count—not
          raw search text.
        </PolicySection>
        <PolicySection title="Takedown or privacy request">
          Identify the affected URL, the nature of the concern, your relationship to the material,
          and the requested resolution through a private GitHub security advisory. Credible harmful
          or disputed content is hidden while it is investigated.
        </PolicySection>
      </div>
      <a
        href="https://github.com/lmdevv/open-ui/security/advisories/new"
        className="mt-12 inline-flex rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background"
      >
        Submit a private request
      </a>
      <p className="mt-5 text-xs text-muted-foreground">
        The complete operational policy lives in <code>docs/policies.md</code>. This MVP policy is
        not legal advice.
      </p>
    </main>
  );
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-muted-foreground">{children}</p>
    </section>
  );
}
