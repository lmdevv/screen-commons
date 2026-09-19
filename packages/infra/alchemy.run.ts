import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import "varlock/auto-load";

export const db = Cloudflare.D1.Database("database", {
  migrations: "../../packages/db/src/migrations",
});

export const assets = Cloudflare.R2.Bucket("assets", {
  publicAccess: false,
});

export type SubmissionWorkflowParams = {
  submissionId: string;
  correlationId: string;
};

export const submissionWorkflow = Cloudflare.Workflows.Workflow<SubmissionWorkflowParams>(
  "submission-workflow",
  { className: "SubmissionWorkflow" },
);

export const web = Cloudflare.Website.Vite("web", {
  rootDir: "../../apps/web",
  compatibility: {
    flags: ["nodejs_compat"],
  },
  env: {
    DB: db,
    ASSETS: assets,
    SUBMISSION_WORKFLOW: submissionWorkflow,
    CORS_ORIGIN: Cloudflare.Worker.URL,
    CLERK_SECRET_KEY: Config.Redacted("CLERK_SECRET_KEY"),
    VITE_CLERK_PUBLISHABLE_KEY: Config.String("VITE_CLERK_PUBLISHABLE_KEY"),
    MEDIA_SIGNING_KEY: Config.Redacted("MEDIA_SIGNING_KEY"),
    OPENAI_API_KEY: Config.Redacted("OPENAI_API_KEY"),
    POSTHOG_API_KEY: Config.Redacted("POSTHOG_API_KEY"),
    POSTHOG_HOST: Config.String("POSTHOG_HOST").pipe(
      Config.withDefault("https://us.i.posthog.com"),
    ),
  },
  dev: {
    port: 3001,
  },
});

export type WebEnv = Cloudflare.InferEnv<typeof web>;

export default Alchemy.Stack(
  "open-ui",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const assetsBucket = yield* assets;
    const webWorker = yield* web;

    return {
      web: webWorker.url,
      assets: assetsBucket.bucketName,
    };
  }),
);
