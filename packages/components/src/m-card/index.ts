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
 * 
 * @prop {boolean} subgrid - Whether the card uses CSS subgrid layout
 */
class MCard extends MElement {
    static tagName = 'm-card';
    static observedAttributes = [ "data-subgrid"];

    @BindAttribute({ attribute: 'data-subgrid' })
    subgrid: boolean = false;


    @query('[slot="title"]', {dom: "light"})
    private titleSlot!: HTMLSlotElement;

    @query('[slot="footer"]', {dom: "light"})
    private footerSlot!: HTMLSlotElement;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        this.render();
    }

    attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown) {
        super.attributeChangedCallback(name, oldValue, newValue);
        if (this.shadowRoot) {
            this.render();
        }
    }

    render() {
        if (!this.shadowRoot) return;
        const rowCount = 1 + (this.titleSlot ? 1 : 0) + (this.footerSlot ? 1 : 0);

        const dynamicStyleSheet = new CSSStyleSheet();
        dynamicStyleSheet.replaceSync(`
          :host {
            ${this.subgrid
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
          ${this.titleSlot ? '<div class="title"><slot name="title"></slot></div>' : ""}
          <div class="content-wrapper">
            <slot></slot>
          </div>
          ${this.footerSlot ? '<div class="footer"><slot name="footer"></slot></div>' : ""}
        `;
    }
}

export default MCard;
