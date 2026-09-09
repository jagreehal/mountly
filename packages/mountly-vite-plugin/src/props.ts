import { parseAst } from "vite";

/**
 * How an attribute string becomes a prop value. Derived from the component's
 * own TypeScript types, so `currency="GBP"` stays a string and `balance="1250"`
 * becomes a number without either side declaring anything.
 */
export type PropKind = "string" | "number" | "boolean" | "json" | "auto" | "event";

export interface PropSpec {
  /** Prop name the component reads. */
  name: string;
  /** Attribute the consumer writes. Kebab-case of `name`; absent for events. */
  attribute?: string;
  kind: PropKind;
  /** DOM event dispatched for a callback prop. */
  event?: string;
}

export function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** `onViewDetails` → `view-details`. */
export function eventName(prop: string): string {
  return kebab(prop.replace(/^on(?=[A-Z])/, ""));
}

type Node = Record<string, any>;

/** Unwrap `T | undefined` and `T | null`, which say nothing about the wire format. */
function unwrapUnion(type: Node): Node {
  if (type.type !== "TSUnionType") return type;
  const real = type.types.filter(
    (t: Node) =>
      t.type !== "TSUndefinedKeyword" &&
      t.type !== "TSNullKeyword" &&
      !(t.type === "TSLiteralType" && t.literal?.value === null),
  );
  if (real.length === 1) return unwrapUnion(real[0]);
  // A union of string literals is still a string on the wire.
  if (real.length > 1 && real.every((t: Node) => typeof t.literal?.value === "string")) {
    return { type: "TSStringKeyword" };
  }
  return { type: "TSUnknown" };
}

function kindOf(type: Node | undefined, types: Map<string, Node>, seen = 0): PropKind {
  if (!type || seen > 4) return "auto";
  const resolved = unwrapUnion(type);
  // `kind: "card"` is a string attribute, not JSON.
  if (resolved.type === "TSLiteralType") {
    const value = resolved.literal?.value;
    if (typeof value === "string") return "string";
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "boolean";
    return "json";
  }
  switch (resolved.type) {
    case "TSStringKeyword":
      return "string";
    case "TSNumberKeyword":
      return "number";
    case "TSBooleanKeyword":
      return "boolean";
    case "TSFunctionType":
      return "event";
    case "TSTypeReference": {
      // A generic like `Array<T>` or `Record<K, V>` is a container: JSON.
      if (resolved.typeArguments) return "json";
      // `type Currency = string` must coerce as a string, not as JSON.
      const alias = types.get(resolved.typeName?.name);
      if (alias) return kindOf(alias, types, seen + 1);
      // An unresolvable name could be anything. Guessing from the literal is
      // safe; assuming JSON would make `currency="GBP"` throw.
      return "auto";
    }
    default:
      return "json";
  }
}

/** Local `interface`/`type` declarations, so a `Props` reference can be resolved. */
function localTypes(body: Node[]): Map<string, Node> {
  const types = new Map<string, Node>();
  for (const raw of body) {
    const node = raw.type === "ExportNamedDeclaration" && raw.declaration ? raw.declaration : raw;
    if (node.type === "TSInterfaceDeclaration") types.set(node.id.name, node);
    if (node.type === "TSTypeAliasDeclaration") types.set(node.id.name, node.typeAnnotation);
  }
  return types;
}

/** The members of a type literal, an interface (with its bases), or a reference. */
function membersOf(type: Node | undefined, types: Map<string, Node>, seen = 0): Node[] | null {
  if (!type || seen > 4) return null;
  if (type.type === "TSTypeLiteral" || type.type === "TSInterfaceBody") {
    return type.body ?? type.members;
  }
  if (type.type === "TSTypeReference" && type.typeName?.type === "Identifier") {
    return membersOf(types.get(type.typeName.name), types, seen + 1);
  }
  if (type.type === "TSInterfaceDeclaration") {
    const inherited: Node[] = [];
    for (const heritage of type.extends ?? []) {
      // A base we cannot see would silently drop its props. Refuse instead.
      const base = membersOf(types.get(heritage.expression?.name), types, seen + 1);
      if (!base) return null;
      inherited.push(...base);
    }
    return [...inherited, ...(type.body?.body ?? [])];
  }
  // `Props & { extra: string }`
  if (type.type === "TSIntersectionType") {
    const all: Node[] = [];
    for (const part of type.types) {
      const members = membersOf(part, types, seen + 1);
      if (!members) return null;
      all.push(...members);
    }
    return all;
  }
  return null;
}

