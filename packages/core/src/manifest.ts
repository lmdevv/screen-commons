import { z } from "zod";

import { LIMITS } from "./limits";
import {
  appInputSchema,
  createFlowInputSchema,
  elementSchema,
  patternSchema,
  screenMetaSchema,
} from "./schemas";

const localId = z.string().trim().min(1).max(80);

const manifestScreenSchema = z.strictObject({
  localId,
  source: z.union([
    z.strictObject({ file: z.string().min(1) }),
    z.strictObject({ url: z.url({ protocol: /^https$/u }) }),
  ]),
  title: screenMetaSchema.shape.title,
  sourceUrl: screenMetaSchema.shape.sourceUrl,
  patterns: z.array(patternSchema).max(8),
  elements: z.array(elementSchema).max(24),
  tags: screenMetaSchema.shape.tags.removeDefault().optional(),
  capturedAt: z.iso.datetime({ offset: true }).optional(),
});
export type ManifestScreen = z.output<typeof manifestScreenSchema>;

const manifestFlowSchema = z.strictObject({
  localId,
  name: createFlowInputSchema.shape.name,
  type: createFlowInputSchema.shape.type,
  description: createFlowInputSchema.shape.description,
  steps: z
    .array(
      z.strictObject({
        screen: localId,
        label: z.string().trim().max(80).optional(),
      }),
    )
    .min(2)
    .max(LIMITS.maxFlowSteps),
});
export type ManifestFlow = z.output<typeof manifestFlowSchema>;

/**
 * A portable description of a multi-screen transfer. `id` names the transfer, not its content, so
 * publishing an edited manifest under the same id updates what the previous one created.
 */
export const captureManifestSchema = z
  .strictObject({
    version: z.literal(1),
    id: z.string().trim().min(1).max(200),
    app: appInputSchema,
    screens: z.array(manifestScreenSchema).min(1),
    flows: z.array(manifestFlowSchema).default([]),
  })
  .superRefine((manifest, context) => {
    const unique = (items: { localId: string }[], kind: "screens" | "flows") => {
      const seen = new Set<string>();
      for (const [index, item] of items.entries()) {
        if (seen.has(item.localId)) {
          context.addIssue({
            code: "custom",
            path: [kind, index, "localId"],
            message: `Duplicate localId "${item.localId}"`,
          });
        }
        seen.add(item.localId);
      }
      return seen;
    };
    const screens = unique(manifest.screens, "screens");
    unique(manifest.flows, "flows");
    for (const [flowIndex, flow] of manifest.flows.entries()) {
      for (const [stepIndex, step] of flow.steps.entries()) {
        if (!screens.has(step.screen)) {
          context.addIssue({
            code: "custom",
            path: ["flows", flowIndex, "steps", stepIndex, "screen"],
            message: `No screen has localId "${step.screen}"`,
          });
        }
      }
    }
  });
export type CaptureManifest = z.output<typeof captureManifestSchema>;
export type CaptureManifestInput = z.input<typeof captureManifestSchema>;
