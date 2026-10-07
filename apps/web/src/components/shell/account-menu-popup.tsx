/* The account menu itself (lazy chunk, see account-menu.tsx). */
import {
  DropdownMenuItem,
  DropdownMenuLinkItem,
} from "@open-ui/ui/components/dropdown-menu";
import AccountMenuPopupBase from "@open-ui/ui/components/account-menu-popup";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { BookOpen, Bookmark, Code, Inbox, Keyboard, Plus, Settings } from "lucide-react";

import { authClient } from "../../lib/auth-client";
import type { AccountMenuProps } from "./account-menu";

export const REPOSITORY_URL = "https://github.com/lmdevv/open-ui";

export default function AccountMenuPopup({
  user,
  onShowShortcuts,
  defaultOpen,
  focusTrigger,
}: AccountMenuProps & { defaultOpen: boolean; focusTrigger: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();

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
          <DropdownMenuLinkItem icon={<BookOpen />} render={<Link to="/docs" />}>
            Docs
          </DropdownMenuLinkItem>
          {onShowShortcuts ? (
            <DropdownMenuItem icon={<Keyboard />} hint="?" onClick={onShowShortcuts}>
              Keyboard shortcuts
            </DropdownMenuItem>
          ) : null}
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
      <DropdownMenuLinkItem icon={<Bookmark />} render={<Link to="/saved" />}>
        Saved
      </DropdownMenuLinkItem>
      <DropdownMenuLinkItem icon={<Plus />} render={<Link to="/contribute" />}>
        Contribute
      </DropdownMenuLinkItem>
      {user.role === "admin" ? (
        <DropdownMenuLinkItem icon={<Inbox />} render={<Link to="/review" />}>
          Review queue
        </DropdownMenuLinkItem>
      ) : null}
      <DropdownMenuLinkItem icon={<Settings />} render={<Link to="/settings" />}>
        Settings
      </DropdownMenuLinkItem>
    </AccountMenuPopupBase>
  );
}