function isComponent(node: Node): boolean {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression"
  );
}

/** Find the declaration a build entry points at: `default`, or a named export. */
function findExport(body: Node[], exportName: string): Node | null {
  if (exportName === "default") {
    const node = body.find((n) => n.type === "ExportDefaultDeclaration");
    if (!node) return null;
    if (isComponent(node.declaration)) return node.declaration;
    // `const C: FC<Props> = …; export default C`
    if (node.declaration.type === "Identifier") return findVariable(body, node.declaration.name);
    return null;
  }
  for (const raw of body) {
    if (raw.type !== "ExportNamedDeclaration" || !raw.declaration) continue;
    const declaration = raw.declaration;
    if (declaration.type === "FunctionDeclaration" && declaration.id?.name === exportName) {
      return declaration;
    }
    if (declaration.type === "VariableDeclaration") {
      const match = declaration.declarations.find((d: Node) => d.id?.name === exportName);
      if (match) return match;
    }
  }
  return findVariable(body, exportName);
}

function findVariable(body: Node[], name: string): Node | null {
  for (const raw of body) {
    const node = raw.type === "ExportNamedDeclaration" && raw.declaration ? raw.declaration : raw;
    if (node.type !== "VariableDeclaration") continue;
    const match = node.declarations.find((d: Node) => d.id?.name === name);
    if (match) return match;
  }
  return null;
}

/**
 * The props type of a component declaration: the first parameter's annotation,
 * or the type argument of an `FC<Props>`-style annotation on the variable.
 */
/**
 * The function a declaration really is, seeing through one layer of wrapper —
 * `memo(...)`, `forwardRef(...)`, `observer(...)`. Without this a wrapped
 * component reads as taking no props at all.
 */
function componentFn(declaration: Node): Node | undefined {
  if (isComponent(declaration)) return declaration;
  const init = declaration.init;
  if (init && isComponent(init)) return init;
  if (init?.type === "CallExpression") {
    const inner = init.arguments?.find((argument: Node) => isComponent(argument));
    if (inner) return inner;
  }
  return undefined;
}

function propsType(declaration: Node): Node | undefined {
  const annotation = componentFn(declaration)?.params?.[0]?.typeAnnotation?.typeAnnotation;
  if (annotation) return annotation;
  // `const C: FC<Props> = …` and `const C = memo<Props>(…)`.
  return (
    declaration.id?.typeAnnotation?.typeAnnotation?.typeArguments?.params?.[0] ??
    declaration.init?.typeArguments?.params?.[0]
  );
}

/** Names a component destructures, when it carries no usable types. */
function destructuredNames(declaration: Node): string[] {
  const param = componentFn(declaration)?.params?.[0];
  if (param?.type !== "ObjectPattern") return [];
  return param.properties
    .filter((p: Node) => p.type === "Property" && p.key?.type === "Identifier")
    .map((p: Node) => p.key.name);
}

/**
 * A component that takes no argument genuinely has no props. A wrapper call we
 * could not see inside is a different thing entirely — we do not know what it
 * takes, so the caller must refuse rather than publish an empty table.
 */
function takesProps(declaration: Node): boolean | "unknown" {
  const fn = componentFn(declaration);
  if (fn) return Boolean(fn.params?.length) || Boolean(propsType(declaration));
  // Not a function we recognise — an opaque call, a tagged template, a bare
  // identifier. We cannot know what it accepts, so we must not claim nothing.
  return propsType(declaration) ? true : "unknown";
}

function toSpec(name: string, kind: PropKind): PropSpec {
  if (kind === "event" || /^on[A-Z]/.test(name)) {
    return { name, kind: "event", event: eventName(name) };
  }
  return { name, attribute: kebab(name), kind };
}

/** Vue's runtime prop declarations name their type with a constructor. */
const VUE_CTOR: Record<string, PropKind> = {
  String: "string",
  Number: "number",
  Boolean: "boolean",
  Array: "json",
  Object: "json",
  Function: "event",
};

/**
 * `export default { props, emits }` and its `defineComponent(...)` wrapper —
 * the Options API, which carries its contract at runtime rather than in types.
 */
