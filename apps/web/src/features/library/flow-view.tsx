import { Link } from "@tanstack/react-router";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Info,
  Monitor,
  Tag,
  UserRound,
} from "lucide-react";
import type { LibraryFlow, LibraryProduct } from "./types";
import { ProductMark } from "./catalog-view";
import { UiPreview } from "./ui-preview";

export function FlowView({ flow, product }: { flow: LibraryFlow; product: LibraryProduct }) {
  const viewStore = useCreateStore({ copied: false, step: 0 });
  const step = useSelector(viewStore, (state) => state.step);
  const copied = useSelector(viewStore, (state) => state.copied);
  const current = flow.screens[step] ?? flow.screens[0]!;
  const version = product.versions.find((item) => item.id === flow.versionId);

  const setStep = (update: number | ((current: number) => number)) =>
    viewStore.setState((state) => ({
      ...state,
      step: typeof update === "function" ? update(state.step) : update,
    }));

  useHotkey("ArrowLeft", () => setStep((value) => Math.max(0, value - 1)), {
    ignoreInputs: true,
    meta: { name: "Previous screen", description: "Move to the previous screen in this flow" },
  });
  useHotkey("ArrowRight", () => setStep((value) => Math.min(flow.screens.length - 1, value + 1)), {
    ignoreInputs: true,
    meta: { name: "Next screen", description: "Move to the next screen in this flow" },
  });

  const copyLink = async () => {
    await navigator.clipboard?.writeText(window.location.href);
    viewStore.setState((state) => ({ ...state, copied: true }));
    window.setTimeout(() => viewStore.setState((state) => ({ ...state, copied: false })), 1800);
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-black/8 bg-[#f7f7f5]/95 px-4 py-4 backdrop-blur dark:border-white/8 dark:bg-[#10100f]/95 sm:px-6 lg:px-8">
        <div className="flex items-start gap-3">
          <Link
            to="/products/$productSlug"
            params={{ productSlug: product.slug }}
            aria-label={`Back to ${product.name}`}
            className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-black/8 bg-white text-black/45 hover:text-black dark:border-white/8 dark:bg-white/5 dark:text-white/42 dark:hover:text-white"
          >
            <ArrowLeft className="size-3.5" />
          </Link>
          <ProductMark product={product} small />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                to="/products/$productSlug"
                params={{ productSlug: product.slug }}
                className="text-[11px] text-black/42 hover:text-black dark:text-white/38 dark:hover:text-white"
              >
                {product.name}
              </Link>
              <span className="text-[9px] text-black/22 dark:text-white/20">/</span>
              <span className="text-[11px] text-black/42 dark:text-white/38">{version?.label}</span>
            </div>
            <h1 className="mt-1 truncate text-base font-semibold tracking-[-0.02em] sm:text-lg">
              {flow.name}
            </h1>
          </div>
          <button
            type="button"
            onClick={copyLink}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-black/8 bg-white px-2.5 text-[11px] text-black/50 hover:text-black dark:border-white/8 dark:bg-white/5 dark:text-white/45 dark:hover:text-white"
          >
            {copied ? (
              <Check className="size-3.5 text-emerald-600" />
            ) : (
              <Copy className="size-3.5" />
            )}
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy link"}</span>
          </button>
        </div>
      </header>

      <div className="grid flex-1 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 border-black/8 dark:border-white/8 xl:border-r">
          <div className="flex items-center justify-between border-b border-black/8 px-4 py-3 dark:border-white/8 sm:px-6 lg:px-8">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.12em] text-[#d84831] uppercase dark:text-[#ff806b]">
                Step {step + 1} of {flow.screens.length}
              </p>
              <h2 className="mt-0.5 text-sm font-semibold">{current.title}</h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setStep((value) => Math.max(0, value - 1))}
                disabled={step === 0}
                aria-label="Previous screen"
                className="grid size-8 place-items-center rounded-lg border border-black/8 bg-white text-black/55 disabled:opacity-25 dark:border-white/8 dark:bg-white/5 dark:text-white/50"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setStep((value) => Math.min(flow.screens.length - 1, value + 1))}
                disabled={step === flow.screens.length - 1}
                aria-label="Next screen"
                className="grid size-8 place-items-center rounded-lg border border-black/8 bg-white text-black/55 disabled:opacity-25 dark:border-white/8 dark:bg-white/5 dark:text-white/50"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>

          <div className="relative flex min-h-[410px] items-center justify-center bg-[#e8e8e4] p-5 dark:bg-[#242422] sm:p-8 lg:min-h-[580px] lg:p-12">
            <UiPreview
              screen={current}
              className="aspect-[1.43] w-full max-w-4xl rounded-xl bg-[#d9d9d4] p-[4%] shadow-[0_28px_70px_rgba(35,32,26,0.13)] dark:bg-[#2c2c29] dark:shadow-[0_28px_70px_rgba(0,0,0,0.3)]"
            />
            <span className="absolute bottom-3 right-4 rounded bg-black/45 px-1.5 py-1 text-[9px] text-white/75 backdrop-blur dark:bg-black/55">
              {current.viewport}
            </span>
          </div>

          <div className="border-b border-black/8 p-4 dark:border-white/8 sm:p-5 lg:px-8">
            <ol className="flex gap-3 overflow-x-auto pb-2" aria-label="Flow screens">
              {flow.screens.map((screen, index) => (
                <li key={screen.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setStep(index)}
                    aria-current={index === step ? "step" : undefined}
                    className="group w-28 text-left sm:w-32"
                  >
                    <span
                      className={`block overflow-hidden rounded-lg border-2 transition ${index === step ? "border-[#ff5d42] shadow-[0_0_0_3px_rgba(255,93,66,0.1)]" : "border-transparent opacity-62 hover:opacity-100"}`}
                    >
                      <UiPreview screen={screen} compact className="aspect-[1.28]" />
                    </span>
                    <span
                      className={`mt-2 block truncate text-[10px] ${index === step ? "font-semibold text-black dark:text-white" : "text-black/42 dark:text-white/38"}`}
                    >
                      <span className="mr-1.5 tabular-nums text-black/27 dark:text-white/25">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {screen.title}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex items-center justify-between px-5 py-4 sm:px-8">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="inline-flex items-center gap-2 text-xs text-black/45 hover:text-black dark:text-white/42 dark:hover:text-white"
              >
                <ArrowLeft className="size-3.5" /> {flow.screens[step - 1]?.title}
              </button>
            ) : (
              <span />
            )}
            {step < flow.screens.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="inline-flex items-center gap-2 text-xs font-medium text-black/65 hover:text-black dark:text-white/62 dark:hover:text-white"
              >
                {flow.screens[step + 1]?.title} <ArrowRight className="size-3.5" />
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <Check className="size-3.5" /> End of flow
              </span>
            )}
          </div>
        </div>

        <aside className="bg-white/45 dark:bg-white/[0.018]">
          <div className="border-b border-black/8 p-5 dark:border-white/8">
            <div className="flex items-center gap-2">
              <Info className="size-3.5 text-black/32 dark:text-white/30" />
              <h2 className="text-xs font-semibold">Screen details</h2>
            </div>
            <p className="mt-3 text-xs leading-5 text-black/48 dark:text-white/45">
              {current.description}
            </p>
          </div>
          <dl className="space-y-4 border-b border-black/8 p-5 text-[11px] dark:border-white/8">
            <Detail
              icon={Monitor}
              term="Platform"
              value={`${flow.platform} · ${current.viewport}`}
            />
            <Detail icon={CalendarDays} term="Captured" value={formatDate(current.capturedAt)} />
            <Detail icon={UserRound} term="Contributor" value={flow.contributor} />
          </dl>
          <div className="border-b border-black/8 p-5 dark:border-white/8">
            <div className="flex items-center gap-2">
              <Tag className="size-3.5 text-black/32 dark:text-white/30" />
              <h3 className="text-xs font-semibold">Patterns</h3>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {current.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-black/8 bg-white px-2 py-1 text-[9px] text-black/45 dark:border-white/8 dark:bg-white/5 dark:text-white/42"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="p-5">
            <h3 className="text-xs font-semibold">Visible text</h3>
            <ul className="mt-3 space-y-2">
              {current.visibleText.map((text) => (
                <li
                  key={text}
                  className="flex items-center justify-between gap-2 text-[11px] text-black/46 dark:text-white/43"
                >
                  <span className="truncate">“{text}”</span>
                  <ExternalLink className="size-2.5 shrink-0 opacity-30" />
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <div className="flex items-center justify-center gap-2 border-t border-black/8 px-4 py-2.5 text-[10px] text-black/32 dark:border-white/8 dark:text-white/28">
        <span className="rounded border border-black/8 px-1 py-0.5 dark:border-white/8">←</span>
        <span className="rounded border border-black/8 px-1 py-0.5 dark:border-white/8">→</span> to
        navigate screens
      </div>
    </div>
  );
}

function Detail({
  icon: Icon,
  term,
  value,
}: {
  icon: typeof Monitor;
  term: string;
  value: string;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-black/30 dark:text-white/28" />
      <div>
        <dt className="text-black/35 dark:text-white/32">{term}</dt>
        <dd className="mt-0.5 text-black/65 dark:text-white/60">{value}</dd>
      </div>
    </div>
  );
}

export function FlowNotFound() {
  return (
    <div className="grid min-h-[70svh] place-items-center px-6 text-center">
      <div>
        <span className="text-6xl font-semibold tracking-[-0.06em] text-black/8 dark:text-white/8">
          404
        </span>
        <h1 className="mt-3 text-xl font-semibold">Flow not found</h1>
        <p className="mt-2 text-sm text-black/45 dark:text-white/42">
          This flow may have been moved or unpublished.
        </p>
        <Link
          to="/library"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#ff5d42] px-3.5 py-2 text-xs font-semibold text-white"
        >
          <ArrowLeft className="size-3.5" /> Back to library
        </Link>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(
    new Date(`${value}T12:00:00`),
  );
}
