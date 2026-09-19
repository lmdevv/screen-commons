import { createFileRoute } from "@tanstack/react-router";

import { MySubmissions } from "@/features/contribution/my-submissions";

export const Route = createFileRoute("/_auth/submissions")({
  component: MySubmissions,
});
