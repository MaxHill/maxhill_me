import styles from "./index.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * A card component with support for title, content, and footer sections.
 *
 * <m-card>
 *   <div slot="title">Card Element Title</div>
 *   <p>This is the main content of the card element.</p>
 *   <p>It uses web components with shadow DOM.</p>
 *   <div slot="footer">Card element footer</div>
 * </m-card>
 * 
 * <m-card data-variant="outline">
 *   <div slot="title">Outline Variant</div>
 *   <p>This card element has a outline variant.</p>
 *   <div slot="footer">Footer info</div>
 * </m-card>
 * 
 * <m-card>
 *   <div slot="title">Card Element with Title Only</div>
 *   <p>This card element has a title but no footer.</p>
 * </m-card>
 * 
 * <m-card>
 *   <p>Card Element with Content Only</p>
 *   <p>No title or footer, just content.</p>
 * </m-card>
 * 
 * **Card Elements in a `.collection`**
 * 
 * <div class="collection">
 *   <m-card data-subgrid="true">
 *     <div slot="title">Card Element 1</div>
 *     <div class="stack2">
 *       <p>This is the main content.</p>
 *       <p>Using web components.</p>
 *       <p>More text</p>
 *     </div>
 *     <div slot="footer">Footer info</div>
 *   </m-card>
 *   <m-card data-subgrid="true">
 *     <div slot="title">Card Element 2</div>
 *     <div class="stack2">
 *       <p>This is the main content.</p>
 *       <p>Using web components.</p>
 *     </div>
 *     <div slot="footer">Footer info</div>
 *   </m-card>
 *   <m-card data-subgrid="true">
 *     <div slot="title">Card Element 3</div>
 *     <div class="stack2">
 *       <p>Shorter content.</p>
 *     </div>
 *     <div slot="footer">Footer info</div>
 *   </m-card>
 *   <m-card data-subgrid="true">
 *     <div slot="title">Card Element 4</div>
 *     <div class="stack2">
 *       <p>Another card.</p>
 *     </div>
 *     <div slot="footer">Footer info</div>
 *   </m-card>
 * </div>
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
