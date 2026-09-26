/**
 * What a component's source says about itself, for a catalog: the JSDoc on the
 * component and each prop, each prop's type as written and a JSON Schema for
 * it, and the slots it renders. The prop table in `props.ts` says how to wire a
 * prop; this says what it is for.
 */
import { parseAst } from "vite";
import {
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

/** A JSON Schema, as far as the build can derive one from a TypeScript type. */
export type PropSchema = Record<string, unknown>;

export interface ComponentDocs {
  /** The component's JSDoc summary. */
  description?: string;
  /**
   * Per prop: its JSDoc summary, its type as written (`"paid" | "overdue"`), and
   * a JSON Schema derived from that type plus any `@minimum`, `@maximum`,
   * `@minLength`, `@maxLength`, `@pattern` or `@format` tags.
   */
  props: Record<string, { description?: string; type?: string; schema?: PropSchema }>;
  /** `@slot` tags on the component: `@slot - body` or `@slot actions - the buttons`. */
  slots?: Array<{ name: string; description: string }>;
}

interface DocBlock {
  text?: string;
  tags: Array<[name: string, value: string]>;
}

/** The `/** … *\/` block that ends right where `start` begins: its prose and its tags. */
function docBlock(source: string, start: number): DocBlock {
  const match = /\/\*\*((?:[^*]|\*(?!\/))*)\*\/\s*$/.exec(source.slice(0, start));
  if (!match) return { tags: [] };
  const lines = (match[1] ?? "").split("\n").map((line) => line.replace(/^\s*\*? ?/, "").trim());
  // A one-line block can carry its tags inline: `/** How many. @minimum 1 */`.
  const joined = lines.join("\n").replace(/\s+@(?=[a-zA-Z])/g, "\n@");
  const [prose = "", ...rest] = joined.split(/\n(?=@)/);
  const tags = rest.map((tag): [string, string] => {
    const [, name = "", value = ""] = /^@(\w+)\s*([\s\S]*)$/.exec(tag.trim()) ?? [];
    return [name, value.replace(/\s+/g, " ").trim()];
  });
  const text = prose.trim();
  return { ...(text ? { text } : {}), tags };
}

const NUMERIC_TAGS = ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"];

/** JSON Schema keywords a prop's JSDoc tags add to its type. */
function constraints(tags: DocBlock["tags"]): PropSchema {
  const out: PropSchema = {};
  for (const [name, value] of tags) {
    if (NUMERIC_TAGS.includes(name) && value !== "" && Number.isFinite(Number(value))) {
      out[name] = Number(value);
    }
    if (name === "pattern" || name === "format") out[name] = value;
  }
  return out;
}

/**
 * A JSON Schema for a TypeScript type node: primitives, literal unions as
 * enums, arrays, `Record`, object literals and local interfaces with their
 * required keys. Anything it cannot see into becomes `{}` — any value — rather
 * than a guess that would reject a valid one.
 */
function schemaOf(
  type: Node | undefined,
  types: Map<string, Node>,
  source: string,
  depth = 0,
): PropSchema {
  if (!type || depth > 6) return {};
  switch (type.type) {
    case "TSStringKeyword":
      return { type: "string" };
    case "TSNumberKeyword":
      return { type: "number" };
    case "TSBooleanKeyword":
      return { type: "boolean" };
    case "TSNullKeyword":
      return { type: "null" };
    case "TSLiteralType": {
      const value = type.literal?.value;
      return value === undefined ? {} : { const: value };
    }
    case "TSArrayType":
      return { type: "array", items: schemaOf(type.elementType, types, source, depth + 1) };
    case "TSParenthesizedType":
      return schemaOf(type.typeAnnotation, types, source, depth);
    case "TSUnionType": {
      const parts = type.types.filter(
        (t: Node) => t.type !== "TSUndefinedKeyword" && t.type !== "TSNullKeyword",
      );
      if (parts.length === 1) return schemaOf(parts[0], types, source, depth);
      const values = parts.map((t: Node) => t.literal?.value);
      if (
        parts.every((t: Node) => t.type === "TSLiteralType") &&
        values.every((v: unknown) => v !== undefined)
      ) {
        const kinds = new Set(values.map((v: unknown) => typeof v));
        return kinds.size === 1 ? { type: [...kinds][0], enum: values } : { enum: values };
      }
      return { anyOf: parts.map((t: Node) => schemaOf(t, types, source, depth + 1)) };
    }
    case "TSTypeLiteral":
    case "TSInterfaceDeclaration":
    case "TSIntersectionType":
      return objectSchema(membersOf(type, types), types, source, depth);
    case "TSTypeReference": {
      const name = type.typeName?.name;
      const args = type.typeArguments?.params ?? [];
      if ((name === "Array" || name === "ReadonlyArray") && args[0]) {
        return { type: "array", items: schemaOf(args[0], types, source, depth + 1) };
      }
      if (name === "Record" && args[1]) {
        return {
          type: "object",
          additionalProperties: schemaOf(args[1], types, source, depth + 1),
        };
      }
      const local = types.get(name);
      if (!local) return {};
      return local.type === "TSInterfaceDeclaration"
        ? objectSchema(membersOf(local, types), types, source, depth)
        : schemaOf(local, types, source, depth + 1);
    }
    default:
      return {};
  }
}

function objectSchema(
  members: Node[] | null,
  types: Map<string, Node>,
  source: string,
  depth: number,
): PropSchema {
  if (!members) return { type: "object" };
  const properties: Record<string, PropSchema> = {};
  const required: string[] = [];
  for (const member of members) {
    if (member.type !== "TSPropertySignature") continue;
    const name = keyOf(member);
    if (!name) continue;
    const doc = docBlock(source, member.start);
    properties[name] = {
      ...schemaOf(member.typeAnnotation?.typeAnnotation, types, source, depth + 1),
      ...constraints(doc.tags),
      ...(doc.text ? { description: doc.text } : {}),
    };
    if (!member.optional) required.push(name);
  }
  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  };
}

