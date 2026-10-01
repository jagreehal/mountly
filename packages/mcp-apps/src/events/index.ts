/**
 * MCP Events over webhooks (protocol `2026-07-28`), the delivery mode ChatGPT uses.
 *
 * Wire `list`, `subscribe` and `unsubscribe` into any MCP 2.0 server as `events/*`
 * request handlers, then call `emit` when something changes. This entry tracks the
 * draft spec and stays experimental until the spec settles.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

type MaybePromise<T> = T | Promise<T>;

export interface EventDefinition<I extends z.ZodType = z.ZodType, P extends z.ZodType = z.ZodType> {
  description?: string;
  /** Subscription arguments (e.g. `{ document_id }`). */
  input: I;
  /** Event `data`. Validated on `emit` when set. */
  payload?: P;
}

export interface EventSubscription {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  url: string;
  secret: string;
  /** Epoch ms. */
  expiresAt: number;
  /** Principal captured at subscribe time; re-checked before every delivery. */
  authInfo?: unknown;
}

/** A `Map` works. Persist across restarts in production (the spec requires it). */
export interface SubscriptionStore {
  get(key: string): MaybePromise<EventSubscription | undefined>;
  set(key: string, subscription: EventSubscription): unknown;
  delete(key: string): unknown;
  values(): MaybePromise<Iterable<EventSubscription>>;
}

export interface AuthorizeRequest {
  name: string;
  arguments: Record<string, unknown>;
  authInfo?: unknown;
}

export interface DefineEventsOptions<E extends Record<string, EventDefinition>> {
  events: E;
  store?: SubscriptionStore;
  /**
   * Called on subscribe/unsubscribe with the caller, and before each delivery with
   * the principal stored at subscribe time. Return `false` to deny; a denied
   * delivery deletes the subscription.
   */
  authorize?: (request: AuthorizeRequest) => MaybePromise<boolean>;
  /** Default: `https:` only. Narrow further to block SSRF to internal hosts. */
  allowCallbackUrl?: (url: URL) => boolean;
  /** Default and maximum subscription lifetime. Default 30 days. */
  maxTtlMs?: number;
  /** Delivery attempts per event. Default 5. */
  maxAttempts?: number;
  /** First retry delay; doubles each attempt. Default 1000. */
  retryBaseMs?: number;
  fetch?: typeof fetch;
}

export interface EmitResult {
  subscriptionId: string;
  status: number;
  delivered: boolean;
}

/** JSON-RPC error; `code` is honoured by the MCP SDK when thrown from a handler. */
export class McpEventsError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = "McpEventsError";
    this.code = code;
  }
}

const INVALID_PARAMS = -32602;
const MAX_BODY_BYTES = 262_144;
const SECRET = /^whsec_([A-Za-z0-9+/]+={0,2})$/;

const SubscribeParams = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).default({}),
  delivery: z.object({ mode: z.literal("webhook"), url: z.string(), secret: z.string() }),
  cursor: z.string().nullish(),
  ttlMs: z.number().int().positive().nullish(),
});

const UnsubscribeParams = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).default({}),
  delivery: z.object({ mode: z.literal("webhook"), url: z.string() }),
});

/** Standard Webhooks `v1` signature (what ChatGPT verifies). */
export function signWebhook(input: {
  secret: string;
  id: string;
  timestamp: number;
  body: string;
}): string {
  const key = Buffer.from(input.secret.replace(/^whsec_/, ""), "base64");
  const mac = createHmac("sha256", key).update(`${input.id}.${input.timestamp}.${input.body}`);
  return `v1,${mac.digest("base64")}`;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function parse<S extends z.ZodType>(schema: S, value: unknown, what: string): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new McpEventsError(INVALID_PARAMS, `Invalid ${what}: ${z.prettifyError(result.error)}`);
  return result.data;
}

const id = (prefix: string) => `${prefix}_${randomBytes(12).toString("hex")}`;

const keyOf = (name: string, args: unknown, url: string) => `${name}\n${canonical(args)}\n${url}`;

