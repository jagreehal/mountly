/**
 * The prop and event types `embed.d.ts` can carry as the author wrote them.
 * The declaration file is self-contained — a consumer with only the script tag
 * has none of the author's modules — so a written type survives only when
 * every name in it can come along: a global (`Promise`, `HTMLElement`), or a
 * type alias or interface from the component's file or a file it imports
 * relatively, copied in under a name scoped to the element.
 *
 * Anything else — `React.ReactNode`, `typeof x`, a class, an enum, a package
 * import, the component's own type parameter — leaves the prop on its
 * wire-kind type. A miss only loosens a type, so the analysis stays simple.
 */
import { dirname, resolve as resolvePath } from "node:path";
import { parseAst } from "vite";
import {
  eventName,
  findExport,
  keyOf,
  localTypes,
  macroCall,
  membersOf,
  propsType,
  scriptOf,
  svelteProps,
  type ExtractOptions,
  type Node,
} from "./props.js";

export interface EmbedTypes {
  /** Per prop, its type as written, with copied names renamed. */
  props: Record<string, string>;
  /** Per DOM event, the type of its `detail`: the callback's first argument. */
  events: Record<string, string>;
  /** The declarations those types name, to emit beside them. */
  declarations: string[];
}

export interface EmbedTypesOptions extends ExtractOptions {
  /** Prefix for copied declarations, so two elements' `Line` types cannot collide. */
  scope: string;
  /** Read a file an import points at. Absent or `undefined`: imports stay opaque. */
  load?: (file: string) => string | undefined;
}

interface Module {
  file: string;
  source: string;
  body: Node[];
  /** Interfaces and type aliases by name, exported or not. */
  types: Map<string, Node>;
  /** Named imports and re-exports: local name → where it comes from. */
  imports: Map<string, { from: string; name: string }>;
  /** `export { Local as Name }`: exported name → local name. */
  exports: Map<string, string>;
  /** File-level names that cannot be copied: classes, enums, other imports, type parameters. */
  opaque: Set<string>;
}

function parseModule(file: string, code: string): Module {
  const sfc = /\.(vue|svelte)$/.exec(file)?.[1];
  const source = sfc ? scriptOf(code) : code;
  const body = parseAst(source, { lang: sfc ? "ts" : "tsx" }).body as unknown as Node[];
  const mod: Module = {
    file,
    source,
    body,
    types: new Map(),
    imports: new Map(),
    exports: new Map(),
    opaque: new Set(),
  };
  for (const raw of body) {
    const node = raw.declaration ?? raw;
    if (node.type === "TSInterfaceDeclaration" || node.type === "TSTypeAliasDeclaration") {
      // A merged interface has several bodies; copying one would drop members.
      if (mod.types.has(node.id.name) || mod.opaque.has(node.id.name)) {
        mod.types.delete(node.id.name);
        mod.opaque.add(node.id.name);
      } else {
        mod.types.set(node.id.name, node);
      }
    } else if (node.type === "ImportDeclaration" || (raw.source && raw.specifiers)) {
      for (const s of node.specifiers ?? []) {
        if (s.type !== "ImportSpecifier" && s.type !== "ExportSpecifier") {
          mod.opaque.add(s.local.name);
          continue;
        }
        const name = s.imported ?? s.local;
        const local = s.type === "ExportSpecifier" ? s.exported : s.local;
        mod.imports.set(local.name ?? local.value, {
          from: node.source.value,
          name: name.name ?? name.value,
        });
      }
    } else if (raw.type === "ExportNamedDeclaration" && !raw.declaration) {
      for (const s of raw.specifiers) {
        mod.exports.set(s.exported.name ?? s.exported.value, s.local.name ?? s.local.value);
      }
    } else if (node.id?.name) {
      mod.opaque.add(node.id.name);
    }
  }
  // The component's own type parameters mean nothing outside it. A parameter in
  // scope where it is used is allowed by the walk, before this set is consulted.
  const params = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(params);
    if (!node || typeof node !== "object") return;
    const n = node as Node;
    if (n.type === "TSTypeParameter") mod.opaque.add(n.name.name);
    for (const key in n) params(n[key]);
  };
  params(body);
  // `<script setup lang="ts" generic="T extends Item">`, `<script generics="T">`.
  for (const [, list = ""] of code.matchAll(/<script\b[^>]*\bgenerics?="([^"]*)"/g)) {
    for (const part of list.split(",")) mod.opaque.add(part.trim().split(/\s/)[0] ?? "");
  }
  return mod;
}

type Edit = [start: number, end: number, text: string];

function rewrite(source: string, node: Node, edits: Edit[]): string {
  let out = source.slice(node.start, node.end);
  for (const [start, end, text] of [...edits].sort((a, b) => b[0] - a[0])) {
    out = out.slice(0, start - node.start) + text + out.slice(end - node.start);
  }
  return out;
}

