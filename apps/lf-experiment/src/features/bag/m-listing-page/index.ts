import { BindAttribute, MElement, query } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { globalStyleSheet } from "../../../styles/global-styles";
import { html, render } from "../../../vendor/uhtml/src/dom/index.js";

import "@maxhill/components/m-fit-text";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * @customElement
 * @tagname m-listing-page
 */
export class MListingPage extends MElement {
  static tagName = "m-listing-page";

  selectedClub: string |null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
  }

  connectedCallback() {
    this.render();
  }

  selectClub(e: MListboxChangeEvent) {
    this.selectedClub = e.detail.selected[0] || null
    console.log("selected", this.selectedClub)
    this.render();
  }

  private render() {
      console.log("Render:", this.selectedClub)
    render(
      this.shadowRoot!,
      html`
          <m-fit-text font-display>Hardware</m-fit-text>
          <m-club-list @m-listbox-change${(e) => this.selectClub(e)} class="club-list"></m-club-list>
          ${ ' ' || '<m-shot-type-list class="shot-type-list"></m-shot-type-list>'}

          ${this.selectedClub ? html`<m-club-form club-key=${this.selectedClub} class="form"></m-club-form>` : html`<m-club-form class="form"></m-club-form>`}
      `,
    );
  }
}

export default MListingPage;
