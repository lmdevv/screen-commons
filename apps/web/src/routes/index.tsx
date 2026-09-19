import { SignInButton, SignUpButton, useUser } from "@clerk/tanstack-react-start";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, BookOpen, GitFork, Search, ShieldCheck, Upload } from "lucide-react";

import { capture } from "../lib/analytics";

export const Route = createFileRoute("/")({
  beforeLoad: () => capture("landing_viewed"),
  component: LandingPage,
});

const sampleScreens = [
  { title: "Discover", color: "from-indigo-500/35 to-sky-500/10", lines: ["w-16", "w-28", "w-20"] },
  {
    title: "Compare",
    color: "from-amber-500/30 to-orange-500/10",
    lines: ["w-24", "w-16", "w-28"],
  },
  {
    title: "Complete",
    color: "from-emerald-500/30 to-teal-500/10",
    lines: ["w-20", "w-28", "w-14"],
  },
] as const;

function LandingPage() {
  const user = useUser();

  return (
    <main className="overflow-hidden">
      <section className="relative mx-auto grid min-h-[78vh] max-w-7xl items-center gap-14 px-6 py-20 lg:grid-cols-[1.05fr_.95fr] lg:px-10">
        <div className="pointer-events-none absolute -top-48 left-1/3 h-96 w-96 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="relative">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
            <GitFork className="size-3.5" aria-hidden="true" /> Open source · community maintained ·
            free to use
          </div>
          <h1 className="max-w-3xl text-balance text-5xl font-semibold tracking-[-0.045em] sm:text-6xl lg:text-7xl">
            Study the whole flow, <span className="text-indigo-400">not one lonely screen.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground sm:text-xl">
            Open UI is a structured reference library of complete product journeys—ordered,
            searchable, versioned, and built by the people who use them.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            {!user.user ? (
              <>
                <SignUpButton mode="modal">
                  <button
                    type="button"
                    onClick={() => capture("signup_started")}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition hover:opacity-90"
                  >
                    Explore the library <ArrowRight className="size-4" aria-hidden="true" />
                  </button>
                </SignUpButton>
                <SignInButton mode="modal">
                  <button
                    type="button"
                    className="h-11 rounded-full border bg-background px-5 text-sm font-medium hover:bg-muted"
                  >
                    Sign in
                  </button>
                </SignInButton>
              </>
            ) : (
              <Link
                to="/library"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition hover:opacity-90"
              >
                Open the library <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            )}
            <a
              href="https://github.com/lmdevv/open-ui"
              className="h-11 rounded-full border bg-background px-5 py-3 text-sm font-medium hover:bg-muted"
            >
              View source
            </a>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Free account required. No ads, no session replay, no selling your activity.
          </p>
        </div>

        <div
          className="relative mx-auto w-full max-w-xl"
          aria-label="Example ordered interface flow"
        >
          <div className="absolute inset-8 -z-10 rounded-[3rem] bg-indigo-500/20 blur-3xl" />
          <div className="rounded-[2rem] border bg-card/75 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-indigo-400">
                  Featured flow
                </p>
                <h2 className="mt-1 text-lg font-semibold">First-run workspace setup</h2>
              </div>
              <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
                Web · 3 screens
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {sampleScreens.map((screen, index) => (
                <div key={screen.title} className="min-w-0">
                  <div
                    className={`aspect-[3/4] rounded-xl border bg-gradient-to-b ${screen.color} p-2.5 sm:p-4`}
                  >
                    <div className="flex items-center gap-1 pb-3">
                      <span className="size-1.5 rounded-full bg-foreground/20" />
                      <span className="size-1.5 rounded-full bg-foreground/20" />
                      <span className="size-1.5 rounded-full bg-foreground/20" />
                    </div>
                    <div className="rounded-lg border bg-background/70 p-2 shadow-sm sm:p-3">
                      <div className="mb-3 h-5 w-5 rounded-md bg-foreground/15" />
                      {screen.lines.map((width) => (
                        <div
                          key={width}
                          className={`mb-2 h-1.5 max-w-full rounded-full bg-foreground/15 ${width}`}
                        />
                      ))}
                      <div className="mt-4 h-5 rounded-md bg-foreground/80" />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted font-mono">
                      {index + 1}
                    </span>
                    <span className="truncate">{screen.title}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y bg-muted/25">
        <div className="mx-auto grid max-w-7xl gap-px bg-border sm:grid-cols-3">
          {[
            [
              Search,
              "Find the exact moment",
              "Search products, flows, screens, platforms, versions, dates, and tags.",
            ],
            [
              BookOpen,
              "Keep the story intact",
              "Study intent and sequence with complete journeys, not disconnected inspiration.",
            ],
            [
              Upload,
              "Grow the commons",
              "Contribute an ordered capture with in-browser processing and a transparent review trail.",
            ],
          ].map(([Icon, title, copy]) => {
            const FeatureIcon = Icon as typeof Search;
            return (
              <article key={String(title)} className="bg-background px-8 py-12">
                <FeatureIcon className="mb-7 size-5 text-indigo-400" aria-hidden="true" />
                <h2 className="text-lg font-semibold">{String(title)}</h2>
                <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
                  {String(copy)}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-16 sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <div className="flex max-w-2xl gap-4">
          <ShieldCheck className="mt-1 size-6 shrink-0 text-emerald-400" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">A careful library, not an unmoderated image dump.</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Uploads are checked for malformed files, duplicates, unsafe content, and exposed
              personal information. Uncertain cases go to a human.
            </p>
          </div>
        </div>
        <Link to="/policies" className="text-sm font-medium underline underline-offset-4">
          Contribution, privacy & takedown policy
        </Link>
      </section>
    </main>
  );
}
