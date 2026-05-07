/**
 * Module augmentation for uhtml v5.0.9.
 *
 * uhtml's published type definitions omit `Hole` from the `render()` signature,
 * but the library accepts it at runtime and documents it in the README:
 *   "render(where:Element, what:Function|Hole|Node)"
 *
 * This augmentation corrects the type to match the actual API.
 * Can be removed once the upstream types are fixed.
 */
import type { Hole } from "uhtml";

declare module "uhtml" {
  export function render(
    where: Element | DocumentFragment,
    what: Hole | Node | Function,
  ): Element | DocumentFragment;
}
