import { BindAttribute, MElement } from "@maxhill/web-component-utils";
import patternStyles from "@maxhill/css/background-patterns.css?inline";
import styles from "./index.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

const patternStyleSheet = new CSSStyleSheet();
patternStyleSheet.replaceSync(patternStyles);

/**
 * A block container with a background pattern that brightens around the pointer.
 *
 * @customElement
 * @tagname m-bg-pattern
 * @slot - Content displayed above the grid
 * @attr {"lines" | "dots" | "diagonal" | "grid"} pattern - Background pattern (default: grid)
 * @prop {"lines" | "dots" | "diagonal" | "grid"} pattern - Background pattern
 * @attr {string} data-size - Spacing token: 1–15 or fluid-1–fluid-10 (default: utility spacing)
 * @prop {string} size - Spacing token reflected to data-size
 * @cssprop --bg-pattern-spot-size - Diameter of the cursor spotlight (default: 32.5rem)
 * @cssprop --bg-pattern-line-color - Grid line color (defaults to --color-text)
 */
class MBgPattern extends MElement {
  static tagName = "m-bg-pattern";

  @BindAttribute()
  pattern: "lines" | "dots" | "diagonal" | "grid" = "grid";

  @BindAttribute({ attribute: "data-size" })
  size: string = "";

  private spot: HTMLDivElement | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
    this.addEventListener("pointermove", this.handlePointerMove);
    this.addEventListener("pointerleave", this.handlePointerLeave);
  }

  attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown) {
    super.attributeChangedCallback(name, oldValue, newValue);
    if ((name === "pattern" || name === "data-size") && oldValue !== newValue) {
      this.updatePattern();
    }
  }

  disconnectedCallback() {
    this.removeEventListener("pointermove", this.handlePointerMove);
    this.removeEventListener("pointerleave", this.handlePointerLeave);
  }

  private updatePattern() {
    const supportedPatterns = ["lines", "dots", "diagonal", "grid"];
    const pattern = supportedPatterns.includes(this.pattern) ? this.pattern : "grid";
    this.shadowRoot?.querySelectorAll(".background-pattern").forEach((layer) => {
      layer.setAttribute("data-pattern", pattern);
      if (this.size) {
        layer.setAttribute("data-size", this.size);
      } else {
        layer.removeAttribute("data-size");
      }
    });
  }

  private handlePointerMove = (event: PointerEvent) => {
    if (!this.spot) return;
    const bounds = this.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    this.spot.style.left = `${x}px`;
    this.spot.style.top = `${y}px`;
    this.spot.style.setProperty("--_pointer-x", `${x}px`);
    this.spot.style.setProperty("--_pointer-y", `${y}px`);
    this.spot.style.opacity = "1";
  };

  private handlePointerLeave = () => {
    if (this.spot) this.spot.style.opacity = "0";
  };

  private render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.adoptedStyleSheets = [patternStyleSheet, baseStyleSheet];
    this.shadowRoot.innerHTML = `
      <div class="grid background-pattern" aria-hidden="true">
        <div class="spot background-pattern"></div>
      </div>
      <slot></slot>
    `;
    this.spot = this.shadowRoot.querySelector(".spot");
    this.updatePattern();
  }

  static define(tag = "m-bg-pattern", registry = customElements) {
    if (!registry.get(tag)) registry.define(tag, this);
    return this;
  }
}

MBgPattern.define();

export default MBgPattern;
