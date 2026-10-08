import type { User } from "@screen-commons/core";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Label,
  Description,
  ThemeToggle,
} from "@screen-commons/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { authClient } from "../../lib/auth-client";
import { SingleKeyShortcutsSwitch } from "../shell/single-key-shortcuts";
import { errorMessage, notify } from "../../lib/toast";

export function ProfileSection({ user }: { user: User }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const dirty = name.trim() !== user.name && name.trim().length > 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty) return;
    setSaving(true);
    const { error } = await authClient.updateUser({ name: name.trim() });
    setSaving(false);
    if (error) return notify.error(error.message ?? "Could not save your name");
    await queryClient.invalidateQueries({ queryKey: ["session"] });
    await router.invalidate();
    notify.success("Profile saved");
  }

  async function signOutEverywhere() {
    setSigningOut(true);
    try {
      await authClient.revokeSessions();
      await authClient.signOut();
      queryClient.clear();
      await router.invalidate();
      await router.navigate({ to: "/sign-in" });
    } catch (error) {
      setSigningOut(false);
      notify.error(errorMessage(error));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <form onSubmit={onSubmit}>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>How you appear on your contributions.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex items-center gap-4">
              <Avatar name={name || user.name} src={user.image} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-md font-semibold text-fg">{name || user.name}</p>
                <p className="mt-0.5 flex items-center gap-2 text-sm text-fg-muted">
                  <span className="truncate">{user.email}</span>
                  <Badge tone={user.role === "admin" ? "inverse" : "neutral"}>
                    {user.role === "admin" ? "Admin" : "Member"}
                  </Badge>
                </p>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field name="name">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  autoComplete="name"
                />
              </Field>
              <Field name="email" disabled>
                <Label>Email</Label>
                <Input value={user.email} readOnly disabled />
                <Description>Email can’t be changed.</Description>
              </Field>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" size="sm" disabled={!dirty} loading={saving}>
              Save changes
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>Appearance</CardTitle>
            <CardDescription className="mt-1">Light, dark, or follow your system.</CardDescription>
          </div>
          <ThemeToggle size="md" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div>
            <CardTitle>Keyboard</CardTitle>
            <CardDescription className="mt-1">Saved on this device.</CardDescription>
          </div>
          <SingleKeyShortcutsSwitch />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-md">
            <CardTitle>Sign out everywhere</CardTitle>
            <CardDescription className="mt-1">
              Ends every session on every device, including this one. API keys keep working — revoke
              them separately.
            </CardDescription>
          </div>
          <Button variant="outline" loading={signingOut} onClick={signOutEverywhere}>
            Sign out everywhere
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
