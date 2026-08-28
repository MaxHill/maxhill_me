/**
 * Section registry — single source of truth for component doc sections.
 * Used by ComponentsLayout (keyboard shortcuts, statusbar) and [component].astro (tabs).
 */

import type { ComponentData } from "../../utils/get-component-data";
import type { ComponentExample } from "../../utils/get-component-examples";

export interface SectionContext {
  comp: ComponentData;
  examples: ComponentExample[];
}

export interface Section {
  /** Tab panel ID (e.g. "overview", "css-parts") */
  id: string;
  /** Display label for tabs and command palette */
  label: string;
  /** Keyboard shortcut key (pressed after leader) */
  key: string;
  /** Returns true when the section has no content to show */
  isEmpty?: (ctx: SectionContext) => boolean;
}

export const SECTIONS: Section[] = [
  { id: "overview", label: "Overview", key: "o" },
  {
    id: "examples",
    label: "Examples",
    key: "x",
    isEmpty: ({ examples }) => examples.slice(1).length === 0,
  },
  {
    id: "properties",
    label: "Properties",
    key: "p",
    isEmpty: ({ comp }) => comp.properties.length === 0,
  },
  { id: "methods", label: "Methods", key: "m", isEmpty: ({ comp }) => comp.methods.length === 0 },
  { id: "events", label: "Events", key: "e", isEmpty: ({ comp }) => comp.events.length === 0 },
  { id: "slots", label: "Slots", key: "s", isEmpty: ({ comp }) => comp.slots.length === 0 },
  {
    id: "css-parts",
    label: "CSS Parts",
    key: "c",
    isEmpty: ({ comp }) => comp.cssParts.length === 0,
  },
];