/** Names a node brings into scope for its own subtree. */
function introduced(node: Node): string[] {
  const names: string[] = (node.typeParameters?.params ?? []).map((p: Node) => p.name.name);
  if (node.type === "TSMappedType" && node.key?.name) names.push(node.key.name);
  if (node.type === "TSConditionalType") {
    const infer = (n: unknown): void => {
      if (Array.isArray(n)) return n.forEach(infer);
      if (!n || typeof n !== "object") return;
      if ((n as Node).type === "TSInferType") names.push((n as Node).typeParameter.name.name);
      for (const key in n as Node) infer((n as Node)[key]);
    };
    infer(node.extendsType);
  }
  return names;
}

/**
 * A tuple's element type: `[id: string]`, `[string]`, or optional `[string?]`.
 * A rest element (`[...ids: string[]]`) is not one argument, so it has none.
 */
function tupleElement(node: Node | undefined): { type: Node; optional: boolean } | undefined {
  if (!node || node.type === "TSRestType") return undefined;
  if (node.type === "TSNamedTupleMember") {
    if (node.elementType?.type === "TSRestType") return undefined;
    const inner =
      node.elementType?.type === "TSOptionalType"
        ? node.elementType.typeAnnotation
        : node.elementType;
    return { type: inner, optional: Boolean(node.optional) || inner !== node.elementType };
  }
  if (node.type === "TSOptionalType") return { type: node.typeAnnotation, optional: true };
  return { type: node, optional: false };
}

/** TypeScript's built-in utility types, which no runtime has as a value. */
const UTILITY_TYPES = new Set([
  "Array",
  "ArrayLike",
  "AsyncIterable",
  "Awaited",
  "Capitalize",
  "ConstructorParameters",
  "Exclude",
  "Extract",
  "InstanceType",
  "Iterable",
  "Lowercase",
  "NoInfer",
  "NonNullable",
  "Omit",
  "Parameters",
  "Partial",
  "Pick",
  "PromiseLike",
  "PropertyKey",
  "Readonly",
  "ReadonlyArray",
  "ReadonlyMap",
  "ReadonlySet",
  "Record",
  "Required",
  "ReturnType",
  "Uncapitalize",
  "Uppercase",
]);

/** Node globals a browser consumer's types lack. */
const NODE_ONLY = new Set(["Buffer", "process", "global", "require", "module", "exports"]);

/**
 * Whether a consumer's `lib: ["dom", "esnext"]` declares `name`: a utility
 * type, a DOM type, or an ECMAScript or web global (which Node, running the
 * build, also defines).
 */
function isGlobal(name: string): boolean {
  if (UTILITY_TYPES.has(name)) return true;
  if (NODE_ONLY.has(name)) return false;
  if (
    /^(?:HTML|SVG)\w*Element$|^\w*Event(?:Init|Target)?$|^(?:Element|Node|Document|Window|ShadowRoot|DOMRect|FileList|DataTransfer|CSSStyleDeclaration|NodeList)$/.test(
      name,
    )
  ) {
    return true;
  }
  return name in globalThis;
}

/** `T | undefined`, `(T)` → `T`. */
function unwrap(type: Node | undefined): Node | undefined {
  if (type?.type === "TSParenthesizedType") return unwrap(type.typeAnnotation);
  if (type?.type !== "TSUnionType") return type;
  const real = type.types.filter(
    (t: Node) => t.type !== "TSUndefinedKeyword" && t.type !== "TSNullKeyword",
  );
  return real.length === 1 ? unwrap(real[0]) : type;
}

const CANDIDATES = ["", ".ts", ".tsx", ".d.ts", "/index.ts", "/index.tsx"];

