/** Checking a value against the JSON Schema subset a build derives from TypeScript. */

export type Schema = Record<string, unknown>;

/**
 * An attribute arrives as text when the model wrote HTML: `limit="5"`. Read it
 * the way the element will before checking it against the schema.
 */
export function coerce(value: unknown, schema: Schema): unknown {
  if (typeof value !== "string") return value;
  const type = schema.type;
  if (type === "number" || type === "integer") {
    return value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : value;
  }
  if (type === "boolean")
    return value === "" || value === "true" ? true : value === "false" ? false : value;
  if (type === "object" || type === "array") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function typeOf(value: unknown): string {
  return Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
}

/**
 * The JSON Schema subset a build derives from TypeScript: type, const, enum,
 * anyOf, numeric and length bounds, pattern, items, properties, required and
 * additionalProperties. Unknown keywords are ignored rather than failed.
 */
export function problems(value: unknown, schema: Schema, at = ""): string[] {
  const where = at ? `${at} ` : "";
  if (Array.isArray(schema.anyOf)) {
    return (schema.anyOf as Schema[]).some((option) => !problems(value, option).length)
      ? []
      : [`${where}matches none of its allowed shapes`];
  }
  if ("const" in schema && value !== schema.const) {
    return [`${where}must be ${JSON.stringify(schema.const)}`];
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return [`${where}is not one of ${schema.enum.join("|")}`];
  }
  const type = schema.type as string | undefined;
  const actual = typeOf(value);
  if (type && !(type === actual || (type === "integer" && Number.isInteger(value)))) {
    return [
      `${where}must be ${type === "object" || type === "array" ? `an ${type}` : `a ${type}`}, got ${JSON.stringify(value)}`,
    ];
  }
  const out: string[] = [];
  const bound = (key: string, ok: (limit: number) => boolean, text: string) => {
    if (typeof schema[key] === "number" && !ok(schema[key] as number)) {
      out.push(`${where}${text} ${schema[key]}`);
    }
  };
  if (typeof value === "number") {
    bound("minimum", (n) => value >= n, "must be at least");
    bound("maximum", (n) => value <= n, "must be at most");
  }
  if (typeof value === "string") {
    bound("minLength", (n) => value.length >= n, "must be at least this long:");
    bound("maxLength", (n) => value.length <= n, "must be at most this long:");
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      out.push(`${where}must match ${schema.pattern}`);
    }
  }
  if (Array.isArray(value)) {
    bound("minItems", (n) => value.length >= n, "needs at least this many items:");
    bound("maxItems", (n) => value.length <= n, "takes at most this many items:");
    if (schema.items && typeof schema.items === "object") {
      value.forEach((item, index) =>
        out.push(...problems(item, schema.items as Schema, `${at}[${index}]`)),
      );
    }
  }
  if (actual === "object") {
    const object = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    for (const key of (schema.required ?? []) as string[]) {
      if (!(key in object)) out.push(`${where}is missing "${key}"`);
    }
    for (const [key, item] of Object.entries(object)) {
      const property = properties[key];
      if (property) out.push(...problems(item, property, `${at}.${key}`));
      else if (schema.additionalProperties === false) out.push(`${where}has no "${key}"`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        out.push(...problems(item, schema.additionalProperties as Schema, `${at}.${key}`));
      }
    }
  }
  return out;
}
