import type { User } from "@open-ui/core";
import { Container, PageHeader, TabNav, TabNavItem } from "@open-ui/ui";
import { Link } from "@tanstack/react-router";

import { ApiKeysSection } from "./api-keys";
import { IntegrationsSection } from "./integrations";
import { ProfileSection } from "./profile";

export type SettingsTab = "profile" | "keys" | "integrations";

const TABS: { value: SettingsTab; label: string }[] = [
  { value: "profile", label: "Profile" },
  { value: "keys", label: "API keys" },
  { value: "integrations", label: "Extension & MCP" },
];

export function SettingsPage({
  tab,
  user,
  origin,
}: {
  tab: SettingsTab;
  user: User;
  origin: string;
}) {
  return (
    <Container size="prose" className="pt-10 pb-24 sm:pt-12">
      <PageHeader title="Settings" />
      <TabNav aria-label="Settings" bordered className="mt-5">
        {TABS.map((item) => (
          <TabNavItem
            key={item.value}
            active={tab === item.value}
            render={
              <Link
                to="/settings"
                search={item.value === "profile" ? {} : { tab: item.value }}
                replace
                resetScroll={false}
              />
            }
          >
            {item.label}
          </TabNavItem>
        ))}
      </TabNav>
      <div className="mt-8">
        {tab === "profile" ? <ProfileSection user={user} /> : null}
        {tab === "keys" ? <ApiKeysSection /> : null}
        {tab === "integrations" ? <IntegrationsSection origin={origin} /> : null}
      </div>
    </Container>
  );
}
