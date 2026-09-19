import { z } from "zod";

export const entityIdSchema = z.uuidv4();

export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase kebab-case slug");

export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const isoDateSchema = z.iso.date();
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, "Expected a SHA-256 hex digest");
export const perceptualHashSchema = z
  .string()
  .regex(/^[a-f0-9]{16,64}$/i, "Expected a perceptual hash hex digest");

export const urlSchema = z.url({ protocol: /^https?$/ });
export const nullableUrlSchema = urlSchema.nullable();

export const paginationSchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

export type EntityId = z.infer<typeof entityIdSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
