import { BindAttribute, MElement, query } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { globalStyleSheet } from "../../../styles/global-styles";
import { html, render } from "../../../vendor/uhtml/src/dom/index.js";

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

  private render() {
    render(
      this.shadowRoot!,
      html`
          <m-club-list class="club-list"></m-club-list>
          <m-shot-type-list class="shot-type-list"></m-shot-type-list>
          <m-club-form class="form"></m-club-form>
      `,
    );
  }
}

export default MListingPage;
