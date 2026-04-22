import { BindAttribute, MElement, query } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { globalStyleSheet } from "../../../styles/global-styles";
import { html, render } from "../../../vendor/uhtml/src/dom/index.js";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * @customElement
 * @tagname m-listing-page
 *
 * @slot - Default slot for component content
 *
 * @attr {string} example - An example property
 *
 * @prop {string} example - An example property
 */
export class MListingPage extends MElement {
  static tagName = "m-listing-page";

  @BindAttribute()
  example: string = "";

  @query("slot")
  private defaultSlot!: HTMLSlotElement;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
  }

  connectedCallback() {
    this.render();
  }

  private render() {
    render(
      this.shadowRoot!,
      html`
        <p>m-listing-page</p>
        <slot></slot>

        <div class="grid" data-cols="2" data-gap="4">
          <m-club-list></m-club-list>
          <m-shot-type-list></m-shot-type-list>

          <a href="/bag/club/add" aria-label="Add a new club to your bag">Add club</a>
          <a href="/bag/shot-type/add" aria-label="Add a new shot type">Add shot type</a>
        </div>
      `,
    );
  }
}

export default MListingPage;
