# Leader key and command palette integration

- **Status**: ready-for-agent
- **Created**: 2026-05-20

## Parent

`.scratch/component-docs-page.md`

## What to build

Add keyboard interaction to the components page:

1. **Leader key (`C-b`)**: When pressed, enters "command mode" for 1.5 seconds. During this window, pressing a section key switches the active tab:
   - `o` → overview
   - `x` → examples
   - `p` → properties
   - `m` → methods
   - `e` → events
   - `s` → slots
   - `c` → css parts
   - `space` → open command palette

2. **Visual feedback**: When leader mode is active, the statusbar mode indicator changes to "COMMAND" with destructive coloring. Resets after timeout or after a key is handled.

3. **Command palette**: Opens `m-command-palette` in a `<dialog>`. Lists all component names. Selecting one navigates to that component's page (normal link navigation). Uses `m-command` registration for discoverability.

4. **Key handling**: Ignore keypresses when focus is in an `<input>` or similar. All shortcuts should be registered via `registerCommand` from `@maxhill/components/m-command` so they appear in the palette.

Reference: prototype v5 script block for leader key handling and command registration patterns.

## Acceptance criteria

- [ ] `C-b` activates leader mode with visual feedback in statusbar
- [ ] Section keys switch tabs during leader mode
- [ ] `C-b space` opens command palette dialog
- [ ] Command palette lists all components and navigates on selection
- [ ] Leader mode times out after 1.5s if no key pressed
- [ ] Keypresses in input fields are ignored
- [ ] Commands are registered via `registerCommand` and discoverable in palette

## Blocked by

- `.scratch/005-component-page-template.md`
