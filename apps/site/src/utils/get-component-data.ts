import {
  getComponentByTagName,
  getComponentPublicProperties,
  getComponentPublicMethods,
  getComponentEventsWithType,
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

// ═══════════════════════════════════════
// SINGLE PARSE
// ═══════════════════════════════════════

function parseComponent(tagName: string, cem: any): ComponentData | undefined {
  const comp = getComponentByTagName(cem, tagName);
  if (!comp) return undefined;

  const properties = (getComponentPublicProperties(comp) || []).map((p: any) => ({
    name: p.name || "—",
    type: p.type?.text || "—",
    default: p.default ?? "—",
    description: p.description || "",
  }));

  const methods = (getComponentPublicMethods(comp) || []).map((m: any) => ({
    name: m.name || "—",
    type: m.return?.type?.text || "void",
    description: m.description || "",
  }));

  const events = (getComponentEventsWithType(comp, { overrideCustomEventType: true }) || [])
    .filter((e: any) => e.name)
    .map((e: any) => ({
      name: e.name,
      type: e.type?.text || "—",
      description: e.description || "",
    }));

  const slots = (comp.slots || []).map((s: any) => ({
    name: s.name || "",
    description: s.description || "",
  }));

  const cssParts = (comp.cssParts || []).map((p: any) => ({
    name: p.name || "—",
    description: p.description || "",
  }));

  const formAssociated = comp.members?.some(
    (m: any) => m.name === "formAssociated" && m.static === true && m.default === "true"
  ) ?? false;

  return {
    tagName,
    description: (comp as any).description || "—",
    properties,
    methods,
    events,
    slots,
    cssParts,
    formAssociated,
  };
}

function extractTagNames(cem: any): string[] {
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
const TAG_NAMES = extractTagNames(customElements);
const ALL_COMPONENTS: ComponentData[] = TAG_NAMES
  .map((tagName) => parseComponent(tagName, customElements))
  .filter((c): c is ComponentData => c !== undefined);

const COMPONENT_MAP = new Map<string, ComponentData>(
  ALL_COMPONENTS.map((c) => [c.tagName, c])
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
