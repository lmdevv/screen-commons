import { createFileRoute } from "@tanstack/react-router";

import { DraftEditor } from "@/features/contribution/draft-editor";

export const Route = createFileRoute("/_auth/contribute")({
  component: DraftEditor,
});
