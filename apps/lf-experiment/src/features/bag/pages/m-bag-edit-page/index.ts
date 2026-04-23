import { BindAttribute, MElement } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { globalStyleSheet } from "../../../../styles/global-styles";
import { html, render } from "../../../../vendor/uhtml/src/dom/index.js";
import "@maxhill/components/m-fit-text";
import "../../components/m-club-list";
import "../../components/m-club-form";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Bag edit page - shows list + edit form
 * Route: /bag/edit/:clubKey
 * 
 * @customElement
 * @tagname m-bag-edit-page
 * 
 * @attr {string} club-key - The key of the club to edit
 */
export class MBagEditPage extends MElement {
  static tagName = "m-bag-edit-page";

  @BindAttribute({ attribute: "club-key" })
  clubKey: string = "";

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
          <m-club-form club-key=${this.clubKey} class="form"></m-club-form>
        </div>
      `
    );
  }
}

export default MBagEditPage;
