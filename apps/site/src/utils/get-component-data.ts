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

export function getComponentData(tagName: string): ComponentData | undefined {
  const comp = getComponentByTagName(customElements as any, tagName);
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

export function getAllComponents(): ComponentData[] {
  return getAllComponentTagNames().map(getComponentData).filter(Boolean) as ComponentData[];
}

export function getAllComponentTagNames(): string[] {
  const modules = (customElements as any).modules || [];
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
