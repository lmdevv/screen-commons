import { UserButton, useUser } from "@clerk/tanstack-react-start";
import { Link, useRouterState } from "@tanstack/react-router";

export default function Header() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const usesLibraryShell =
    pathname === "/library" || pathname.startsWith("/products/") || pathname.startsWith("/flows/");

  if (usesLibraryShell) return null;

  const { user } = useUser();
  const links = user
    ? ([
        { to: "/library", label: "Library" },
        { to: "/contribute", label: "Contribute" },
        { to: "/submissions", label: "My submissions" },
      ] as const)
    : ([
        { to: "/", label: "Home" },
        { to: "/policies", label: "Policies" },
      ] as const);

  return (
    <header className="border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          to={user ? "/library" : "/"}
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <span
            className="grid size-7 grid-cols-2 gap-[3px] rounded-lg bg-[#ff5d42] p-1.5"
            aria-hidden="true"
          >
            <span className="rounded-[2px] bg-white" />
            <span className="rounded-[2px] bg-white/65" />
            <span className="rounded-[2px] bg-white/65" />
            <span className="rounded-[2px] bg-white" />
          </span>
          Open UI
        </Link>
        <nav
          className="flex items-center gap-4 overflow-x-auto text-xs sm:text-sm"
          aria-label="Primary navigation"
        >
          {links.map(({ to, label }) => {
            return (
              <Link
                key={to}
                to={to}
                className="whitespace-nowrap text-muted-foreground hover:text-foreground active:text-foreground"
              >
                {label}
              </Link>
            );
          })}
        </nav>
        {user ? <UserButton /> : null}
      </div>
    </header>
  );
}
