import { labelFor } from "@screen-commons/core/taxonomy";
import {
  AppLogo,
  Button,
  Container,
  FlowStrip,
  SectionHeader,
  cn,
  pluralize,
  textLinkClassName,
} from "@screen-commons/ui";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bookmark, Download, Link2 } from "lucide-react";
import { useMemo } from "react";

import { copyText, downloadScreensZip } from "../../components/library/image-actions";
import { ScreenResults } from "../../components/library/screen-results";
import { useSaveToggle } from "../../components/library/saving";
import { queries } from "../../lib/queries";
import { usePagePlatform } from "../../lib/use-current-platform";
import { errorMessage, notify } from "../../lib/toast";

export const Route = createFileRoute("/_app/flows/$id")({
  loader: async ({ context: { queryClient }, params }) => {
    const flow = await queryClient.ensureQueryData(queries.flow(params.id));
    return { title: `${flow.name} on ${flow.app.name}` };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.title} — Screen Commons` : "Screen Commons" }],
  }),
  component: FlowPage,
});

/** Standalone, SSR'd flow page: the strip, then every step as a grid (select, download). */
function FlowPage() {
  const { id } = Route.useParams();
  const { data: flow } = useSuspenseQuery(queries.flow(id));
  const navigate = useNavigate();
  const toggleSave = useSaveToggle();
  const activeScreen = Route.useSearch({ select: (s) => s.screen });
  const screens = useMemo(() => flow.steps.map((step) => step.screen), [flow.steps]);
  const activeIndex = flow.steps.findIndex((step) => step.screen.id === activeScreen);
  const first = screens[0];
  usePagePlatform(flow.app.platform);

  return (
    <div className="pt-8 pb-24 sm:pt-10">
      <Container>
        <Link
          to="/apps/$slug"
          params={{ slug: flow.app.slug }}
          search={{ tab: "flows" }}
          className={cn(textLinkClassName, "inline-flex items-center gap-1.5 no-underline")}
        >
          <ArrowLeft className="size-4" />
          {flow.app.name}
        </Link>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xl font-semibold text-fg sm:text-2xl">
              <span>{flow.name}</span>
              <span className="font-normal text-fg-subtle">on</span>
              <Link
                to="/apps/$slug"
                params={{ slug: flow.app.slug }}
                className="ou-focus-ring inline-flex items-center gap-2.5 rounded-control"
              >
                <AppLogo app={flow.app} size="lg" />
                {flow.app.name}
              </Link>
            </h1>
            <p className="text-md text-fg-muted">
              {pluralize(flow.stepCount, "screen")}
              {flow.type ? ` · ${labelFor(flow.type)}` : null}
              {first ? ` · ${labelFor(first.app.platform)}` : null}
            </p>
            {flow.description ? (
              <p className="max-w-2xl text-md text-fg-muted">{flow.description}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              icon
              aria-label="Copy link"
              onClick={() =>
                copyText(location.href.split("?")[0]!)
                  .then(() => notify.message("Link copied"))
                  .catch((e: unknown) => notify.error(errorMessage(e)))
              }
            >
              <Link2 />
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadScreensZip(screens, `${flow.app.name} ${flow.name}`).catch((e: unknown) =>
                  notify.error(errorMessage(e)),
                )
              }
            >
              <Download />
              Download
            </Button>
            <Button
              variant={flow.saved ? "secondary" : "primary"}
              aria-pressed={flow.saved}
              onClick={() => void toggleSave({ kind: "flow", id: flow.id }, !flow.saved)}
            >
              <Bookmark className={cn(flow.saved && "fill-current")} />
              {flow.saved ? "Saved" : "Save"}
            </Button>
          </div>
        </div>
      </Container>

      <FlowStrip
        className="mx-auto mt-10 max-w-page"
        steps={flow.steps}
        size="lg"
        activeIndex={activeIndex >= 0 ? activeIndex : undefined}
        aria-label={`${flow.name} steps`}
        onStepClick={(step) =>
          void navigate({
            to: ".",
            search: (current: Record<string, unknown>) => ({ ...current, screen: step.screen.id }),
            resetScroll: false,
          })
        }
      />

      <Container className="mt-16">
        <SectionHeader title="All steps" description="Select screens to download or save them." />
        <div className="mt-6">
          <ScreenResults
            listKey={`flow-page:${flow.id}`}
            screens={screens}
            platform={first?.app.platform ?? "web"}
            priority={false}
            downloadName={`${flow.app.name} ${flow.name}`}
          />
        </div>
      </Container>
    </div>
  );
}
