import { describe, expect, it } from "vitest";

import {
  OpenUiApiError,
  ScreenCommonsApiError,
  createOpenUiClient,
  createScreenCommonsClient,
} from "./client";

describe("SDK rename compatibility", () => {
  it("keeps old client imports and instanceof checks working", async () => {
    expect(createOpenUiClient).toBe(createScreenCommonsClient);
    const client = createOpenUiClient({
      baseUrl: "https://screencommons.example.com",
      fetch: async () =>
        new Response(
          JSON.stringify({ error: { code: "unauthorized", message: "Invalid API key" } }),
          { status: 401 },
        ),
    });
    let error: unknown;
    try {
      await client.me();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ScreenCommonsApiError);
    expect(error).toBeInstanceOf(OpenUiApiError);
    expect(error).toMatchObject({
      name: "ScreenCommonsApiError",
      status: 401,
      code: "unauthorized",
    });
  });
});
