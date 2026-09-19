import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Layers3,
  Monitor,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { LibraryProduct } from "./types";
import { ProductMark } from "./catalog-view";
import { UiPreview } from "./ui-preview";

export function ProductView({ product }: { product: LibraryProduct }) {
  const [versionId, setVersionId] = useState(product.versions[0]?.id ?? "");
  const version = product.versions.find((item) => item.id === versionId) ?? product.versions[0];
  const flows = useMemo(
    () => product.flows.filter((flow) => flow.versionId === versionId),
    [product.flows, versionId],
  );
  const screens = flows.flatMap((flow) => flow.screens);

  return (
    <div>
      <div className="border-b border-black/8 px-5 py-5 dark:border-white/8 sm:px-8 lg:px-10">
        <Link
          to="/library"
          className="inline-flex items-center gap-2 text-xs text-black/45 hover:text-black dark:text-white/42 dark:hover:text-white"
        >
          <ArrowLeft className="size-3.5" /> All products
        </Link>
      </div>
      <section className="border-b border-black/8 px-5 py-8 dark:border-white/8 sm:px-8 lg:px-10 lg:py-10">
        <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
          <div className="flex items-start gap-4">
            <ProductMark product={product} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-semibold tracking-[-0.04em]">{product.name}</h1>
                <span className="rounded-full bg-black/[0.045] px-2 py-1 text-[10px] text-black/45 dark:bg-white/6 dark:text-white/40">
                  {product.industry}
                </span>
              </div>
              <p className="mt-2 max-w-xl text-sm leading-6 text-black/48 dark:text-white/45">
                {product.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {product.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-black/8 px-2.5 py-1 text-[10px] text-black/42 dark:border-white/8 dark:text-white/38"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <label className="relative w-full sm:w-60">
            <span className="mb-1.5 block text-[10px] font-semibold tracking-wider text-black/38 uppercase dark:text-white/35">
              Product version
            </span>
            <select
              value={versionId}
              onChange={(event) => setVersionId(event.target.value)}
              className="h-10 w-full appearance-none rounded-lg border border-black/10 bg-white px-3 pr-8 text-xs font-medium outline-none focus:border-[#ff5d42]/60 dark:border-white/10 dark:bg-white/5"
            >
              {product.versions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute bottom-3 right-3 size-3.5 text-black/35 dark:text-white/35" />
          </label>
        </div>
      </section>

      <div className="grid border-b border-black/8 dark:border-white/8 sm:grid-cols-3">
        <Stat icon={Layers3} value={flows.length} label="documented flows" />
        <Stat icon={Monitor} value={screens.length} label="ordered screens" />
        <Stat
          icon={CalendarDays}
          value={version?.capturedAt ? formatDate(version.capturedAt) : "—"}
          label={version?.releaseNote ?? "Capture date"}
        />
      </div>

      <div className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.14em] text-black/36 uppercase dark:text-white/32">
              {version?.label}
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.025em]">
              Flows in this version
            </h2>
          </div>
          <span className="text-xs text-black/36 dark:text-white/32">Ordered by task</span>
        </div>
        {flows.length ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            {flows.map((flow) => (
              <Link
                key={flow.id}
                to="/flows/$flowId"
                params={{ flowId: flow.id }}
                className="group overflow-hidden rounded-2xl border border-black/8 bg-white transition hover:-translate-y-0.5 hover:border-black/15 hover:shadow-[0_14px_30px_rgba(28,25,20,0.07)] dark:border-white/8 dark:bg-white/[0.035] dark:hover:border-white/15"
              >
                <div className="grid grid-cols-3 gap-1 border-b border-black/6 bg-black/[0.025] p-2.5 dark:border-white/6 dark:bg-white/[0.02]">
                  {flow.screens.slice(0, 3).map((screen) => (
                    <UiPreview
                      key={screen.id}
                      screen={screen}
                      compact
                      className="aspect-[1.2] rounded-lg"
                    />
                  ))}
                </div>
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-[#ff5d42]/10 px-2 py-1 text-[9px] font-semibold text-[#d84831] dark:text-[#ff806b]">
                          {flow.category}
                        </span>
                        <span className="text-[10px] text-black/35 dark:text-white/32">
                          {flow.platform}
                        </span>
                      </div>
                      <h3 className="mt-3 text-base font-semibold tracking-[-0.02em]">
                        {flow.name}
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-black/44 dark:text-white/40">
                        {flow.description}
                      </p>
                    </div>
                    <ArrowRight className="mt-2 size-4 text-black/25 transition group-hover:translate-x-1 group-hover:text-black dark:text-white/28 dark:group-hover:text-white" />
                  </div>
                  <div className="mt-4 flex items-center gap-2 border-t border-black/6 pt-3 text-[10px] text-black/38 dark:border-white/6 dark:text-white/35">
                    <span>{flow.screens.length} screens</span>
                    <span>·</span>
                    <span>Updated {formatDate(flow.updatedAt)}</span>
                    <span className="ml-auto flex items-center gap-1">
                      <Check className="size-3 text-emerald-600" /> Verified order
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-black/12 py-16 text-center dark:border-white/12">
            <p className="text-sm font-medium">No flows captured for this version yet</p>
            <p className="mt-1 text-xs text-black/42 dark:text-white/38">
              Choose another version to continue browsing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Layers3;
  value: string | number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-black/8 px-5 py-4 last:border-0 dark:border-white/8 sm:border-b-0 sm:border-r sm:px-8 lg:px-10">
      <Icon className="size-4 text-black/32 dark:text-white/30" />
      <div>
        <span className="text-sm font-semibold">{value}</span>
        <span className="ml-2 text-[11px] text-black/38 dark:text-white/35">{label}</span>
      </div>
    </div>
  );
}

export function ProductNotFound() {
  return (
    <div className="grid min-h-[70svh] place-items-center px-6 text-center">
      <div>
        <span className="text-6xl font-semibold tracking-[-0.06em] text-black/8 dark:text-white/8">
          404
        </span>
        <h1 className="mt-3 text-xl font-semibold">Product not found</h1>
        <p className="mt-2 text-sm text-black/45 dark:text-white/42">
          This reference may have been moved or unpublished.
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
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(`${value}T12:00:00`),
  );
}
