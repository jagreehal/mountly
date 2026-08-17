/** Keep generated JavaScript from terminating the inline script that owns it. */
export function escapeInlineScript(value: string): string {
  return value.replace(/<\/script/gi, "<\\/script");
}

/** Serialize a value so no HTML tag can begin inside an inline script. */
export function serializeInlineScriptValue(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
