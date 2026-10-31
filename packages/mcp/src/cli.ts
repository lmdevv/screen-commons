#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { access, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs, type ParseArgsConfig } from "node:util";

import {
  compactApp,
  compactFlow,
  compactScreen,
  createFlowInputSchema,
  createScreenCommonsClient,
  createdFlowResult,
  flowDetailResult,
  readImageHeader,
  screenDetailResult,
  suggestPatterns,
  updateFlowInputSchema,
  updateScreenInputSchema,
  type ListAppsQuery,
  type ListFlowsQuery,
  type ListScreensQuery,
  type ScreenCommonsClient,
} from "@screen-commons/core";
import type { z } from "zod";

import { version } from "../package.json";
import { resolveInstance } from "./config";
import { CodedError, errorInfo } from "./errors";
import { retryingFetch } from "./retry";

const EXIT_CODES: Record<string, number> = {
  usage: 2,
  invalid_manifest: 2,
  bad_request: 2,
  conflict: 2,
  payload_too_large: 2,
  unsupported_media_type: 2,
  unprocessable: 2,
  invalid_image: 2,
  source_unreadable: 2,
  source_too_large: 2,
  file_exists: 2,
  missing_api_key: 3,
  unauthorized: 3,
  forbidden: 3,
  not_found: 4,
  network: 5,
  rate_limited: 5,
  unavailable: 5,
};

const usage = (message: string) => new CodedError("usage", message);

type Options = NonNullable<ParseArgsConfig["options"]>;
type Values = Record<string, string | string[] | boolean | undefined>;

interface Context {
  values: Values;
  positionals: string[];
  /** A client with the API key, or refusal when there's no key. */
  client: () => ScreenCommonsClient;
  anonymousClient: () => ScreenCommonsClient;
  origin: string;
  download: typeof fetch;
  apiKey: string | undefined;
}

interface Command {
  summary: string;
  /** Arguments as shown in `--help`, e.g. `<id>`; their count is enforced. */
  args?: string[];
  optionalArgs?: string[];
  flags?: Record<string, { help: string; multiple?: boolean; boolean?: boolean }>;
  run: (context: Context) => Promise<unknown>;
}

type Tree = Record<string, Command | Record<string, Command>>;

const isCommand = (node: Command | Record<string, Command>): node is Command =>
  typeof (node as Command).run === "function";

const paging = {
  limit: { help: "Items per page, up to 100" },
  cursor: { help: "`nextCursor` from the previous page" },
};
const query = { query: { help: "Free text; the same as the positional" } };

const str = (values: Values, name: string) => values[name] as string | undefined;
const list = (values: Values, name: string) => values[name] as string[] | undefined;

/** Parse flag input through the same schema the server applies, for a clean local refusal. */
function validated<S extends z.ZodType>(schema: S, input: unknown): z.input<S> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return input as z.input<S>;
  throw new CodedError(
    "bad_request",
    parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
      .join("; "),
  );
}

const queryText = ({ positionals, values }: Context) =>
  positionals.join(" ") || str(values, "query");

/** Query flags pass through as text: the server validates them against its one schema. */
const flagsOf = (values: Values, names: string[]) =>
  defined(Object.fromEntries(names.map((name) => [name, str(values, name)])));

function jsonPatch(values: Values): Record<string, unknown> {
  const text = str(values, "patch");
  if (text === undefined) return {};
  try {
    const patch: unknown = JSON.parse(text);
    if (patch && typeof patch === "object" && !Array.isArray(patch)) {
      return patch as Record<string, unknown>;
    }
  } catch {
    // reported below
  }
  throw usage("--patch must be a JSON object");
}

