import { z } from "zod";

export const triggerTypeSchema = z.enum([
  "hover",
  "click",
  "focus",
  "viewport",
  "idle",
  "media",
  "url-change",
  "swipe",
  "longpress",
  "keyboard",
  "programmatic",
]);

export const verticalTypesSchema = z.object({
  /** Root declaration file for the vertical bare specifier. */
  declaration: z.string().min(1).optional(),
  /** Named exports available from the root vertical specifier (`billing`). */
  module: z.array(z.string().min(1)).optional(),
  /** Named exports available from subpath specifiers (`billing/Checkout`). */
  exports: z
    .record(
      z.string(),
      z.union([
        z.array(z.string().min(1)),
        z.object({
          declaration: z.string().min(1).optional(),
          names: z.array(z.string().min(1)).optional(),
        }),
      ]),
    )
    .optional(),
});

export const verticalEntrySchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  team: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
  trigger: triggerTypeSchema.optional(),
  alias: z.string().min(1).optional(),
  /** CDN or directory prefix for relative paths in `exports`. Defaults to the directory of `url`. */
  baseUrl: z.string().min(1).optional(),
  /** Subpath exports for import-map / Vite host imports: `"./Checkout": "./dist/checkout.js"`. */
  exports: z.record(z.string(), z.string()).optional(),
  /** Named export that is already an OnDemandFeature (common in vertical repos). */
  featureExport: z.string().min(1).optional(),
  /** Named export that satisfies FeatureModule when using moduleUrl loading. */
  moduleExport: z.string().min(1).optional(),
  /** Optional type hints used to generate ambient declarations for host-side composition. */
  types: verticalTypesSchema.optional(),
});

export const platformImportsSchema = z.object({
  imports: z
    .record(z.string(), z.string())
    .refine(
      (imports) => Object.keys(imports).length > 0,
      "platform.imports must contain at least one bare-specifier mapping",
    ),
});

export const mountlyManifestSchema = z.object({
  version: z.literal("2"),
  platform: platformImportsSchema,
  verticals: z.array(verticalEntrySchema).min(1),
});

export type TriggerType = z.infer<typeof triggerTypeSchema>;
export type VerticalTypes = z.infer<typeof verticalTypesSchema>;
export type VerticalEntry = z.infer<typeof verticalEntrySchema>;
export type PlatformImports = z.infer<typeof platformImportsSchema>;
export type MountlyManifest = z.infer<typeof mountlyManifestSchema>;

export function parseManifest(input: unknown): MountlyManifest {
  const result = mountlyManifestSchema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`[mountly-manifest] invalid manifest: ${message}`);
  }
  return result.data;
}

/**
 * JSON Schema (draft 2020-12) for a mountly manifest. Point a `$schema` field at the
 * published copy for editor autocomplete + validation, or feed it to any JSON Schema
 * validator. Generated from the zod schema so the two never drift.
 */
export function manifestJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(mountlyManifestSchema, {
    target: "draft-2020-12",
  }) as Record<string, unknown>;
}
