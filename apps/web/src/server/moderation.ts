export type NormalizedModerationResult = {
  provider: "openai";
  model: string;
  pipelineVersion: 1;
  flagged: boolean;
  categories: Record<string, boolean>;
  scores: Record<string, number>;
  providerRequestId?: string;
};

export type SuggestedMetadata = {
  provider: "openai";
  model: string;
  pipelineVersion: 1;
  title?: string;
  description?: string;
  tags: string[];
  confidence: number;
  privacyEvidence: string[];
  privacyRisk: boolean;
  usage?: { inputTokens?: number; outputTokens?: number };
};

export class ProviderError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "ProviderError";
    this.retryable = retryable;
  }
}

async function providerRequest<T>(
  apiKey: string,
  path: string,
  body: unknown,
  timeoutMs = 20_000,
): Promise<{ body: T; requestId?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://api.openai.com/v1/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ProviderError(
        `Provider request failed with status ${response.status}`,
        response.status === 408 ||
          response.status === 409 ||
          response.status === 429 ||
          response.status >= 500,
      );
    }
    return {
      body: (await response.json()) as T,
      requestId: response.headers.get("x-request-id") ?? undefined,
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      error instanceof Error ? error.message : "Provider request failed",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

type ModerationResponse = {
  model: string;
  results: Array<{
    flagged: boolean;
    categories: Record<string, boolean>;
    category_scores: Record<string, number>;
  }>;
};

export async function moderateImage(
  apiKey: string,
  imageUrl: string,
): Promise<NormalizedModerationResult> {
  const response = await providerRequest<ModerationResponse>(apiKey, "moderations", {
    model: "omni-moderation-latest",
    input: [{ type: "image_url", image_url: { url: imageUrl } }],
  });
  const result = response.body.results[0];
  if (!result) throw new ProviderError("Moderation provider returned no result", false);
  return {
    provider: "openai",
    model: response.body.model,
    pipelineVersion: 1,
    flagged: result.flagged,
    categories: result.categories,
    scores: result.category_scores,
    providerRequestId: response.requestId,
  };
}

type VisionResponse = {
  model: string;
  output_text?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export async function suggestScreenMetadata(
  apiKey: string,
  imageUrl: string,
): Promise<SuggestedMetadata> {
  const response = await providerRequest<VisionResponse>(apiKey, "responses", {
    model: "gpt-5-mini",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Review this UI screenshot. Return JSON with title, description, tags (max 8), confidence from 0 to 1, privacyRisk (boolean), and privacyEvidence (short array). Flag visible email addresses, phone numbers, home addresses, payment details, credentials, private messages, or identifying account data. Do not repeat personal data in the response.",
          },
          { type: "input_image", image_url: imageUrl },
        ],
      },
    ],
  });
  let parsed: {
    confidence?: number;
    description?: string;
    privacyEvidence?: unknown;
    privacyRisk?: boolean;
    tags?: unknown;
    title?: string;
  } = {};
  try {
    parsed = JSON.parse(response.body.output_text ?? "{}") as typeof parsed;
  } catch {
    throw new ProviderError("Vision provider returned malformed metadata", false);
  }
  return {
    provider: "openai",
    model: response.body.model,
    pipelineVersion: 1,
    title: parsed.title,
    description: parsed.description,
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 8)
      : [],
    confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0)),
    privacyEvidence: Array.isArray(parsed.privacyEvidence)
      ? parsed.privacyEvidence
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.slice(0, 160))
          .slice(0, 8)
      : [],
    privacyRisk: parsed.privacyRisk === true,
    usage: {
      inputTokens: response.body.usage?.input_tokens,
      outputTokens: response.body.usage?.output_tokens,
    },
  };
}