export function defineEvents<E extends Record<string, EventDefinition>>(
  options: DefineEventsOptions<E>,
) {
  const {
    events,
    store = new Map<string, EventSubscription>(),
    authorize,
    allowCallbackUrl = (url) => url.protocol === "https:",
    maxTtlMs = 30 * 24 * 60 * 60 * 1000,
    maxAttempts = 5,
    retryBaseMs = 1000,
    fetch: fetchFn = fetch,
  } = options;

  function definition(name: string): EventDefinition {
    const def = Object.prototype.hasOwnProperty.call(events, name) ? events[name] : undefined;
    if (!def) throw new McpEventsError(INVALID_PARAMS, `Unknown event: ${name}`);
    return def;
  }

  async function allowed(request: AuthorizeRequest) {
    return !authorize || (await authorize(request));
  }

  function post(sub: EventSubscription, webhookId: string, body: string) {
    const timestamp = Math.floor(Date.now() / 1000);
    return fetchFn(sub.url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "content-type": "application/json",
        "webhook-id": webhookId,
        "webhook-timestamp": String(timestamp),
        "webhook-signature": signWebhook({ secret: sub.secret, id: webhookId, timestamp, body }),
        "x-mcp-subscription-id": sub.id,
      },
      body,
    });
  }

  async function verify(sub: EventSubscription) {
    const challenge = randomBytes(32).toString("base64url");
    const res = await post(
      sub,
      id("msg_verification"),
      JSON.stringify({ type: "verification", challenge }),
    ).catch(() => undefined);
    const echoed = res?.ok
      ? ((await res.json().catch(() => ({}))) as { challenge?: unknown }).challenge
      : undefined;
    const ok =
      typeof echoed === "string" &&
      echoed.length === challenge.length &&
      timingSafeEqual(Buffer.from(echoed), Buffer.from(challenge));
    if (!ok) throw new McpEventsError(INVALID_PARAMS, "Callback verification failed");
  }

  async function deliver(
    key: string,
    sub: EventSubscription,
    eventId: string,
    body: string,
  ): Promise<EmitResult> {
    let status = 0;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Fresh timestamp + signature per attempt; same event id and body bytes.
      status = (await post(sub, eventId, body).catch(() => undefined))?.status ?? 0;
      if (status >= 200 && status < 300) return { subscriptionId: sub.id, status, delivered: true };
      if (status === 410) await store.delete(key);
      const transient = status === 0 || status === 408 || status === 429 || status >= 500;
      if (!transient) break;
      if (attempt < maxAttempts)
        await new Promise((r) => setTimeout(r, retryBaseMs * 2 ** (attempt - 1)));
    }
    return { subscriptionId: sub.id, status, delivered: false };
  }

  return {
    /** `events/list` result. */
    list() {
      return {
        events: Object.entries(events).map(([name, def]) => ({
          name,
          ...(def.description ? { description: def.description } : {}),
          delivery: ["webhook"],
          inputSchema: z.toJSONSchema(def.input),
          ...(def.payload ? { payloadSchema: z.toJSONSchema(def.payload) } : {}),
        })),
        nextCursor: null,
      };
    },

    /** `events/subscribe`, idempotent per (name, arguments, url). */
    async subscribe(params: unknown, ctx: { authInfo?: unknown } = {}) {
      const p = parse(SubscribeParams, params, "events/subscribe params");
      const args = parse(
        definition(p.name).input,
        p.arguments,
        `arguments for ${p.name}`,
      ) as Record<string, unknown>;

      const url = URL.parse(p.delivery.url);
      if (!url || !allowCallbackUrl(url))
        throw new McpEventsError(INVALID_PARAMS, "Callback URL not allowed");
      const secret = SECRET.exec(p.delivery.secret)?.[1];
      const keyBytes = secret ? Buffer.from(secret, "base64").length : 0;
      if (keyBytes < 24 || keyBytes > 64)
        throw new McpEventsError(INVALID_PARAMS, "Secret must be whsec_ + base64 of 24–64 bytes");
      if (!(await allowed({ name: p.name, arguments: args, authInfo: ctx.authInfo }))) {
        throw new McpEventsError(INVALID_PARAMS, "Not authorized to subscribe");
      }

      const key = keyOf(p.name, args, url.href);
      const existing = await store.get(key);
      const ttl = Math.min(p.ttlMs ?? maxTtlMs, maxTtlMs);
      const sub: EventSubscription = {
        id: existing?.id ?? id("sub"),
        name: p.name,
        arguments: args,
        url: url.href,
        secret: p.delivery.secret,
        expiresAt: Date.now() + ttl,
        authInfo: ctx.authInfo,
      };
      if (existing?.secret !== sub.secret) await verify(sub);
      await store.set(key, sub);
      return {
        id: sub.id,
        refreshBefore: new Date(sub.expiresAt).toISOString(),
        cursor: null,
        truncated: false,
      };
    },

    /** `events/unsubscribe`, idempotent. */
    async unsubscribe(params: unknown, ctx: { authInfo?: unknown } = {}) {
      const p = parse(UnsubscribeParams, params, "events/unsubscribe params");
      const args = parse(
        definition(p.name).input,
        p.arguments,
        `arguments for ${p.name}`,
      ) as Record<string, unknown>;
      if (!(await allowed({ name: p.name, arguments: args, authInfo: ctx.authInfo }))) {
        throw new McpEventsError(INVALID_PARAMS, "Not authorized to unsubscribe");
      }
      const url = URL.parse(p.delivery.url);
      if (url) await store.delete(keyOf(p.name, args, url.href));
      return {};
    },

    /** Deliver one event to every live subscription for `name` whose arguments `match`. */
    async emit<N extends keyof E & string>(
      name: N,
      data: E[N]["payload"] extends z.ZodType ? z.input<E[N]["payload"]> : unknown,
      match: (args: z.output<E[N]["input"]>) => boolean = () => true,
    ): Promise<EmitResult[]> {
      const def = definition(name);
      const payload = def.payload ? parse(def.payload, data, `payload for ${name}`) : data;
      const eventId = id("evt");
      const body = JSON.stringify({
        eventId,
        name,
        timestamp: new Date().toISOString(),
        data: payload,
        cursor: null,
      });
      if (Buffer.byteLength(body) > MAX_BODY_BYTES)
        throw new McpEventsError(INVALID_PARAMS, "Event body exceeds 256 KiB");

      const now = Date.now();
      const deliveries: Promise<EmitResult>[] = [];
      for (const sub of [...(await store.values())]) {
        if (sub.name !== name) continue;
        const key = keyOf(sub.name, sub.arguments, sub.url);
        if (sub.expiresAt <= now) {
          await store.delete(key);
          continue;
        }
        if (!match(sub.arguments as z.output<E[N]["input"]>)) continue;
        if (!(await allowed({ name, arguments: sub.arguments, authInfo: sub.authInfo }))) {
          await store.delete(key);
          continue;
        }
        deliveries.push(deliver(key, sub, eventId, body));
      }
      return Promise.all(deliveries);
    },
  };
}
