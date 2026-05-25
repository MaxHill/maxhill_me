# Design Brief: Component Documentation App

## 1. Feature Summary

A keyboard-driven, application-like component reference tool replacing the current blog-style documentation at `/components`. Designed for a developer who tabs back from an editor needing fast, precise answers about component APIs. Publicly visible as a demonstration of systematic technical craft.

## 2. Primary User Action

**Find a specific piece of component API information (prop type, event name, slot, CSS part) in under 3 seconds.**

## 3. Design Direction

**Feel**: A TUI running in a modern terminal emulator — dense, fast, keyboard-first, zero decoration. Think `lazygit`, `k9s`, or Neovim's built-in LSP hover docs.

**Aesthetic expression**: Leans hard into the existing terminal/Swiss direction from `.impeccable.md`. Monospace throughout, no border radius, minimal color (green accents for active/focused states). The page itself should feel like a well-designed CLI tool — status bar at the bottom showing available keys, collapsible panes, instant transitions.

**Differentiation from current**: Moves from "article you read" to "tool you operate."

## 4. Layout Strategy

**Single-page application feel** (within Astro's static architecture):

- **Top**: Component selector/switcher — compact, always visible. Shows current component name + quick-switch affordance.
- **Main area**: Collapsible sections for each API category (Properties, Methods, Events, Slots, CSS Parts, Examples). Only one or two expanded at a time. Each section is dense tabular data, not prose.
- **Bottom status bar**: Shows available keyboard shortcuts contextually (like a TUI footer). e.g., `[p]rops [e]vents [s]lots [c]ss-parts [/]search [tab]switch`
- **Command palette overlay**: Triggered by `Cmd+K` or `/`, searches across all components and their members (jump to "m-listbox > Events" directly).

**Hierarchy**: Component name (large, Departure Mono) > Section headers (medium) > API tables (body, dense).

## 5. Key States

| State | User sees/feels |
|-------|----------------|
| **Default** | Current component with Properties section expanded, status bar showing keys |
| **Section navigation** | Pressing `e` collapses current section, expands Events with smooth (fast) transition |
| **Command palette open** | Overlay with search input, fuzzy-matched results showing `component > section > member` |
| **Switching component** | Palette filtered to component names, or `Tab`/dedicated key cycles through recent |
| **Empty section** | Compact "No [events] defined" inline — no large empty state |
| **Loading** | Not applicable (static site, all content present) |
| **First visit** | Brief hint overlay or visible status bar teaches the shortcuts exist |

## 6. Interaction Model

- **`/` or `Cmd+K`**: Opens command palette (uses `m-command-palette`)
- **`p`, `e`, `s`, `m`, `c`**: Jump to Properties, Events, Slots, Methods, CSS Parts sections
- **`Esc`**: Close palette / collapse current section
- **`[` / `]` or `n` / `N`**: Previous/next component
- **Arrow keys**: Navigate within expanded section (rows in table)
- **`Enter` on a row**: Expand inline detail (full description, type signature)
- **Click**: Everything also works with mouse for non-keyboard users
- **Status bar**: Always shows contextual available actions

All shortcuts registered via `m-command` elements, discoverable through the palette.

## 7. Content Requirements

**Per component**:
- Tag name + one-line summary (from Custom Elements Manifest)
- Metadata badges: form-associated, shadow DOM, slots count
- **Properties table**: Name, Type, Default, Description
- **Methods table**: Name, Parameters, Return, Description
- **Events table**: Name, Detail type, Description, When fired
- **Slots table**: Name, Description
- **CSS Parts table**: Name, Description

**Copy**: Minimal UX copy needed. The status bar labels are the primary microcopy. First-visit hint: "Keyboard shortcuts available — press `?` for help"

**Dynamic content**: 0–~20 props per component, 0–5 events, 0–5 slots typical. Tables should feel natural at both 2 rows and 15 rows.

## 8. Implementation Constraints

### Must use internal packages

- **`@maxhill/components`** (`packages/components/`): Use existing web components where applicable — especially `m-command` for keyboard shortcuts, `m-command-palette` for the command palette overlay, `m-search-list` for filtering, `m-listbox`/`m-option` for selection, `m-tab`/`m-tab-list`/`m-tab-panel` if tabbed UI is needed.
- **`@maxhill/css`** (`packages/css/`): Use existing design tokens (spacing, color, typography) and utility styles. Do not introduce ad-hoc values — all spacing, color, and type sizing must reference the token system.

### Technical stack
- **Framework**: Astro static site with Web Components
- **Data source**: Custom Elements Manifest (`custom-elements.json`) generated from `packages/components/`
- **Performance**: Minimal JS, leverage platform APIs, static where possible

## 9. Recommended References

When implementing with `/impeccable craft`:
- `interaction-design.md` — keyboard navigation patterns, focus management
- `spatial-design.md` — dense tabular layouts with rhythm
- `motion-design.md` — fast section expand/collapse transitions
- `ux-writing.md` — status bar labels, empty states

## 10. Open Questions

1. **URL strategy**: Should each component remain its own route (`/components/button`) or become a single-page app with hash/query routing (`/components?c=button&s=events`)? Route-per-component preserves linkability but single-page feels more "app."
2. **Persistence**: Should last-viewed component and expanded section persist across visits (localStorage)?
3. **Search depth**: Should the command palette search into prop/event *names* (e.g., typing "disabled" finds `m-input > Properties > disabled`), or only component-level?
4. **Code examples**: Keep them as a collapsible section per component, or separate them into a dedicated "Examples" view?
5. **`m-command-palette` scope**: Build it out as part of this project (it's currently minimal), or stub it and iterate later?
