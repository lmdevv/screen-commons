import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { appOrigin } from "../../server/env";

/** Public origin of this instance (APP_URL or the request origin), for setup snippets. */
export const getInstanceOrigin = createServerFn({ method: "GET" }).handler(() =>
  appOrigin(getRequest()),
);
