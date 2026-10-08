import type { User } from "@screen-commons/core";
import { Avatar } from "@screen-commons/ui";
import { lazy, Suspense, useState } from "react";

const loadPopup = () => import("./account-menu-popup");
const AccountMenuPopup = lazy(loadPopup);

export interface AccountMenuProps {
  user: User;
}

/**
 * Avatar button that becomes the full account menu (Saved, Contribute, Review for admins,
 * Settings, theme, Docs, Sign out) on first hover/focus/press. The menu — Base UI Menu + its
 * positioning engine and the app's items — is a separate chunk, so it costs nothing on first load.
 */
export function AccountMenu(props: AccountMenuProps) {
  const [armed, setArmed] = useState<false | { open: boolean; focus: boolean }>(false);
  const placeholder = (
    <button
      type="button"
      aria-label={`Account menu for ${props.user.name}`}
      aria-haspopup="menu"
      aria-expanded={false}
      onPointerEnter={() => void loadPopup()}
      onFocus={(event) => {
        void loadPopup();
        if (event.currentTarget.matches(":focus-visible")) setArmed({ open: false, focus: true });
      }}
      onPointerDown={() => setArmed({ open: true, focus: false })}
      onClick={(event) =>
        setArmed({ open: true, focus: event.currentTarget === document.activeElement })
      }
      className="ou-focus-ring flex rounded-full transition-opacity hover:opacity-85"
    >
      <Avatar name={props.user.name} src={props.user.image} size="md" />
    </button>
  );
  if (!armed) return placeholder;
  return (
    <Suspense fallback={placeholder}>
      <AccountMenuPopup {...props} defaultOpen={armed.open} focusTrigger={armed.focus} />
    </Suspense>
  );
}
