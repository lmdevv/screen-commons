/* The account menu itself (lazy chunk, see account-menu.tsx). */
import {
  DropdownMenuItem,
  DropdownMenuLinkItem,
} from "@screen-commons/ui/components/dropdown-menu";
import AccountMenuPopupBase from "@screen-commons/ui/components/account-menu-popup";
import { Shortcut } from "@screen-commons/ui/components/kbd";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { BookOpen, Bookmark, Code, Inbox, Keyboard, Plus, Settings } from "lucide-react";

import { authClient } from "../../lib/auth-client";
import { commandShortcut, SHORTCUTS } from "../../lib/shortcuts";
import type { AccountMenuProps } from "./account-menu";
import { useShowShortcuts } from "./keyboard-shortcuts";

const hint = (id: string) => <Shortcut keys={commandShortcut(id)!} />;

export const REPOSITORY_URL = "https://github.com/lmdevv/screen-commons";

export default function AccountMenuPopup({
  user,
  defaultOpen,
  focusTrigger,
}: AccountMenuProps & { defaultOpen: boolean; focusTrigger: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const showShortcuts = useShowShortcuts();

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    await router.invalidate();
    await router.navigate({ to: "/sign-in" });
  }

  return (
    <AccountMenuPopupBase
      user={user}
      defaultOpen={defaultOpen}
      focusTrigger={focusTrigger}
      onSignOut={() => void signOut()}
      footer={
        <>
          <DropdownMenuLinkItem
            icon={<BookOpen />}
            hint={hint("docs")}
            render={<Link to="/docs" />}
          >
            Docs
          </DropdownMenuLinkItem>
          <DropdownMenuItem
            icon={<Keyboard />}
            hint={<Shortcut keys={SHORTCUTS.help.keys} />}
            onClick={showShortcuts}
          >
            Keyboard shortcuts
          </DropdownMenuItem>
          <DropdownMenuLinkItem
            icon={<Code />}
            external
            render={<a href={REPOSITORY_URL} target="_blank" rel="noreferrer noopener" />}
          >
            Source code
          </DropdownMenuLinkItem>
        </>
      }
    >
      <DropdownMenuLinkItem icon={<Bookmark />} hint={hint("saved")} render={<Link to="/saved" />}>
        Saved
      </DropdownMenuLinkItem>
      <DropdownMenuLinkItem
        icon={<Plus />}
        hint={hint("contribute")}
        render={<Link to="/contribute" />}
      >
        Contribute
      </DropdownMenuLinkItem>
      {user.role === "admin" ? (
        <DropdownMenuLinkItem icon={<Inbox />} hint={hint("review")} render={<Link to="/review" />}>
          Review queue
        </DropdownMenuLinkItem>
      ) : null}
      <DropdownMenuLinkItem
        icon={<Settings />}
        hint={hint("settings")}
        render={<Link to="/settings" />}
      >
        Settings
      </DropdownMenuLinkItem>
    </AccountMenuPopupBase>
  );
}
