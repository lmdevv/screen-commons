import { Logo, ScreenImage } from "@open-ui/ui";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { LandingData } from "../marketing/landing.functions";

/**
 * Auth-page layout: centred column with the logo above a `max-w-sm` stack. On `lg+` a quiet grey
 * panel on the right shows a collage of real screens from the library.
 */
export function AuthLayout({
  children,
  screens = [],
}: {
  children: ReactNode;
  screens?: LandingData["screens"];
}) {
  const collage = screens.length >= 4;
  return (
    <div className={collage ? "grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" : ""}>
      <main className="flex min-h-dvh flex-col px-4 sm:px-6">
        <div className="flex h-topbar items-center lg:px-2">
          <Link to="/" aria-label="Open UI home" className="ou-focus-ring rounded-sm">
            <Logo />
          </Link>
        </div>
        <div className="flex flex-1 items-start justify-center pt-12 pb-20 sm:items-center sm:pt-6">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>
      {collage ? <Collage screens={screens} /> : null}
    </div>
  );
}

function Collage({ screens }: { screens: LandingData["screens"] }) {
  const columns = [screens.filter((_, i) => i % 2 === 0), screens.filter((_, i) => i % 2 === 1)];
  return (
    <aside aria-hidden className="relative hidden overflow-hidden bg-tile lg:block">
      <div className="absolute inset-0 grid grid-cols-2 gap-5 p-10 xl:gap-6 xl:p-14">
        {columns.map((column, c) => (
          <div
            key={c}
            className={
              c === 1 ? "flex flex-col gap-5 pt-24 xl:gap-6" : "flex flex-col gap-5 xl:gap-6"
            }
          >
            {column.map((screen) => (
              <div key={screen.id} className="rounded-card bg-bg p-[5%] shadow-raised">
                <ScreenImage
                  src={screen.thumbUrl}
                  width={screen.width}
                  height={screen.height}
                  platform="web"
                  alt=""
                  sizes="(min-width: 1024px) 25vw, 1px"
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