const defined = (input: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

function requireChanges(patch: Record<string, unknown>) {
  if (Object.keys(patch).length === 0) throw usage("Nothing to update; pass a flag or --patch");
  return patch;
}

const parseSteps = (values: Values) =>
  list(values, "step")?.map((step) => {
    const split = step.indexOf("=");
    return split < 0
      ? { screenId: step }
      : { screenId: step.slice(0, split), label: step.slice(split + 1) };
  });

const extensions: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

async function downloadScreen(context: Context) {
  const { values, origin } = context;
  const id = context.positionals[0]!;
  const screen = await context.client().getScreen(id);
  const url = new URL(values.thumb ? screen.thumbUrl : screen.imageUrl, `${origin}/`);
  const response = await context.download(url, {
    // Media can live on another host, which must never see the key.
    headers:
      context.apiKey && url.origin === new URL(origin).origin
        ? { authorization: `Bearer ${context.apiKey}` }
        : {},
  });
  if (!response.ok) {
    throw new CodedError(
      response.status === 404 ? "not_found" : "network",
      `Could not download ${url.href} (HTTP ${response.status})`,
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const header = readImageHeader(bytes);
  if (!header) throw new CodedError("bad_response", `${url.href} is not an image`);
  const path = resolve(
    str(values, "out") ?? `${id}${values.thumb ? "-thumb" : ""}.${extensions[header.type]}`,
  );
  if (!values.force) {
    const exists = await access(path).then(
      () => true,
      () => false,
    );
    if (exists) throw new CodedError("file_exists", `${path} exists; pass --force to replace it`);
  }
  const partial = `${path}.${process.pid}.partial`;
  try {
    await writeFile(partial, bytes);
    await rename(partial, path);
  } finally {
    await rm(partial, { force: true });
  }
  return {
    id,
    path,
    url: url.href,
    bytes: bytes.byteLength,
    type: header.type,
    width: header.width,
    height: header.height,
  };
}

async function upload(context: Context) {
  const { values } = context;
  const target = context.positionals[0]!;
  if (/^http:\/\//iu.test(target)) throw usage("Only https URLs can be uploaded");
  const slug = str(values, "app");
  const name = str(values, "app-name");
  if (!slug && !name) throw usage("Pass --app <slug> or --app-name <name>");
  const client = context.client();
  const existing = slug ? await client.getApp(slug) : undefined;
  const title = str(values, "title");
  const sourceUrl = str(values, "source-url");
  const { parseManifest, publishManifest } = await import("./publish");
  const manifest = parseManifest({
    version: 1,
    id: `upload-${randomUUID()}`,
    app: defined({
      slug,
      name: existing?.name ?? name,
      platform: existing?.platform ?? str(values, "platform"),
      category: str(values, "category"),
      websiteUrl: str(values, "website-url"),
    }),
    screens: [
      defined({
        localId: "upload",
        source: /^https:\/\//iu.test(target) ? { url: target } : { file: target },
        title,
        sourceUrl,
        patterns: list(values, "pattern") ?? suggestPatterns(sourceUrl ?? "", title),
        elements: list(values, "element") ?? [],
        tags: list(values, "tag"),
        capturedAt: str(values, "captured-at"),
      }),
    ],
    flows: [],
  });
  const report = await publishManifest(manifest, {
    client,
    baseDir: process.cwd(),
    fetch: context.download,
  });
  const item = report.screens[0]!;
  if (report.error ?? item.error) {
    const { code, message } = (report.error ?? item.error)!;
    throw new CodedError(code, message);
  }
  return { id: item.id, status: item.status, url: item.url, app: report.app };
}

async function publish(context: Context) {
  const raw = str(context.values, "batch-size");
  const batchSize = raw === undefined ? undefined : Number(raw);
  if (batchSize !== undefined && !(Number.isInteger(batchSize) && batchSize >= 1)) {
    throw usage("--batch-size must be a positive whole number");
  }
  const { publishManifestFile } = await import("./publish");
  const report = await publishManifestFile(context.positionals[0]!, {
    client: context.client(),
    fetch: context.download,
    batchSize,
  });
  if (report.ok) return report;
  const count = (items: { status: string }[]) =>
    items.filter((item) => item.status === "failed").length;
  throw new PartialFailure(
    report,
    "publish_failed",
    report.error
      ? `${report.error.code}: ${report.error.message}`
      : `${count(report.screens)} screens and ${count(report.flows)} flows failed`,
  );
}

/** A failure that still has a JSON answer for stdout. */
class PartialFailure extends CodedError {
  readonly report: unknown;

  constructor(report: unknown, code: string, message: string) {
    super(code, message);
    this.report = report;
  }
}

const COMMANDS: Tree = {
  whoami: {
    summary: "Show who the API key belongs to",
    run: async ({ client, origin }) => ({ ...(await client().me()), url: origin }),
  },
  taxonomy: {
    summary: "List the patterns, elements, flow types and categories. Needs no key",
    run: ({ anonymousClient }) => anonymousClient().taxonomy(),
  },
  apps: {
    list: {
      summary: "List apps",
      optionalArgs: ["query"],
      flags: {
        ...query,
        platform: { help: "web, ios or android" },
        category: { help: "Category slug" },
        sort: { help: "latest or popular" },
        ...paging,
      },
      run: async (context) => {
        const { values, client, origin } = context;
        const page = await client().listApps({
          q: queryText(context),
          ...flagsOf(values, ["platform", "category", "sort", "limit", "cursor"]),
        } as ListAppsQuery);
        return {
          items: page.items.map((app) => compactApp(origin, app)),
          nextCursor: page.nextCursor,
        };
      },
    },
    get: {
      summary: "Show one app",
      args: ["slug"],
      run: async ({ client, origin, positionals }) =>
        compactApp(origin, await client().getApp(positionals[0]!)),
    },
  },
  screens: {
    search: {
      summary: "Search screens",
      optionalArgs: ["query"],
      flags: {
        ...query,
        platform: { help: "web, ios or android" },
        pattern: { help: "Pattern slug" },
        element: { help: "Element slug" },
        app: { help: "App slug" },
        ...paging,
      },
      run: async (context) => {
        const { values, client, origin } = context;
        const page = await client().listScreens({
          q: queryText(context),
          ...flagsOf(values, ["platform", "pattern", "element", "app", "limit", "cursor"]),
        } as ListScreensQuery);
        return {
          items: page.items.map((screen) => compactScreen(origin, screen)),
          nextCursor: page.nextCursor,
        };
      },
    },
    get: {
      summary: "Show one screen and the flows it's in",
      args: ["id"],
      run: async ({ client, origin, positionals }) =>
        screenDetailResult(origin, await client().getScreen(positionals[0]!)),
    },
    update: {
      summary: "Edit a screen you contributed. Repeated flags replace the whole list",
      args: ["id"],
      flags: {
        title: { help: "New title" },
        pattern: { help: "Pattern slug", multiple: true },
        element: { help: "Element slug", multiple: true },
        tag: { help: "Tag", multiple: true },
        patch: { help: 'JSON patch, for nulls and empty lists: {"title":null,"tags":[]}' },
      },
      run: async ({ client, origin, positionals, values }) => {
        const patch = requireChanges({
          ...jsonPatch(values),
          ...defined({
            title: str(values, "title"),
            patterns: list(values, "pattern"),
            elements: list(values, "element"),
            tags: list(values, "tag"),
          }),
        });
        const screen = await client().updateScreen(
          positionals[0]!,
          validated(updateScreenInputSchema, patch),
        );
        return screenDetailResult(origin, screen);
      },
    },
    delete: {
      summary: "Delete a screen you contributed. It leaves any flow it was in",
      args: ["id"],
      run: async ({ client, positionals }) => {
        await client().deleteScreen(positionals[0]!);
        return { deleted: true, id: positionals[0] };
      },
    },
    download: {
      summary: "Save a screen's image to a file. Prints where it went",
      args: ["id"],
      flags: {
        out: { help: "File to write. Default <id>.<ext> in this folder" },
        thumb: { help: "Get the thumbnail, not the full image", boolean: true },
        force: { help: "Replace an existing file", boolean: true },
      },
      run: downloadScreen,
    },
  },
  flows: {
    search: {
      summary: "Search flows",
      optionalArgs: ["query"],
      flags: {
        ...query,
        platform: { help: "web, ios or android" },
        type: { help: "Flow type slug" },
        app: { help: "App slug" },
        ...paging,
      },
      run: async (context) => {
        const { values, client, origin } = context;
        const page = await client().listFlows({
          q: queryText(context),
          ...flagsOf(values, ["platform", "type", "app", "limit", "cursor"]),
        } as ListFlowsQuery);
        return {
          items: page.items.map((flow) => compactFlow(origin, flow)),
          nextCursor: page.nextCursor,
        };
      },
    },
    get: {
      summary: "Show one flow and its steps in order",
      args: ["id"],
      run: async ({ client, origin, positionals }) =>
        flowDetailResult(origin, await client().getFlow(positionals[0]!)),
    },
    create: {
      summary: "Create a flow from existing screens of one app",
      flags: {
        app: { help: "App slug (required)" },
        name: { help: "Flow name (required)" },
        type: { help: "Flow type slug" },
        description: { help: "Description" },
        step: {
          help: "<screenId> or <screenId>=<label>, at least twice, in order",
          multiple: true,
        },
        id: { help: "A UUID of your own, so repeating this command can't make a second flow" },
      },
      run: async ({ client, origin, values }) => {
        const slug = str(values, "app");
        if (!slug) throw usage("Pass --app <slug>");
        const api = client();
        // Generated here rather than left to the server, so an internal retry stays one flow.
        const input = validated(createFlowInputSchema.omit({ appId: true }), {
          id: str(values, "id") ?? randomUUID(),
          name: str(values, "name") ?? "",
          type: str(values, "type"),
          description: str(values, "description"),
          steps: parseSteps(values) ?? [],
        });
        const app = await api.getApp(slug);
        const { flow } = await api.createFlow({ ...input, appId: app.id });
        return createdFlowResult(origin, flow);
      },
    },
    update: {
      summary: "Edit a flow you contributed. --step replaces all of its steps",
      args: ["id"],
      flags: {
        name: { help: "New name" },
        type: { help: "Flow type slug" },
        description: { help: "New description" },
        step: { help: "<screenId> or <screenId>=<label>, in order", multiple: true },
        patch: { help: 'JSON patch, for nulls: {"type":null,"description":null}' },
      },
      run: async ({ client, origin, positionals, values }) => {
        const patch = requireChanges({
          ...jsonPatch(values),
          ...defined({
            name: str(values, "name"),
            type: str(values, "type"),
            description: str(values, "description"),
            steps: parseSteps(values),
          }),
        });
        const flow = await client().updateFlow(
          positionals[0]!,
          validated(updateFlowInputSchema, patch),
        );
        return flowDetailResult(origin, flow);
      },
    },
    delete: {
      summary: "Delete a flow you contributed. Its screens stay",
      args: ["id"],
      run: async ({ client, positionals }) => {
        await client().deleteFlow(positionals[0]!);
        return { deleted: true, id: positionals[0] };
      },
    },
  },
  upload: {
    summary: "Upload one image file or https URL as a screen",
    args: ["file|url"],
    flags: {
      app: { help: "Slug of an existing app" },
      "app-name": { help: "Name of the app, created if it's new" },
      "website-url": { help: "The app's website" },
      platform: { help: "web, ios or android. Default web" },
      category: { help: "Category slug" },
      title: { help: "Screen title" },
      "source-url": { help: "Page the screen shows" },
      pattern: {
        help: "Pattern slug. Suggested from the URL and title if omitted",
        multiple: true,
      },
      element: { help: "Element slug", multiple: true },
      tag: { help: "Tag", multiple: true },
      "captured-at": { help: "When it was captured, ISO 8601" },
    },
    run: upload,
  },
  manifest: {
    validate: {
      summary: "Check a manifest and its local files, without the network. Needs no key",
      args: ["path"],
      run: async ({ positionals }) => {
        const { validateManifest } = await import("./publish");
        const result = await validateManifest(positionals[0]!);
        if (result.ok) return result;
        throw new PartialFailure(
          result,
          "invalid_manifest",
          result.issues.map((issue) => `${issue.localId}: ${issue.message}`).join("; "),
        );
      },
    },
    publish: {
      summary: "Publish a manifest. Safe to repeat, also after a crash or an edit",
      args: ["path"],
      flags: { "batch-size": { help: "Screens per request, up to 50. Default as many as fit" } },
      run: publish,
    },
  },
};

const GLOBAL_FLAGS = `Global flags:
  --url <origin>     Screen Commons instance [SCREEN_COMMONS_URL] (default http://localhost:5173)
  --api-key <sc_…>   API key [SCREEN_COMMONS_API_KEY]. Prefer the variable: flags show up in ps
  --help             Show help for any command
`;

const EXIT_HELP = `Exit codes:
  0  Success
  1  Failed, including a publish where any item failed (see its JSON report)
  2  Bad input: usage, manifest, image or a request the server refuses as invalid
  3  No API key, a rejected one, or not allowed
  4  Not found
  5  Unreachable or rate limited; retried already, so try again later
`;

const OUTPUT_HELP = `Output: JSON on stdout. Errors are one "code: message" line on stderr.
`;

function commandHelp(path: string[], command: Command): string {
  const args = [
    ...(command.args ?? []).map((arg) => `<${arg}>`),
    ...(command.optionalArgs ?? []).map((arg) => `[${arg}]`),
  ];
  const flags = Object.entries(command.flags ?? {});
  const width = Math.max(0, ...flags.map(([name]) => name.length));
  return [
    `${command.summary}\n`,
    `Usage: screen-commons ${[...path, ...args].join(" ")}${flags.length ? " [flags]" : ""}\n`,
    ...(flags.length
      ? [
          "Flags:",
          ...flags.map(
            ([name, flag]) =>
              `  --${name.padEnd(width)}  ${flag.help}${flag.multiple ? " (repeatable)" : ""}`,
          ),
          "",
        ]
      : []),
    GLOBAL_FLAGS,
  ].join("\n");
}

function groupHelp(name: string, group: Record<string, Command>): string {
  const width = Math.max(...Object.keys(group).map((item) => item.length));
  return [
    `Usage: screen-commons ${name} <command>\n`,
    "Commands:",
    ...Object.entries(group).map(
      ([item, command]) => `  ${item.padEnd(width)}  ${command.summary}`,
    ),
    `\nRun "screen-commons ${name} <command> --help" for its flags.\n`,
  ].join("\n");
}

function rootHelp(): string {
  const entries = Object.entries(COMMANDS).flatMap(([name, node]) =>
    isCommand(node)
      ? [[name, node.summary] as const]
      : Object.entries(node).map(
          ([item, command]) => [`${name} ${item}`, command.summary] as const,
        ),
  );
  const width = Math.max(...entries.map(([name]) => name.length));
  return [
    `screen-commons ${version}: manage a Screen Commons catalog from scripts and agents. Never prompts.\n`,
    "Usage: screen-commons <command> [flags]\n",
    "Commands:",
    ...entries.map(([name, summary]) => `  ${name.padEnd(width)}  ${summary}`),
    "",
    GLOBAL_FLAGS,
    OUTPUT_HELP,
    EXIT_HELP,
  ].join("\n");
}

const GLOBAL_OPTIONS = {
  url: { type: "string" },
  "api-key": { type: "string" },
  help: { type: "boolean", short: "h" },
} satisfies Options;

/** Finds the command words, which may have global flags before or between them. */
function locate(argv: string[]) {
  const rest: string[] = [];
  const path: string[] = [];
  let node: Command | Record<string, Command> | Tree | undefined = COMMANDS;
  let index = 0;
  for (; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--url" || arg === "--api-key") {
      rest.push(arg, argv[(index += 1)] ?? "");
    } else if (arg.startsWith("--url=") || arg.startsWith("--api-key=")) {
      rest.push(arg);
    } else if (arg === "--help" || arg === "-h" || arg === "--version") {
      rest.push(arg);
    } else if (arg.startsWith("-") || !node || isCommand(node as Command)) {
      break;
    } else {
      const child: Command | Record<string, Command> | undefined = (
        node as Record<string, Command | Record<string, Command>>
      )[arg];
      if (!child) {
        throw usage(`Unknown command "${[...path, arg].join(" ")}"; see screen-commons --help`);
      }
      path.push(arg);
      node = child;
    }
  }
  return { path, node, argv: [...rest, ...argv.slice(index)] };
}

function secretsIn(argv: string[]): string[] {
  return argv.flatMap((arg, index) => {
    if (arg === "--api-key") return argv[index + 1] ? [argv[index + 1]!] : [];
    return arg.startsWith("--api-key=") ? [arg.slice("--api-key=".length)] : [];
  });
}

async function main(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const secrets = [...secretsIn(argv), env.SCREEN_COMMONS_API_KEY]
    .map((secret) => secret?.trim())
    .filter((secret): secret is string => Boolean(secret));
  const redact = (value: string) =>
    secrets.reduce((text, secret) => text.replaceAll(secret, "[redacted]"), value);
  const print = (value: unknown) => {
    const text = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
    process.stdout.write(redact(text));
  };

  let origin: string | undefined;
  try {
    const { path, node, argv: rest } = locate(argv);
    if (rest.includes("--version")) {
      print(`${version}\n`);
      return 0;
    }
    const wantsHelp = rest.includes("--help") || rest.includes("-h");
    if (path.length === 0) {
      if (wantsHelp) {
        print(rootHelp());
        return 0;
      }
      throw usage("Missing command; see screen-commons --help");
    }
    if (!isCommand(node as Command)) {
      const group = node as Record<string, Command>;
      if (wantsHelp) {
        print(groupHelp(path[0]!, group));
        return 0;
      }
      throw usage(`${path[0]} needs one of: ${Object.keys(group).join(", ")}`);
    }
    const command = node as Command;
    if (wantsHelp) {
      print(commandHelp(path, command));
      return 0;
    }

    const options: Options = { ...GLOBAL_OPTIONS };
    for (const [name, flag] of Object.entries(command.flags ?? {})) {
      options[name] = {
        type: flag.boolean ? "boolean" : "string",
        ...(flag.multiple ? { multiple: true } : {}),
      };
    }
    let parsed;
    try {
      parsed = parseArgs({ args: rest, options, allowPositionals: true, strict: true });
    } catch (error) {
      throw usage(`${(error as Error).message.split("\n")[0]}`);
    }
    const { values, positionals } = parsed;
    const required = command.args?.length ?? 0;
    const allowed = command.optionalArgs ? Infinity : required;
    if (positionals.length < required || positionals.length > allowed) {
      throw usage(
        `Usage: screen-commons ${path.join(" ")} ${(command.args ?? []).map((arg) => `<${arg}>`).join(" ")}`.trim(),
      );
    }

    let instance;
    try {
      instance = resolveInstance(
        { url: values.url as string | undefined, apiKey: values["api-key"] as string | undefined },
        env,
      );
    } catch (error) {
      throw usage((error as Error).message);
    }
    if (instance.apiKey) secrets.push(instance.apiKey);
    origin = instance.url;
    const doFetch = retryingFetch();
    const headers = { "x-screen-commons-client": `screen-commons-cli/${version}` };
    const anonymousClient = () =>
      createScreenCommonsClient({ baseUrl: instance.url, fetch: doFetch, headers });
    const context: Context = {
      values: values as Values,
      positionals,
      origin: instance.url,
      apiKey: instance.apiKey,
      download: doFetch,
      anonymousClient,
      client: () => {
        if (!instance.apiKey) {
          throw new CodedError(
            "missing_api_key",
            `Set SCREEN_COMMONS_API_KEY or pass --api-key. Create a key at ${instance.url}/settings`,
          );
        }
        return createScreenCommonsClient({
          baseUrl: instance.url,
          apiKey: instance.apiKey,
          fetch: doFetch,
          headers,
        });
      },
    };
    print(await command.run(context));
    return 0;
  } catch (error) {
    if (error instanceof PartialFailure) print(error.report);
    const { code, message } = errorInfo(error, origin);
    process.stderr.write(redact(`${code}: ${message.replace(/\s*\n\s*/gu, " ")}\n`));
    return EXIT_CODES[code] ?? 1;
  }
}

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  // A reader such as `head` that has seen enough isn't a failure.
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

// Set rather than exiting, so a large report on a pipe still flushes.
process.exitCode = await main(process.argv.slice(2));
