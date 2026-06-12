import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { streamSpec as streamSpecCore } from "mountly-json-render/server";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The catalog lives in `catalog.ts`. On Node >= 23.6 type-stripping is native,
 * so we import the `.ts` directly (works on the host, no native deps). On older
 * runtimes we fall back to transpiling with esbuild.
 */
async function loadCatalog() {
  const tsUrl = pathToFileURL(join(__dirname, "catalog.ts")).href;
  try {
    const mod = await import(tsUrl);
    if (mod?.catalog) return mod.catalog;
  } catch {
    // fall through to esbuild
  }
  const { build } = await import("esbuild");
  const dir = await mkdtemp(join(tmpdir(), "mountly-gen-catalog-"));
  const out = join(dir, "catalog.mjs");
  try {
    await build({
      entryPoints: [join(__dirname, "catalog.ts")],
      outfile: out,
      bundle: true,
      format: "esm",
      platform: "node",
      packages: "external",
      logLevel: "error",
    });
    return (await import(pathToFileURL(out).href)).catalog;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Resolve a language model across providers. Switch with GEN_PROVIDER
 * (ollama | google | groq | mistral) and GEN_MODEL. Providers are lazy-imported
 * so you only need the package for the one you use. Hosted keys come from env.
 */
async function resolveModel(opts) {
  const provider = opts.provider ?? process.env.GEN_PROVIDER ?? "ollama";
  const pick = (fallback) => opts.model ?? process.env.GEN_MODEL ?? fallback;

  if (provider === "google") {
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    const id = pick("gemini-2.5-flash");
    const google = createGoogleGenerativeAI({
      apiKey:
        process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
    return { model: google(id), label: `google:${id}` };
  }
  if (provider === "groq") {
    const { createGroq } = await import("@ai-sdk/groq");
    const id = pick("llama-3.3-70b-versatile");
    return { model: createGroq({ apiKey: process.env.GROQ_API_KEY })(id), label: `groq:${id}` };
  }
  if (provider === "mistral") {
    const { createMistral } = await import("@ai-sdk/mistral");
    const id = pick("mistral-large-latest");
    return { model: createMistral({ apiKey: process.env.MISTRAL_API_KEY })(id), label: `mistral:${id}` };
  }
  const { createOllama } = await import("ai-sdk-ollama");
  const id = opts.model ?? process.env.OLLAMA_MODEL ?? "granite4.1:3b";
  const baseURL =
    opts.baseURL ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  return { model: createOllama({ baseURL })(id), label: `ollama:${id}` };
}

/**
 * Stream a spec for a prompt — the one entry point. The example owns
 * model/provider selection and catalog loading; the json-render pipeline
 * (prompt → patches → spec → repair) lives in `mountly-json-render/server`.
 *
 * Returns the `SpecStream` handle (spread) plus the resolved model `label`:
 * `await .result` for the final spec, or iterate `.partialSpecStream` to watch
 * it build live.
 */
export async function createSpec(prompt, opts = {}) {
  const catalog = await loadCatalog();
  const { model, label } = await resolveModel(opts);
  const stream = streamSpecCore({
    catalog,
    model,
    prompt,
    temperature: opts.temperature,
  });
  // Attach the model label without spreading (which would eagerly read getters).
  return Object.assign(stream, { model: label });
}
