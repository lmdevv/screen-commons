/**
 * Vite-only stand-in so the application shell can run outside workerd.
 * Alchemy production builds externalize `cloudflare:workers` and use the real class.
 */
export class WorkflowEntrypoint<Environment, Params> {
  protected readonly ctx: ExecutionContext;
  protected readonly env: Environment;
  declare protected readonly workflowParamsType: Params;

  constructor(ctx: ExecutionContext, env: Environment) {
    this.ctx = ctx;
    this.env = env;
  }

  run(_event: unknown, _step: unknown): Promise<unknown> {
    throw new Error("Cloudflare Workflows execute only in the workerd runtime.");
  }
}