export function embedTypes(code: string, options: EmbedTypesOptions): EmbedTypes {
  const result: EmbedTypes = { props: {}, events: {}, declarations: [] };
  const named = new Map<Node, string>();
  const taken = new Set<string>();
  const modules = new Map<string, Module | null>();

  const load = (file: string): Module | null => {
    if (!modules.has(file)) {
      let mod: Module | null = null;
      try {
        const text = options.load?.(file);
        if (text !== undefined) mod = parseModule(file, text);
      } catch {}
      modules.set(file, mod);
    }
    return modules.get(file) ?? null;
  };

  /** The declaration a name refers to, `null` when it cannot come along, `undefined` for a global. */
  const resolve = (
    mod: Module,
    name: string,
    depth = 0,
  ): { decl: Node; mod: Module } | null | undefined => {
    const decl = mod.types.get(name);
    if (decl) return { decl, mod };
    if (mod.opaque.has(name) || depth > 8) return null;
    const imp = mod.imports.get(name);
    // A name the consumer may not have (a type inside the component function, the
    // author's own ambient global) leaves the prop on its wire type instead.
    if (!imp) return isGlobal(name) ? undefined : null;
    if (!imp.from.startsWith(".")) return null;
    const base = resolvePath(dirname(mod.file), imp.from.replace(/\.[cm]?js$/, ""));
    for (const ext of CANDIDATES) {
      const other = load(base + ext);
      if (other) return resolve(other, other.exports.get(imp.name) ?? imp.name, depth + 1) ?? null;
    }
    return null;
  };

  /** The copied declaration's name, or `undefined` if it names something that cannot come along. */
  const emit = (decl: Node, mod: Module): string | undefined => {
    const existing = named.get(decl);
    if (existing) return existing;
    let as = `${options.scope}_${decl.id.name}`;
    for (let n = 2; taken.has(as); n++) as = `${options.scope}_${decl.id.name}${n}`;
    // Named before the walk, so a recursive type refers to itself.
    named.set(decl, as);
    taken.add(as);
    const edits: Edit[] = [[decl.id.start, decl.id.end, as]];
    if (!walk(decl, mod, new Set(), edits)) return undefined;
    result.declarations.push(`export ${rewrite(mod.source, decl, edits)}`);
    return as;
  };

  const walk = (node: unknown, mod: Module, scope: Set<string>, edits: Edit[]): boolean => {
    if (Array.isArray(node)) return node.every((n) => walk(n, mod, scope, edits));
    if (!node || typeof node !== "object") return true;
    const n = node as Node;
    if (
      n.type === "TSTypeQuery" ||
      n.type === "TSImportType" ||
      n.type === "TSQualifiedName" ||
      n.type === "MemberExpression" ||
      (n.computed && n.key?.type !== "Literal")
    ) {
      return false;
    }
    const own = introduced(n);
    const inner = own.length ? new Set([...scope, ...own]) : scope;
    const ref =
      n.type === "TSTypeReference"
        ? n.typeName
        : n.type === "TSInterfaceHeritage"
          ? n.expression
          : null;
    if (ref?.type === "Identifier" && !inner.has(ref.name)) {
      const target = resolve(mod, ref.name);
      if (target === null) return false;
      if (target) {
        const as = emit(target.decl, target.mod);
        if (!as) return false;
        edits.push([ref.start, ref.end, as]);
      }
    }
    for (const key in n) if (!walk(n[key], mod, inner, edits)) return false;
    return true;
  };

  /** The text of a type node, or `undefined` — leaving nothing half-emitted behind. */
  const typed = (node: Node | undefined, mod: Module): string | undefined => {
    if (!node) return undefined;
    const mark = result.declarations.length;
    const before = new Map(named);
    const edits: Edit[] = [];
    if (walk(node, mod, new Set(), edits)) return rewrite(mod.source, node, edits);
    result.declarations.length = mark;
    named.clear();
    taken.clear();
    for (const [decl, as] of before) {
      named.set(decl, as);
      taken.add(as);
    }
    return undefined;
  };

  /** The first parameter of a callback: what the element sends as `detail`. */
  const detail = (params: Node[] | undefined, mod: Module, skip = 0): string | undefined => {
    const param = params?.[skip];
    if (!param || param.type === "RestElement") return undefined;
    const text = typed(param.typeAnnotation?.typeAnnotation, mod);
    return text && param.optional ? `${text} | null` : text;
  };

  try {
    const file = options.file ?? "component.tsx";
    const mod = parseModule(file, code);
    modules.set(file, mod);
    const aliases = localTypes(mod.body);
    const sfc = /\.(vue|svelte)$/.exec(file)?.[1];

    let declared: Node | undefined;
    if (sfc === "vue") declared = macroCall(mod.body, "defineProps")?.typeArguments?.params?.[0];
    else if (sfc === "svelte") declared = svelteProps(mod.body)?.id?.typeAnnotation?.typeAnnotation;
    else {
      const declaration = findExport(mod.body, options.exportName ?? "default");
      declared = declaration ? propsType(declaration) : undefined;
    }

    for (const member of membersOf(declared, aliases) ?? []) {
      const name = keyOf(member);
      if (!name) continue;
      if (/^on[A-Z]/.test(name)) {
        const fn =
          member.type === "TSMethodSignature"
            ? member
            : unwrap(member.typeAnnotation?.typeAnnotation);
        if (fn?.type !== "TSFunctionType" && fn?.type !== "TSMethodSignature") continue;
        // `<T>(item: T) => void` has no detail type outside the call.
        if (fn.typeParameters) continue;
        const text = detail(fn.params, mod);
        if (text) result.events[eventName(name)] = text;
        continue;
      }
      if (member.type !== "TSPropertySignature") continue;
      const text = typed(member.typeAnnotation?.typeAnnotation, mod);
      if (text) result.props[name] = text;
    }

    if (sfc === "vue") {
      const emits = macroCall(mod.body, "defineEmits")?.typeArguments?.params?.[0];
      for (const member of membersOf(emits, aliases) ?? []) {
        // `{ 'view-details': [id: string] }`
        if (member.type === "TSPropertySignature") {
          const event = keyOf(member);
          const tuple = member.typeAnnotation?.typeAnnotation;
          const first = tuple?.type === "TSTupleType" ? tuple.elementTypes[0] : undefined;
          const element = tupleElement(first);
          const text = element && typed(element.type, mod);
          if (event && text) result.events[event] = element.optional ? `${text} | null` : text;
        }
        // `{ (e: 'view-details', id: string): void }`
        if (member.type === "TSCallSignatureDeclaration") {
          const event = member.params?.[0]?.typeAnnotation?.typeAnnotation?.literal?.value;
          const text = detail(member.params, mod, 1);
          if (typeof event === "string" && text) result.events[event] = text;
        }
      }
    }
  } catch {}
  return result;
}
