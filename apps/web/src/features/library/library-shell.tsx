import { UserButton } from "@clerk/tanstack-react-start";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bookmark, Compass, FolderOpen, GitFork, Menu, Moon, Plus, Sun, X } from "lucide-react";
import { type ReactNode, useState } from "react";

interface LibraryShellProps {
  children: ReactNode;
}

const navItems = [
  { to: "/library" as const, label: "Discover", icon: Compass },
  { to: "/library" as const, label: "Products", icon: FolderOpen },
];

export function LibraryShell({ children }: LibraryShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const focusSearch = () =>
    document.querySelector<HTMLInputElement>("[data-library-search]")?.focus();
  useHotkeys(
    [
      { hotkey: "/", callback: focusSearch },
      { hotkey: "Mod+K", callback: focusSearch },
    ],
    {
      ignoreInputs: true,
      meta: { name: "Search library", description: "Focus the catalog search input" },
    },
  );

  const toggleTheme = () => {
    const nextDark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", nextDark);
    setIsDark(nextDark);
  };

  return (
    <div className="min-h-full bg-[#f7f7f5] text-[#171717] dark:bg-[#10100f] dark:text-[#f4f4f1]">
      <a
        href="#library-content"
        className="fixed left-3 top-3 z-50 -translate-y-20 rounded-md bg-foreground px-3 py-2 text-sm text-background transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-black/8 bg-[#f7f7f5]/92 backdrop-blur-xl dark:border-white/8 dark:bg-[#10100f]/92 lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Brand />
          <button
            type="button"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="grid size-9 place-items-center rounded-lg border border-black/10 dark:border-white/10"
          >
            {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
        {menuOpen ? (
          <nav
            className="space-y-1 border-t border-black/8 p-3 dark:border-white/8"
            aria-label="Mobile navigation"
          >
            {navItems.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-black/5 dark:hover:bg-white/6"
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-black/8 bg-[#f0f0ed] p-4 dark:border-white/8 dark:bg-[#151514] lg:flex">
        <Brand />
        <nav className="mt-8 space-y-1" aria-label="Library navigation">
          {navItems.map((item, index) => {
            const active =
              index === 0 ? pathname === "/library" : pathname.startsWith("/products/");
            return (
              <Link
                key={item.label}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-white font-medium shadow-sm dark:bg-white/9"
                    : "text-black/60 hover:bg-black/5 hover:text-black dark:text-white/55 dark:hover:bg-white/5 dark:hover:text-white"
                }`}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
          <span
            className="flex cursor-not-allowed items-center gap-3 px-3 py-2 text-sm text-black/32 dark:text-white/28"
            title="Saved references are coming soon"
          >
            <Bookmark className="size-4" /> Saved
            <span className="ml-auto rounded bg-black/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase dark:bg-white/8">
              Soon
            </span>
          </span>
        </nav>

        <div className="mt-8 border-t border-black/8 pt-5 dark:border-white/8">
          <p className="px-3 text-[10px] font-semibold tracking-[0.16em] text-black/38 uppercase dark:text-white/35">
            Contribute
          </p>
          <Link
            to="/contribute"
            className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-black/60 hover:bg-black/5 hover:text-black dark:text-white/55 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <Plus className="size-4" /> Submit a flow
          </Link>
        </div>

        <div className="mt-auto space-y-3">
          <a
            href="https://github.com/lmdevv/open-ui"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-3 text-xs text-black/45 hover:text-black dark:text-white/40 dark:hover:text-white"
          >
            <GitFork className="size-3.5" /> Open source on GitHub
          </a>
          <div className="flex items-center justify-between rounded-xl border border-black/8 bg-white/55 p-2.5 dark:border-white/8 dark:bg-white/[0.035]">
            <div className="flex items-center gap-2.5">
              <UserButton />
              <span className="text-xs font-medium">Your account</span>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="grid size-7 place-items-center rounded-md text-black/45 hover:bg-black/5 hover:text-black dark:text-white/45 dark:hover:bg-white/8 dark:hover:text-white"
              aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
            >
              {isDark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </button>
          </div>
        </div>
      </aside>

      <main id="library-content" className="min-h-[calc(100svh-3.5rem)] lg:ml-60 lg:min-h-svh">
        {children}
      </main>
    </div>
  );
}

function Brand() {
  return (
    <Link to="/library" className="flex items-center gap-2.5" aria-label="Open UI library home">
      <span
        className="grid size-7 grid-cols-2 gap-[3px] rounded-lg bg-[#ff5d42] p-1.5 shadow-[0_4px_14px_rgba(255,93,66,0.28)]"
        aria-hidden="true"
      >
        <span className="rounded-[2px] bg-white" />
        <span className="rounded-[2px] bg-white/65" />
        <span className="rounded-[2px] bg-white/65" />
        <span className="rounded-[2px] bg-white" />
      </span>
      <span className="text-sm font-semibold tracking-[-0.02em]">Open UI</span>
      <span className="rounded-full border border-black/10 px-1.5 py-0.5 text-[8px] font-semibold tracking-wider text-black/40 uppercase dark:border-white/10 dark:text-white/35">
        Beta
      </span>
    </Link>
  );
}

export function LibraryPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-black/8 px-5 py-6 dark:border-white/8 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-10 lg:py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-black/48 dark:text-white/45">
            {description}
          </p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}