/** The body statement that wraps `node`, so a JSDoc sits before the statement. */
function statementOf(body: Node[], node: Node): Node | undefined {
  return body.find((s) => s.start <= node.start && node.start < s.end);
}

/** `<!-- Invoice list -->` immediately before the first `<script` in an SFC. */
function htmlCommentBeforeScript(code: string): string | undefined {
  // No `-->` inside, so an earlier template comment cannot be glued on.
  const match = /<!--((?:(?!-->)[\s\S])*?)-->\s*<script\b/.exec(code);
  const text = match?.[1]?.trim();
  return text || undefined;
}

/**
 * The prose a reader of the component's source would see: the JSDoc on the
 * component and on each prop, and each prop's type as the author wrote it.
 * The prop table says how to wire a prop; this says what it is for, which is
 * what a person browsing a catalog — or a model composing from one — needs.
 *
 * Best effort: anything unreadable is simply absent, never an error.
 */
export function extractDocs(code: string, options: ExtractOptions = {}): ComponentDocs {
  try {
    const file = options.file ?? "component.tsx";
    const sfc = /\.(vue|svelte)$/.exec(file)?.[1];
    const source = sfc ? scriptOf(code) : code;
    const body = parseAst(source, { lang: sfc ? "ts" : "tsx" }).body as unknown as Node[];
    const types = localTypes(body);

    let declared: Node | undefined;
    let description: string | undefined;
    let component: DocBlock = { tags: [] };
    if (sfc === "vue") {
      const call = macroCall(body, "defineProps");
      declared = call?.typeArguments?.params?.[0];
      const statement = call && statementOf(body, call);
      component = statement ? docBlock(source, statement.start) : component;
      description = component.text ?? htmlCommentBeforeScript(code);
    } else if (sfc === "svelte") {
      const declarator = svelteProps(body);
      declared = declarator?.id?.typeAnnotation?.typeAnnotation;
      const statement = declarator && statementOf(body, declarator);
      component = statement ? docBlock(source, statement.start) : component;
      description = component.text ?? htmlCommentBeforeScript(code);
    } else {
      const declaration = findExport(body, options.exportName ?? "default");
      if (declaration) {
        // The comment sits before the statement (`export default function`), not
        // before the function node inside it.
        const statement = statementOf(body, declaration);
        const before = statement ? docBlock(source, statement.start) : { tags: [] };
        component =
          before.text || before.tags.length ? before : docBlock(source, declaration.start);
        description = component.text;
        declared = propsType(declaration);
      }
    }

    const props: ComponentDocs["props"] = {};
    for (const member of membersOf(declared, types) ?? []) {
      const name = keyOf(member);
      if (!name) continue;
      const annotation = member.typeAnnotation?.typeAnnotation;
      const doc = docBlock(source, member.start);
      const type = annotation ? source.slice(annotation.start, annotation.end) : undefined;
      const schema = annotation
        ? { ...schemaOf(annotation, types, source), ...constraints(doc.tags) }
        : undefined;
      props[name] = {
        ...(doc.text ? { description: doc.text } : {}),
        ...(type ? { type } : {}),
        ...(schema && Object.keys(schema).length ? { schema } : {}),
      };
    }
    const slots = component.tags
      .filter(([tag]) => tag === "slot")
      .map(([, value]) => {
        // `@slot - body` is the default slot; `@slot actions - the buttons` a named one.
        const [, name = "", text = ""] =
          /^(?:([A-Za-z][\w-]*)\s*)?-?\s*([\s\S]*)$/.exec(value) ?? [];
        return { name, description: text.trim() };
      });
    return {
      ...(description ? { description } : {}),
      props,
      ...(slots.length ? { slots } : {}),
    };
  } catch {
    return { props: {} };
  }
}
