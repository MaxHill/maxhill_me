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
 * 
 * @example
 * Basic
 * <m-card>
 *   <div slot="title">Card Title</div>
 *   <p>This is the main content of the card.</p>
 *   <div slot="footer">Card footer</div>
 * </m-card>
 * 
 * @example
 * Outline variant
 * <m-card data-variant="outline">
 *   <div slot="title">Outline Card</div>
 *   <p>This card has an outline variant.</p>
 *   <div slot="footer">Footer info</div>
 * </m-card>
 * 
 * @example
 * Subgrid layout
 * <div class="collection">
 *   <m-card data-subgrid="true">
 *     <div slot="title">Card 1</div>
 *     <p>Content</p>
 *     <div slot="footer">Footer</div>
 *   </m-card>
 *   <m-card data-subgrid="true">
 *     <div slot="title">Card 2</div>
 *     <p>Content</p>
 *     <div slot="footer">Footer</div>
 *   </m-card>
 * </div>
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
            ${useSubgrid
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
