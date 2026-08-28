import {
  type Component,
  type ComponentEvent,
  type CssPart,
  getComponentByTagName,
  getComponentEventsWithType,
  getComponentPublicMethods,
  getComponentPublicProperties,
  type Method,
  type Property,
  type Slot,
} from "@wc-toolkit/cem-utilities";
import customElements from "@maxhill/components/custom-elements.json";

export interface ComponentData {
  tagName: string;
  description: string;
  properties: Array<{ name: string; type: string; default: string; description: string }>;
  methods: Array<{ name: string; type: string; description: string }>;
  events: Array<{ name: string; type: string; description: string }>;
  slots: Array<{ name: string; description: string }>;
  cssParts: Array<{ name: string; description: string }>;
  formAssociated: boolean;
}

interface CemManifest {
  modules?: Array<{
    declarations?: Array<{ tagName?: string }>;
  }>;
}

// ═══════════════════════════════════════
// SINGLE PARSE
// ═══════════════════════════════════════

function parseComponent(tagName: string, cem: unknown): ComponentData | undefined {
  const comp = getComponentByTagName(cem, tagName);
  if (!comp) {
    return undefined;
  }

  const properties = (getComponentPublicProperties(comp) || []).map((p: Property) => ({
    name: p.name || "—",
    type: p.type?.text || "—",
    default: p.default ?? "—",
    description: p.description || "",
  }));

  const methods = (getComponentPublicMethods(comp) || []).map((m: Method) => ({
    name: m.name || "—",
    type: m.return?.type?.text || "void",
    description: m.description || "",
  }));

  const events = (getComponentEventsWithType(comp, { overrideCustomEventType: true }) || [])
    .filter((e: ComponentEvent) => e.name)
    .map((e: ComponentEvent) => ({
      name: e.name,
      type: e.type?.text || "—",
      description: e.description || "",
    }));

  const slots = ((comp as Component & { slots?: Slot[] }).slots || []).map((s: Slot) => ({
    name: s.name || "",
    description: s.description || "",
  }));

  const cssParts = ((comp as Component & { cssParts?: CssPart[] }).cssParts || []).map((
    p: CssPart,
  ) => ({
    name: p.name || "—",
    description: p.description || "",
  }));

  const formAssociated =
    (comp as Component & { members?: Array<{ name?: string; static?: boolean; default?: string }> })
      .members?.some(
        (m: { name?: string; static?: boolean; default?: string }) =>
          m.name === "formAssociated" && m.static === true && m.default === "true",
      ) ?? false;

  return {
    tagName,
    description: (comp as Component & { description?: string }).description || "—",
    properties,
    methods,
    events,
    slots,
    cssParts,
    formAssociated,
  };
}

function extractTagNames(cem: CemManifest): string[] {
  const modules = cem.modules || [];
  const tagNames: string[] = [];
  for (const mod of modules) {
    for (const decl of mod.declarations || []) {
      if (decl.tagName) {
        tagNames.push(decl.tagName);
      }
    }
  }
  return tagNames;
}

// Parse once at module load
const TAG_NAMES = extractTagNames(customElements as unknown as CemManifest);
const ALL_COMPONENTS: ComponentData[] = TAG_NAMES
  .map((tagName) => parseComponent(tagName, customElements))
  .filter((c): c is ComponentData => c !== undefined);

const COMPONENT_MAP = new Map<string, ComponentData>(
  ALL_COMPONENTS.map((c) => [c.tagName, c]),
);

// ═══════════════════════════════════════
// PUBLIC ACCESSORS
// ═══════════════════════════════════════

export function getComponentData(tagName: string): ComponentData | undefined {
  return COMPONENT_MAP.get(tagName);
}

export function getAllComponents(): ComponentData[] {
  return ALL_COMPONENTS;
}

export function getAllComponentTagNames(): string[] {
  return TAG_NAMES;
}
