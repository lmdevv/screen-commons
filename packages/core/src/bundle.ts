import { z } from "zod";

import { IMAGE_EXTENSIONS, type StoredImageType } from "./image-policy";
import {
  appRefSchema,
  flowTypeSchema,
  sourceSchema,
  statusSchema,
  type Screen,
  type Status,
} from "./schemas";

export const bundleWarningSchema = z.enum(["pending_content", "rejected_content"]);
export type BundleWarning = z.infer<typeof bundleWarningSchema>;

const bundleAppSchema = appRefSchema.pick({ id: true, slug: true, name: true, platform: true });

export const bundleStepSchema = z.object({
  id: z.string().min(1),
  position: z.number().int().min(0),
  label: z.string().nullable(),
  title: z.string().nullable(),
  catalogUrl: z.url(),
  imageUrl: z.url(),
  localPath: z.string().regex(/^images\/\d+-[\w-]+\.(?:png|jpg|webp)$/u),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sourceUrl: z.string().nullable(),
  capturedAt: z.string(),
  app: bundleAppSchema,
  contributor: z.object({ owned: z.boolean(), source: sourceSchema }),
  status: statusSchema,
  warnings: z.array(bundleWarningSchema),
});
export type BundleStep = z.infer<typeof bundleStepSchema>;

export const referenceBundleSchema = z.object({
  version: z.literal(1),
  instance: z.url(),
  retrievedAt: z.iso.datetime(),
  flow: z
    .object({
      id: z.string().min(1),
      name: z.string(),
      type: flowTypeSchema.nullable(),
      catalogUrl: z.url(),
      app: bundleAppSchema,
      status: statusSchema,
      warnings: z.array(bundleWarningSchema),
    })
    .nullable(),
  steps: z.array(bundleStepSchema),
});
export type ReferenceBundle = z.infer<typeof referenceBundleSchema>;

export const bundleImagePath = (position: number, screenId: string, type: StoredImageType) =>
  `images/${String(position).padStart(2, "0")}-${screenId}.${IMAGE_EXTENSIONS[type]}`;

export const statusWarnings = (status: Status): BundleWarning[] =>
  status === "published" ? [] : [`${status}_content`];

export const bundleApp = (app: Screen["app"]) => ({
  id: app.id,
  slug: app.slug,
  name: app.name,
  platform: app.platform,
});

export const bundleSubject = (bundle: { flow: { id: string } | null; steps: { id: string }[] }) =>
  bundle.flow
    ? `flow ${bundle.flow.id}`
    : `screens ${bundle.steps.map((step) => step.id).join(" ")}`;

const oneLine = (text: string) => text.replace(/\s+/gu, " ");
const inline = (text: string) => oneLine(text).replace(/([\\`*_[\]<>#|])/gu, "\\$1");

const WARNING_TEXT: Record<BundleWarning, string> = {
  pending_content: "Pending review. Only its contributor and admins can see it, and it may change.",
  rejected_content: "Rejected in review. Only its contributor and admins can see it.",
};

const warningLines = (warnings: BundleWarning[]) =>
  warnings.map((warning) => `> **${warning}**. ${WARNING_TEXT[warning]}`);

export function referenceMarkdown(bundle: ReferenceBundle): string {
  const { flow } = bundle;
  const heading = flow
    ? `# ${inline(flow.name)} (${inline(flow.app.name)})`
    : `# ${bundle.steps.length} screens`;
  const intro = flow
    ? [
        `Flow [${flow.id}](${flow.catalogUrl}), ${flow.status}, ${bundle.steps.length} steps. Retrieved ${bundle.retrievedAt} from ${bundle.instance}.`,
      ]
    : [`Retrieved ${bundle.retrievedAt} from ${bundle.instance}.`];
  const steps = bundle.steps.flatMap((step) => {
    const name = step.label ?? step.title ?? step.id;
    return [
      `## ${step.position}. ${inline(name)}`,
      "",
      ...(step.warnings.length ? [...warningLines(step.warnings), ""] : []),
      `![${inline(step.title ?? name)}](${step.localPath})`,
      "",
      `- Screen: [${step.id}](${step.catalogUrl})${step.title ? `, ${inline(step.title)}` : ""}`,
      `- App: ${inline(step.app.name)} (${step.app.slug}, ${step.app.platform})`,
      `- Image: ${step.imageUrl}, ${step.width}x${step.height}, sha256 ${step.sha256}`,
      `- Source URL: ${step.sourceUrl ? oneLine(step.sourceUrl) : "none recorded"}`,
      `- Captured: ${oneLine(step.capturedAt)}`,
      "",
    ];
  });
  return [
    heading,
    "",
    ...intro,
    "",
    ...(flow?.warnings.length ? [...warningLines(flow.warnings), ""] : []),
    ...steps,
  ].join("\n");
}
