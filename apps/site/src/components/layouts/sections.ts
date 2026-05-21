/**
 * Section registry — single source of truth for component doc sections.
 * Used by ComponentsLayout (keyboard shortcuts, statusbar) and [component].astro (tabs).
 */

export interface Section {
    /** Tab panel ID (e.g. "overview", "css-parts") */
    id: string;
    /** Display label for tabs and command palette */
    label: string;
    /** Keyboard shortcut key (pressed after leader) */
    key: string;
}

export const SECTIONS: Section[] = [
    { id: "overview", label: "Overview", key: "o" },
    { id: "examples", label: "Examples", key: "x" },
    { id: "properties", label: "Properties", key: "p" },
    { id: "methods", label: "Methods", key: "m" },
    { id: "events", label: "Events", key: "e" },
    { id: "slots", label: "Slots", key: "s" },
    { id: "css-parts", label: "CSS Parts", key: "c" },
];
