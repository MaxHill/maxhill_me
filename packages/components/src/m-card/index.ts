import { MElement } from "../utils/m-element";
import { query } from "../utils/query";
import { BindAttribute } from "../utils/reflect-attribute";
import styles from "./index.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * A card component with support for title, content, and footer sections.
 *
 * @customElement
 * @tagname m-card
 *
 * @slot - Default slot for card content
 * @slot title - Optional slot for card title
 * @slot footer - Optional slot for card footer
 *
 * @attr {boolean} data-rounded - Applies rounded corners to the card
 * @attr {boolean} data-padded - Applies padding to the card
 * @attr {"outline"} data-variant - The visual variant of the card
 * @attr {boolean} data-subgrid - Enables CSS subgrid layout for the card
 * @attr {string} href - Optional URL to make the card clickable
 * @attr {string} target - Optional target for the link (_blank, _self, etc.)
 *
 * @prop {boolean} subgrid - Whether the card uses CSS subgrid layout
 * @prop {string} href - URL for clickable card
 * @prop {string} target - Link target attribute
 */
class MCard extends MElement {
  static tagName = "m-card";
  static observedAttributes = ["data-subgrid", "href", "target"];

  @BindAttribute({ attribute: "data-subgrid" })
  subgrid: boolean = false;

  @BindAttribute({ attribute: "href" })
  href: string = "";

  @BindAttribute({ attribute: "target" })
  target: string = "";

  private internals: ElementInternals;

  @query('[slot="title"]', { dom: "light" })
  private titleSlot!: HTMLSlotElement;

  @query('[slot="footer"]', { dom: "light" })
  private footerSlot!: HTMLSlotElement;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.internals = this.attachInternals();
  }

  connectedCallback() {
    this.render();
    this.setupLinkBehavior();
  }

  attributeChangedCallback(
    name: string,
    oldValue: unknown,
    newValue: unknown,
  ) {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (this.shadowRoot) {
      this.render();
    }
    if (name === "href") {
      this.setupLinkBehavior();
    }
  }

  disconnectedCallback() {
    this.removeEventListener("click", this.handleClick);
    this.removeEventListener("keydown", this.handleKeydown);
  }

  private setupLinkBehavior() {
    if (this.href) {
      // Use ElementInternals to set role and make the host focusable
      this.internals.role = "link";
      this.setAttribute("tabindex", "0");
      this.addEventListener("click", this.handleClick);
      this.addEventListener("keydown", this.handleKeydown);
    } else {
      this.internals.role = null;
      this.removeAttribute("tabindex");
      this.removeEventListener("click", this.handleClick);
      this.removeEventListener("keydown", this.handleKeydown);
    }
  }

  private handleClick = (e: MouseEvent) => {
    if (!this.href) return;

    // Don't interfere if clicking the internal link directly
    const path = e.composedPath();
    if (path.some((el) => el instanceof HTMLAnchorElement)) {
      return;
    }

    e.preventDefault();
    const link = this.shadowRoot?.querySelector("a");
    if (link) {
      link.click();
    }
  };

  private handleKeydown = (e: KeyboardEvent) => {
    if (!this.href) return;

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const link = this.shadowRoot?.querySelector("a");
      if (link) {
        link.click();
      }
    }
  };

  render() {
    if (!this.shadowRoot) return;
    const rowCount =
      1 + (this.titleSlot ? 1 : 0) + (this.footerSlot ? 1 : 0);

    const dynamicStyleSheet = new CSSStyleSheet();
    dynamicStyleSheet.replaceSync(`
          :host {
            ${
              this.subgrid
                ? `
              grid-template-rows: subgrid; 
              grid-row: span ${rowCount};
            `
                : ""
            }
          }
        `);
    this.shadowRoot.adoptedStyleSheets = [
      baseStyleSheet,
      dynamicStyleSheet,
    ];

    const content = `
          ${this.titleSlot ? '<div class="title"><slot name="title"></slot></div>' : ""}
          <div class="content-wrapper">
            <slot></slot>
          </div>
          ${this.footerSlot ? '<div class="footer"><slot name="footer"></slot></div>' : ""}
        `;

    if (this.href) {
      const targetAttr = this.target ? ` target="${this.target}"` : "";
      const relAttr =
        this.target === "_blank" ? ' rel="noopener noreferrer"' : "";
      this.shadowRoot.innerHTML = `
              <a href="${this.href}" class="card-link"${targetAttr}${relAttr}>
                ${content}
              </a>
            `;
    } else {
      this.shadowRoot.innerHTML = content;
    }
  }
}

export default MCard;
