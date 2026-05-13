import { MElement } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { globalStyleSheet } from "../../../styles/global-styles";
import { html, render } from "lit-html";
import "@maxhill/components/m-fit-text";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Landing page - links to the app's main features.
 * Route: /
 *
 * @customElement
 * @tagname m-landing-page
 */
export class MLandingPage extends MElement {
  static tagName = "m-landing-page";

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
      html`
        <div class="page-container">
          <m-fit-text font-display class="title">Max Hill</m-fit-text>
          <p class="intro">
            Practice tools for the range and the green.
          </p>
        </div>
      `,
      this.shadowRoot!,
    );
  }
}

export default MLandingPage;