function vueOptions(body: Node[]): PropSpec[] | null {
  const exported = body.find((n) => n.type === "ExportDefaultDeclaration")?.declaration;
  if (!exported) return null;
  const object = exported.type === "CallExpression" ? exported.arguments?.[0] : exported;
  if (object?.type !== "ObjectExpression") return null;

  // `mixins`, `extends` and a spread all bring props and emits we cannot see.
  // Publishing what is left would drop the inherited half without a word.
  for (const property of object.properties) {
    if (property.type === "SpreadElement") return null;
    const key = keyOf(property);
    if (key === "mixins" || key === "extends") return null;
  }

  const entry = (key: string) =>
    object.properties.find((p: Node) => p.type === "Property" && keyOf(p) === key)?.value;

  const declaredProps = entry("props");
  const specs: PropSpec[] = [];
  if (declaredProps?.type === "ArrayExpression") {
    for (const element of declaredProps.elements) {
      if (typeof element?.value !== "string") return null;
      specs.push(toSpec(element.value, "auto"));
    }
  } else if (declaredProps?.type === "ObjectExpression") {
    for (const property of declaredProps.properties) {
      const name = keyOf(property);
      if (!name) return null;
      // `balance: Number` or `balance: { type: Number }`.
      const value = property.value;
      const ctor =
        value?.type === "ObjectExpression"
          ? value.properties.find((q: Node) => keyOf(q) === "type")?.value?.name
          : value?.name;
      specs.push(toSpec(name, ctor ? (VUE_CTOR[ctor] ?? "json") : "auto"));
    }
  } else if (declaredProps) {
    // Props behind a variable or spread: unreadable, so refuse.
    return null;
  }

  const declaredEmits = entry("emits");
  if (declaredEmits?.type === "ArrayExpression") {
    for (const element of declaredEmits.elements) {
      if (typeof element?.value !== "string") return null;
      specs.push({ name: onProp(element.value), kind: "event", event: element.value });
    }
  } else if (declaredEmits) {
    return null;
  }

  return specs.length || declaredProps || declaredEmits ? specs : null;
}

/** `view-details` → `onViewDetails`, the prop Vue's `emit()` actually calls. */
function onProp(event: string): string {
  return `on${event.replace(/(^|-)([a-z])/g, (_m, _dash, char: string) => char.toUpperCase())}`;
}

