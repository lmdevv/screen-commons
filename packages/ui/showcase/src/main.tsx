import "./showcase.css";

import { ThemeProvider, Toaster, TooltipProvider } from "@open-ui/ui";
import type { Platform } from "@open-ui/core/taxonomy";
import * as React from "react";
import { createRoot } from "react-dom/client";

import { Shell } from "./chrome";
import { AppDetailPage } from "./pages/app-detail";
import { ComponentsPage } from "./pages/components";
import { DiscoverPage } from "./pages/discover";
import { useRoute, type Route } from "./router";

function App() {
  const route = useRoute();
  const [platform, setPlatform] = React.useState<Platform>(
    (route.params.get("platform") as Platform | null) ?? "web",
  );

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.path]);

  let page: React.ReactNode;
  if (route.path === "/discover") {
    page = <DiscoverPage route={route} platform={platform} onPlatformChange={setPlatform} />;
  } else if (route.path === "/app") {
    page = <AppDetailPage route={route} />;
  } else if (route.path === "/flow") {
    const flowRoute: Route = {
      path: "/discover",
      params: new URLSearchParams({
        tab: "flows",
        flow: route.params.get("flow") ?? "flow_tally_onboarding",
      }),
    };
    page = (
      <DiscoverPage
        route={flowRoute}
        platform={(route.params.get("platform") as Platform | null) ?? "ios"}
      />
    );
  } else {
    page = <ComponentsPage />;
  }

  return (
    <Shell platform={platform} onPlatformChange={setPlatform}>
      {page}
    </Shell>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <App />
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
