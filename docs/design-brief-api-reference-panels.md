# Design Brief: API Reference Panels (man-page style)

## 1. Feature Summary

Replace the current cramped HTML tables in the properties/methods/events/slots/CSS parts tabs with a `man`-page-inspired definition list layout. Optimized for reference lookup and discoverability across 1–19 entries per section, using the terminal aesthetic already established in the component docs.

## 2. Primary User Action

Scan for a specific property/method/event name, then read its type and description. Secondary: browse all entries to discover what's available.

## 3. Design Direction

Lean into the terminal/`man` page metaphor already present in the TUI layout (statusbar, leader key, terminal-wipe transitions). Each entry should feel like a well-formatted help entry — generous vertical rhythm, clear name prominence in terminal green, type as a secondary monospace annotation, description as readable prose below.

Differentiate from "just text on screen" through:
- **Color coding**: names in `--color-primary-text-colorful`, types in `--color-text-softer`, defaults clearly marked
- **Interactive hover**: subtle background highlight on each entry (like the existing table row hover) so users can track which entry they're reading
- **Visual grouping**: clear separation between entries using spacing (not borders/dividers) — breathing room is the separator
- **Section header**: small uppercase label at the top anchoring what column means what

## 4. Layout Strategy

```
SECTION HEADER (small, uppercase, display font)

NAME                    TYPE                DEFAULT
  Description text that can wrap to multiple lines
  and stays indented under the name.

NAME                    TYPE                DEFAULT
  Description text here.
```

- **Name**: left-aligned, bold/medium weight, primary green color, large enough to scan
- **Type + Default**: same line as name, pushed right or after a gap, smaller/softer
- **Description**: below name, indented, normal reading text, `--size-content-3` max-width
- **Entry spacing**: generous gap between entries (`--size-4` or `--size-5`) — entries are visually distinct blocks
- **No borders between entries** — whitespace creates rhythm

For methods: show return type and params. For events: show detail type. For slots: just name + description.

## 5. Key States

| State | Behavior |
|-------|----------|
| Default | All entries visible, relaxed spacing |
| Hover (entry) | Subtle background tint (`--color-primary-fill-softer`) on the entire entry block |
| Empty section | Tab is disabled (already handled) |
| Long type unions | Type wraps gracefully (monospace, softer color) |
| Many entries (15+) | No collapse — all visible, vertical scroll on panel handles it |
| No default value | Show `—` or omit the default segment |
| No description | Show name + type only, no empty line below |

## 6. Interaction Model

- **Hover on entry**: background highlight fades in (80ms ease-out, matching sidebar transition)
- **No click interaction** on entries themselves (this is reference, not interactive)
- **Scroll**: natural panel scroll for long lists
- **Keyboard**: standard page scroll, no custom keyboard per entry

## 7. Content Requirements

**Section headers** (one per tab):
- Properties: `NAME`, `TYPE`, `DEFAULT`
- Methods: `NAME`, `RETURNS`
- Events: `NAME`, `DETAIL TYPE`
- Slots: `NAME`
- CSS Parts: `NAME`

Description text comes directly from CEM — no editing needed.

Defaults should show the literal value (`""`, `'top'`, `false`, `[]`) or `—` if none.

## 8. Recommended References

- `spatial-design.md` — for the rhythm and spacing between entries
- `typography.md` — for the type scale relationships (name vs type vs description)
- `interaction-design.md` — for the hover state treatment

## 9. Open Questions

- Should the type signature be clickable/copyable for complex unions? (Probably not for MVP)
- For methods: show full parameter signature or just return type? (Suggest: show params inline like `setValue(value: string): void`)
- Do we want a subtle dotted leader line between name and type (like a table of contents), or just spacing?
