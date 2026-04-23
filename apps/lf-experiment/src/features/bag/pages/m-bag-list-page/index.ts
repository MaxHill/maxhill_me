import { MElement } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { globalStyleSheet } from "../../../../styles/global-styles";
import { html, render } from "../../../../vendor/uhtml/src/dom/index.js";
import "@maxhill/components/m-fit-text";
import "../../components/m-club-list";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Bag list page - shows only club list
 * Route: /bag
 * 
 * @customElement
 * @tagname m-bag-list-page
 */
export class MBagListPage extends MElement {
  static tagName = "m-bag-list-page";

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
        <div class="page-container">
          <m-fit-text font-display class="title">Hardware</m-fit-text>
          <m-club-list interactive class="club-list"></m-club-list>
        </div>
      `
    );
  }
}

export default MBagListPage;
