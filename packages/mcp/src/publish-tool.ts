import { resolve } from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createScreenCommonsClient, publishTools } from "@screen-commons/core";
import type { z } from "zod";

import { errorInfo } from "./errors";
import { publishManifestFile } from "./publish";
import { imageFetchFor } from "./public-fetch";
import { retryingFetch } from "./retry";
import { reportProgress, text, type ToolResult } from "./util";

export interface PublishToolContext {
  baseUrl: string;
  apiKey: string | undefined;
  fetch: typeof fetch;
  headers: Record<string, string>;
}

type Args = z.output<typeof publishTools.publish_manifest.input>;

export function registerPublishTools(server: McpServer, context: PublishToolContext) {
  const spec = publishTools.publish_manifest;
  // Publishing converges on retry, which the plain catalog tools' writes can't all promise.
  const doFetch = retryingFetch({ fetch: context.fetch, readBody: true });
  const handler = async (args: Args, extra: unknown): Promise<ToolResult> => {
    if (!context.apiKey) {
      return {
        content: [
          text(
            `SCREEN_COMMONS_API_KEY is not set. Create an API key at ${context.baseUrl}/settings (API keys) and add it to the screen-commons-mcp server env.`,
          ),
        ],
        isError: true,
      };
    }
    try {
      const report = await publishManifestFile(resolve(args.path), {
        client: createScreenCommonsClient({
          baseUrl: context.baseUrl,
          apiKey: context.apiKey,
          fetch: doFetch,
          headers: context.headers,
        }),
        fetch: retryingFetch({ fetch: imageFetchFor(context.baseUrl) }),
        onProgress: (done, total, message) => void reportProgress(extra, done, total, message),
      });
      return { content: [text(JSON.stringify(report))], isError: !report.ok };
    } catch (error) {
      const { code, message } = errorInfo(error, context.baseUrl);
      return { content: [text(`${code}: ${message}`)], isError: true };
    }
  };
  server.registerTool(
    spec.name,
    {
      title: spec.title,
      description: spec.description,
      inputSchema: spec.input,
      annotations: { title: spec.title, readOnlyHint: false, openWorldHint: true },
    },
    handler as never,
  );
}
