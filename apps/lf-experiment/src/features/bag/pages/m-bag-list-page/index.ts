import { MElement } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { globalStyleSheet } from "../../../../styles/global-styles";
import { html, render } from "uhtml";
import "@maxhill/components/m-fit-text";
import "../../components/m-club-list";
import "../../components/m-shot-type-list";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Bag list page - shows tabs for clubs and shot-types
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
          
          <div class="content">
            <m-club-list interactive class="club-list"></m-club-list>
            <m-shot-type-list interactive class="shot-type-list"></m-shot-type-list>
          </div>
        </div>
      `
    );
  }
}

export default MBagListPage;