/** The `<script>` halves of an SFC, which is where all the types live. */
function scriptOf(code: string): string {
  const blocks = [...code.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  return blocks.join("\n");
}

/** `label` or `'aria-label'` — both name a prop. */
function keyOf(node: Node): string | null {
  if (node.key?.type === "Identifier") return node.key.name;
  if (node.key?.type === "Literal" && typeof node.key.value === "string") return node.key.value;
  return null;
}

function specsFrom(members: Node[], types: Map<string, Node>): PropSpec[] {
  const specs: PropSpec[] = [];
  for (const member of members) {
    if (member.type !== "TSPropertySignature" && member.type !== "TSMethodSignature") continue;
    const name = keyOf(member);
    if (!name) continue;
    // Method syntax declares a callback just as much as a function-typed
    // property does; dropping it would lose the prop and its DOM event.
    specs.push(
      member.type === "TSMethodSignature"
        ? toSpec(name, "event")
        : toSpec(name, kindOf(member.typeAnnotation?.typeAnnotation, types)),
    );
  }
  return specs;
}

/**
 * `defineProps<T>()` / `defineEmits<T>()`, wherever it sits — including inside
 * `withDefaults(defineProps<T>(), { … })`, which is how a Vue component with
 * default values is normally written.
 */
function macroCall(body: Node[], macro: string): Node | undefined {
  const find = (node: Node | undefined, depth = 0): Node | undefined => {
    if (!node || node.type !== "CallExpression" || depth > 3) return undefined;
    if (node.callee?.name === macro) return node;
    for (const argument of node.arguments ?? []) {
      const nested = find(argument, depth + 1);
      if (nested) return nested;
    }
    return undefined;
  };
  for (const raw of body) {
    if (raw.type !== "VariableDeclaration" && raw.type !== "ExpressionStatement") continue;
    const roots =
      raw.type === "VariableDeclaration"
        ? raw.declarations.map((d: Node) => d.init)
        : [raw.expression];
    for (const root of roots) {
      const call = find(root);
      if (call) return call;
    }
  }
  return undefined;
}

/**
 * `defineEmits<{ (e: 'view-details', payload: X): void }>()` and its newer
 * `{ 'view-details': [X] }` spelling both name the events; Vue delivers each
 * one by calling the matching `onEventName` prop.
 */
function vueEvents(body: Node[], types: Map<string, Node>): PropSpec[] | null {
  const call = macroCall(body, "defineEmits");
  if (!call) return [];

  // `defineEmits(['view-details'])` — the runtime array spelling.
  const array = call.arguments?.[0];
  if (array?.type === "ArrayExpression") {
    const names = array.elements.map((element: Node) => element?.value);
    return names.every((name: unknown) => typeof name === "string")
      ? names.map((event: string) => ({ name: onProp(event), kind: "event" as const, event }))
      : null;
  }

  const members = membersOf(call.typeArguments?.params?.[0], types);
  if (!members) return null;
  const names = members.flatMap((m: Node) => {
    if (m.type === "TSPropertySignature") return [m.key?.value ?? m.key?.name];
    // A call signature spells the event as its first parameter's literal type.
    const literal = m.params?.[0]?.typeAnnotation?.typeAnnotation?.literal?.value;
    return literal ? [literal] : [];
  });
  if (!names.every((name: unknown) => typeof name === "string")) return null;
  return names.map((event: string) => ({ name: onProp(event), kind: "event" as const, event }));
}

/** Svelte 5: `let { … }: Props = $props()`. */
function svelteProps(body: Node[]): Node | null {
  for (const raw of body) {
    if (raw.type !== "VariableDeclaration") continue;
    for (const declarator of raw.declarations) {
      if (declarator.init?.type === "CallExpression" && declarator.init.callee?.name === "$props") {
        return declarator;
      }
    }
  }
  return null;
}

export interface ExtractOptions {
  /** Path or filename. Its extension selects the component dialect. */
  file?: string;
  /** Named export to read, for `.tsx`/`.ts` components. Defaults to the default export. */
  exportName?: string;
}

/**
 * Read a component's prop table from its source. This is what lets the element
 * expose real attributes, real properties and real events without the author
 * restating anything they already wrote — in React, Vue or Svelte.
 *
 * Returns `null` when the component takes props but none of them could be read —
 * the caller must fail loudly rather than publish an element that silently
 * ignores everything the consumer sets.
 *
 * Analysis is single-file. A props type imported from another module reads as
 * `null`; declare `props` on the element entry for those.
 */
export function extractProps(code: string, options: ExtractOptions = {}): PropSpec[] | null {
  const file = options.file ?? "component.tsx";
  const sfc = /\.(vue|svelte)$/.exec(file)?.[1];
  const source = sfc ? scriptOf(code) : code;
  const body = parseAst(source, { lang: sfc ? "ts" : "tsx" }).body as unknown as Node[];
  const types = localTypes(body);

  if (sfc === "vue") {
    // Either half being unreadable means an incomplete contract, so refuse
    // rather than publish an element missing half of what the author declared.
    const events = vueEvents(body, types);
    if (!events) return null;
    const call = macroCall(body, "defineProps");
    if (call) {
      const members = membersOf(call.typeArguments?.params?.[0], types);
      if (!members) return null;
      return [...specsFrom(members, types), ...events];
    }
    // No `<script setup>` macros: an Options API component declares its
    // contract at runtime instead.
    const options = vueOptions(body);
    if (options) return [...options, ...events];
    return events.length ? events : null;
  }

  if (sfc === "svelte") {
    const declarator = svelteProps(body);
    if (!declarator) return null;
    const declared = declarator.id?.typeAnnotation?.typeAnnotation;
    const members = membersOf(declared, types);
    if (members) return specsFrom(members, types);
    if (declared) return null;
    const names = (declarator.id?.properties ?? [])
      .filter((p: Node) => p.type === "Property" && p.key?.type === "Identifier")
      .map((p: Node) => p.key.name);
    return names.length ? names.map((name: string) => toSpec(name, "auto")) : null;
  }

  const declaration = findExport(body, options.exportName ?? "default");
  if (!declaration) return null;
  const declared = propsType(declaration);
  const members = membersOf(declared, types);
  if (members) return specsFrom(members, types);
  // The author declared a type we could not resolve. Reading the destructuring
  // pattern instead would publish whichever props they happened to name and
  // silently drop the rest, including everything behind a rest element.
  if (declared) return null;
  const destructured = destructuredNames(declaration);
  if (destructured.length) return destructured.map((name) => toSpec(name, "auto"));
  return takesProps(declaration) === false ? [] : null;
}
