import cardStyles from "./card-element.css?inline";
const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(cardStyles);

class CardElement extends HTMLElement {
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
}

customElements.define("card-element", CardElement);
