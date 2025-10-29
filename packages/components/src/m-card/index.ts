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
 * @attr {string} data-variant - The visual variant of the card
 * @attr {boolean} data-subgrid - Enables CSS subgrid layout for the card
 */
class MCard extends HTMLElement {
  static observedAttributes = [
    "data-rounded",
    "data-padded",
    "data-variant",
    "data-subgrid",
  ];

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  render() {
    if (!this.shadowRoot) return;

    const hasTitle = this.querySelector('[slot="title"]');
    const hasFooter = this.querySelector('[slot="footer"]');
    const rowCount = 1 + (hasTitle ? 1 : 0) + (hasFooter ? 1 : 0);
    const useSubgrid = this.getAttribute("data-subgrid") === "true";

    const dynamicStyleSheet = new CSSStyleSheet();
    dynamicStyleSheet.replaceSync(`
          :host {
            ${
              useSubgrid
                ? `
              grid-template-rows: subgrid; 
              grid-row: span ${rowCount};
            `
                : ""
            }
          }
        `);
    this.shadowRoot.adoptedStyleSheets = [baseStyleSheet, dynamicStyleSheet];

    this.shadowRoot.innerHTML = `
          ${hasTitle ? '<div class="title"><slot name="title"></slot></div>' : ""}
          <div class="content-wrapper">
            <slot></slot>
          </div>
          ${hasFooter ? '<div class="footer"><slot name="footer"></slot></div>' : ""}
        `;
  }

  static define(tag = 'm-card', registry = customElements) {
    if (!registry.get(tag)) {
      registry.define(tag, this);
    }
    return this;
  }
}

export default MCard;
