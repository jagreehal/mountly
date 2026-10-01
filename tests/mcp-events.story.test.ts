import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { defineEvents, signWebhook } from "../packages/mcp-apps/src/events/index";

const SECRET = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;
const URL_ = "https://receiver.example.com/cb/1";

/** Fake ChatGPT receiver: echoes challenges, records events, replies with queued statuses. */
function receiver(statuses: number[] = []) {
  const events: { headers: Record<string, string>; body: string }[] = [];
  let verifications = 0;
  const send = (async (_url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    const body = init.body as string;
    const parsed = JSON.parse(body);
    if (parsed.type === "verification") {
      verifications++;
      return Response.json({ challenge: parsed.challenge });
    }
    events.push({ headers, body });
    return new Response(null, { status: statuses.shift() ?? 200 });
  }) as typeof fetch;
  return { fetch: send, events, verifications: () => verifications };
}

const defs = {
  "comment.created": {
    description: "A new review comment.",
    input: z.object({ document_id: z.string() }),
    payload: z.object({ document_id: z.string(), text: z.string() }),
  },
};

const subscribeParams = (args = { document_id: "doc_1" }) => ({
  name: "comment.created",
  arguments: args,
  delivery: { mode: "webhook", url: URL_, secret: SECRET },
});

describe("mountly-mcp/events", () => {
  it("signs with the Standard Webhooks v1 scheme", ({ task }) => {
    story.init(task, { tags: ["mcp", "events"] });
    story.given("the Standard Webhooks reference test vector");
    expect(
      signWebhook({
        secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
        id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
        timestamp: 1614265330,
        body: '{"test": 2432232314}',
      }),
    ).toBe("v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=");
  });

  it("lists, verifies, subscribes idempotently and delivers signed events", async ({ task }) => {
    story.init(task, { tags: ["mcp", "events"] });
    const r = receiver();
    const events = defineEvents({ events: defs, fetch: r.fetch });

    story.given("events/list advertises webhook delivery and JSON schemas");
    const listed = events.list().events[0];
    expect(listed).toMatchObject({ name: "comment.created", delivery: ["webhook"] });
    expect(listed.inputSchema).toMatchObject({ required: ["document_id"] });

    story.when("ChatGPT subscribes twice with the same identity");
    const a = await events.subscribe(subscribeParams());
    const b = await events.subscribe(subscribeParams());
    expect(b.id).toBe(a.id);
    expect(r.verifications()).toBe(1);

    story.then("emit delivers one signed event to matching subscriptions only");
    await events.subscribe(subscribeParams({ document_id: "doc_2" }));
    const results = await events.emit(
      "comment.created",
      { document_id: "doc_1", text: "hi" },
      (args) => args.document_id === "doc_1",
    );
    expect(results).toEqual([{ subscriptionId: a.id, status: 200, delivered: true }]);
    const [{ headers, body }] = r.events;
    expect(headers["x-mcp-subscription-id"]).toBe(a.id);
    expect(headers["webhook-signature"]).toBe(
      signWebhook({
        secret: SECRET,
        id: headers["webhook-id"],
        timestamp: Number(headers["webhook-timestamp"]),
        body,
      }),
    );
    expect(JSON.parse(body)).toMatchObject({
      name: "comment.created",
      data: { text: "hi" },
      cursor: null,
    });

    story.and("unsubscribe stops delivery");
    await events.unsubscribe({
      name: "comment.created",
      arguments: { document_id: "doc_1" },
      delivery: { mode: "webhook", url: URL_ },
    });
    expect(
      await events.emit(
        "comment.created",
        { document_id: "doc_1", text: "x" },
        (a) => a.document_id === "doc_1",
      ),
    ).toEqual([]);
  });

  it("rejects unsafe callbacks, weak secrets and failed challenges", async ({ task }) => {
    story.init(task, { tags: ["mcp", "events"] });
    const events = defineEvents({ events: defs, fetch: receiver().fetch });
    const p = subscribeParams();
    await expect(
      events.subscribe({ ...p, delivery: { ...p.delivery, url: "http://169.254.169.254/" } }),
    ).rejects.toThrow(/URL not allowed/);
    await expect(
      events.subscribe({ ...p, delivery: { ...p.delivery, secret: "whsec_c2hvcnQ=" } }),
    ).rejects.toThrow(/24–64 bytes/);
    await expect(events.subscribe({ ...p, name: "nope" })).rejects.toMatchObject({ code: -32602 });

    const liar = defineEvents({
      events: defs,
      fetch: (async () => Response.json({ challenge: "wrong" })) as typeof fetch,
    });
    await expect(liar.subscribe(p)).rejects.toThrow(/verification failed/);
  });

  it("re-checks the subscribe-time principal before each delivery", async ({ task }) => {
    story.init(task, { tags: ["mcp", "events"] });
    const revoked = new Set<string>();
    const r = receiver();
    const events = defineEvents({
      events: defs,
      fetch: r.fetch,
      authorize: ({ authInfo }) => !revoked.has((authInfo as { user: string }).user),
    });
    await events.subscribe(subscribeParams(), { authInfo: { user: "alice" } });

    story.when("alice loses access");
    revoked.add("alice");
    expect(await events.emit("comment.created", { document_id: "doc_1", text: "x" })).toEqual([]);
    expect(r.events).toHaveLength(0);
  });

  it("retries transient failures and drops the subscription on 410", async ({ task }) => {
    story.init(task, { tags: ["mcp", "events"] });
    const r = receiver([503, 200, 410]);
    const events = defineEvents({ events: defs, fetch: r.fetch, retryBaseMs: 0 });
    await events.subscribe(subscribeParams());

    const [first] = await events.emit("comment.created", { document_id: "doc_1", text: "a" });
    expect(first).toMatchObject({ status: 200, delivered: true });
    expect(new Set(r.events.map((e) => e.headers["webhook-id"])).size).toBe(1);

    const [gone] = await events.emit("comment.created", { document_id: "doc_1", text: "b" });
    expect(gone).toMatchObject({ status: 410, delivered: false });
    expect(await events.emit("comment.created", { document_id: "doc_1", text: "c" })).toEqual([]);
  });
});
